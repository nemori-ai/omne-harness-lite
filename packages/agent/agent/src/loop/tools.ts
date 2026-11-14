import { createHash } from 'node:crypto'
import {
  admissionPassageOf,
  decodeActionId,
  type Access,
  type Action,
  type ActionBatch,
  type ActionId,
  type ActionSlot,
  type ActionToolCall,
  type AdmissionDecision,
  type Adoption,
  type AgentCheckpoint,
  type AgentExecutionId,
  type Authority,
  type CardAnswer,
  type CardRemark,
  type ConsumerRef,
  type DecisionCardDraft,
  type DurableEvidence,
  type Failure,
  type Material,
  type PendingCall,
  type ProducedResult,
  type ReceivedEntry,
  type StepId,
} from '@omne-harness/agent-contract'
import type { BlockId, ContentBlock } from '@omne-harness/content-block'
import {
  resolveToolInvocationRef,
  type ToolCallId,
  type ToolInvokeRequest,
  type ToolDelivery,
} from '@omne-harness/tool-contract'
import { judgeToolInvokeRequest } from '@omne-harness/tool-contract/provider'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { AgentDependencies } from '../construction.ts'
import { canonical } from '../canonical.ts'
import { json, plain } from '../receiving-values.ts'
import { agentEvidence, toolConsumption, type Message } from './identities.ts'

type Ports<P> = Pick<AgentDependencies<P, ContentBlock>, 'admission' | 'toolRequests' | 'materials'>

export const fixedToolRequestSchema = {
  owner: 'agent',
  name: 'fixed-tool-request',
  revision: '1',
  digest: 'agent:fixed-tool-request/1',
} as const

export const toolCallAnswerSchema = {
  owner: 'agent',
  name: 'tool-call-answer',
  revision: '1',
  digest: 'agent:tool-call-answer/1',
} as const

function minted<T>(result: Outcome<T, unknown>): T {
  if ('failure' in result) throw new Error('invalid derived Tool action identity')
  return result.ok
}

function argumentsText(value: ActionToolCall['arguments']): string {
  switch (value.kind) {
    case 'null':
      return 'null'
    case 'string':
      return JSON.stringify(value.value)
    case 'boolean':
      return String(value.value)
    case 'number':
      return value.lexeme
    case 'array':
      return `[${value.items.map(argumentsText).join(',')}]`
    case 'object':
      return `{${value.entries.map(entry => `${JSON.stringify(entry.key)}:${argumentsText(entry.value)}`).join(',')}}`
  }
}

export function actionOf(step: StepId, original: ActionToolCall, ordinal: number): Action {
  const id = minted(decodeActionId(`${step}/tool/${ordinal}`))
  return {
    id,
    original: { callId: original.callId },
    effectiveArguments: argumentsText(original.arguments),
    call: null,
    judgment: { kind: 'pending', passage: minted(admissionPassageOf(id)) },
  }
}

export function toolConsumer(execution: AgentExecutionId, action: Action): ConsumerRef {
  return { owner: '@omne-harness/agent', work: execution, position: action.id, purpose: 'action' }
}

export type ToolAdmission =
  | Readonly<{ kind: 'judged'; action: Action }>
  | Readonly<{ kind: 'denied'; action: Action; reason: string }>
  | Readonly<{
      kind: 'allowed'
      action: Action
      evidence: DurableEvidence
      request: ToolInvokeRequest
    }>
  | Readonly<{ kind: 'asked'; action: Action; card: DecisionCardDraft; evidence: DurableEvidence }>
  | Readonly<{ kind: 'unavailable'; owner: string; diagnostic: string }>

export type HandBack = Readonly<{ card: DurableEvidence; answer: CardAnswer | CardRemark }>

const judged = (action: Action): Outcome<ToolAdmission, Failure> =>
  succeed({ kind: 'judged', action })

const unavailableAdmission = (owner: string, diagnostic: string): Outcome<ToolAdmission, Failure> =>
  succeed({ kind: 'unavailable', owner, diagnostic })

function asUnavailable(owner: string, failure: Failure): Outcome<ToolAdmission, Failure> {
  if (failure.kind === 'unavailable') return unavailableAdmission(failure.owner, failure.diagnostic)
  if (failure.kind === 'denied') return unavailableAdmission(owner, `denied ${failure.action}`)
  return fail(failure)
}

function notAllowed(
  action: Action,
  decision: Exclude<AdmissionDecision, { kind: 'allow' }>,
): Outcome<ToolAdmission, Failure> {
  if (decision.kind === 'deny')
    return succeed({
      kind: 'denied',
      action: { ...action, judgment: { kind: 'denied', evidence: decision.evidence } },
      reason: decision.reason,
    })
  if (decision.kind === 'unavailable')
    return unavailableAdmission('agentActionAdmission', decision.diagnostic)
  return succeed({ kind: 'asked', action, card: decision.card, evidence: decision.evidence })
}

export async function admitToolAction<P>(
  ports: Ports<P>,
  access: Access<P>,
  execution: AgentExecutionId,
  advance: Authority,
  action: Action,
  original: ActionToolCall,
  handBack: HandBack | null,
): Promise<Outcome<ToolAdmission, Failure>> {
  if (action.judgment.kind !== 'pending') return judged(action)
  if (original.callId !== action.original.callId)
    return fail({ kind: 'invalid', field: 'original', reason: 'not the tool call of the action' })
  if (ports.toolRequests === undefined)
    return unavailableAdmission('agentToolRequests', 'trusted Tool request source is unavailable')
  const input = {
    ...access,
    execution,
    action: action.id,
    original,
    effectiveArguments: action.effectiveArguments,
    consumer: toolConsumer(execution, action),
  }
  const described = await ports.toolRequests.describe(input)
  if ('failure' in described) return asUnavailable('agentToolRequests', described.failure)
  if (described.ok.kind === 'answered')
    return answered(ports, access, execution, action, described.ok.text)
  const { definition } = described.ok
  const admitted = await ports.admission.admit({
    ...input,
    advance,
    passage: action.judgment.passage,
    definition,
    permissions: [],
    decision: handBack,
  })
  if ('failure' in admitted) return asUnavailable('agentActionAdmission', admitted.failure)
  if (admitted.ok.kind !== 'allow') return notAllowed(action, admitted.ok)
  const prepared = await ports.toolRequests.prepare({
    ...input,
    definition,
    admission: admitted.ok.evidence,
  })
  if ('failure' in prepared) return asUnavailable('agentToolRequests', prepared.failure)
  const request = checkedRequest(prepared.ok, definition, input.consumer, action, original)
  if ('failure' in request) return request
  return succeed({ kind: 'allowed', action, evidence: admitted.ok.evidence, request: request.ok })
}

async function answered<P>(
  ports: Ports<P>,
  access: Access<P>,
  execution: AgentExecutionId,
  action: Action,
  text: string,
): Promise<Outcome<ToolAdmission, Failure>> {
  const stored = await ports.materials.preserve({
    ...access,
    execution,
    identity: `${execution}/${action.id}/answer/${createHash('sha256').update(text).digest('hex')}`,
    consumer: toolConsumer(execution, action),
    value: { kind: 'facts', schema: toolCallAnswerSchema, value: { kind: 'string', value: text } },
  })
  if ('failure' in stored) return stored
  const evidence = agentEvidence(`${execution}/${action.id}/answered`, stored.ok)
  return judged({ ...action, judgment: { kind: 'denied', evidence, answer: stored.ok } })
}

export function toolCallAnswerOf(material: Material<ContentBlock>): string | null {
  if (material.kind !== 'facts' || canonical(material.schema) !== canonical(toolCallAnswerSchema))
    return null
  return material.value.kind === 'string' ? material.value.value : null
}

export async function preserveAllowedRequest<P>(
  ports: Ports<P>,
  access: Access<P>,
  execution: AgentExecutionId,
  allowed: Extract<ToolAdmission, { kind: 'allowed' }>,
  scopeBudget: number,
): Promise<Outcome<Action, Failure>> {
  const { action, evidence } = allowed
  const request = { ...allowed.request, limits: { ...allowed.request.limits, scopeBudget } }
  const stored = await ports.materials.preserve({
    ...access,
    execution,
    identity: `${execution}/${action.id}/request`,
    consumer: request.consumer,
    value: { kind: 'facts', schema: fixedToolRequestSchema, value: json(request) },
  })
  if ('failure' in stored) return stored
  return succeed({ ...action, judgment: { kind: 'allowed', evidence, request: stored.ok } })
}

function uncheckedRecord(execution: AgentExecutionId, batch: ActionBatch): string {
  return `${execution}/${batch.id}/admission-unavailable`
}

export function deniedUnchecked(
  execution: AgentExecutionId,
  batch: ActionBatch,
  action: Action,
): boolean {
  return (
    action.judgment.kind === 'denied' &&
    action.judgment.evidence.record === uncheckedRecord(execution, batch)
  )
}

export function deniedForUnavailableAdmission(
  execution: AgentExecutionId,
  batch: ActionBatch,
  cause: Extract<ToolAdmission, { kind: 'unavailable' }>,
  actions: readonly Action[],
): readonly Action[] {
  const evidence = agentEvidence(uncheckedRecord(execution, batch), {
    owner: cause.owner,
    diagnostic: cause.diagnostic,
  })
  return actions.map(action =>
    action.judgment.kind === 'denied'
      ? action
      : { ...action, judgment: { kind: 'denied', evidence } },
  )
}

function checkedRequest(
  prepared: ToolInvokeRequest,
  definition: Adoption,
  consumer: ConsumerRef,
  action: Action,
  original: ActionToolCall,
): Outcome<ToolInvokeRequest, Failure> {
  const checked = judgeToolInvokeRequest(prepared)
  if ('failure' in checked)
    return fail({
      kind: 'invalid',
      field: `toolRequests.${checked.failure.field}`,
      reason: checked.failure.reason,
    })
  const request = checked.ok
  const same =
    canonical(request.availability.definition.adoption) === canonical(definition) &&
    canonical(request.consumer) === canonical(consumer) &&
    request.arguments.original === argumentsText(original.arguments) &&
    request.arguments.effective === action.effectiveArguments
  if (!same)
    return fail({
      kind: 'invalid',
      field: 'toolRequests',
      reason: 'request does not match the admitted action',
    })
  return succeed(request)
}

export function toolIntentOf(
  execution: AgentExecutionId,
  action: Action,
): Outcome<PendingCall, Failure> {
  if (action.judgment.kind !== 'allowed')
    return fail({ kind: 'invalid', field: 'action', reason: 'not allowed' })
  return succeed({
    kind: 'tool',
    purpose: 'action',
    association: 'intent',
    action: action.id,
    consumption: toolConsumption(execution, action.id),
    position: toolConsumer(execution, action),
    fixed: action.judgment.request,
  })
}

export async function sentToolRequest<P>(
  ports: Readonly<{ materials: Pick<Ports<P>['materials'], 'read'> }>,
  access: Access<P>,
  execution: AgentExecutionId,
  action: Action,
  barrier: DurableEvidence,
): Promise<Outcome<ToolInvokeRequest, Failure>> {
  if (action.judgment.kind !== 'allowed')
    return fail({ kind: 'invalid', field: 'action', reason: 'not allowed' })
  const read = await ports.materials.read({ ...access, source: action.judgment.request })
  if ('failure' in read) return read
  const request = fixedRequestOf(read.ok)
  if (
    request === null ||
    canonical(request.consumer) !== canonical(toolConsumer(execution, action)) ||
    request.arguments.effective !== action.effectiveArguments
  )
    return fail({
      kind: 'invalid',
      field: 'judgment.request',
      reason: 'not the fixed request of the action',
    })
  return succeed({ ...request, batchDecision: barrier })
}

export function fixedRequestOf(material: Material<ContentBlock>): ToolInvokeRequest | null {
  if (material.kind !== 'facts' || canonical(material.schema) !== canonical(fixedToolRequestSchema))
    return null
  let value: unknown
  try {
    value = plain(material.value)
  } catch {
    return null
  }
  const checked = judgeToolInvokeRequest(value)
  return 'failure' in checked ? null : checked.ok
}

export type AssociatedToolCall = Extract<PendingCall, { kind: 'tool'; association: 'associated' }>

export function slotOf(batch: ActionBatch, action: ActionId): ActionSlot | undefined {
  return batch.slots.find(slot => slot.action === action)
}

export function toolCall(action: Action): AssociatedToolCall | null {
  const pending = action.call
  return pending?.kind === 'tool' && pending.association === 'associated' ? pending : null
}

export function unsent(batch: ActionBatch, unaccepted: ReadonlySet<ActionId>): readonly Action[] {
  return batch.actions.filter(action => {
    if (action.judgment.kind !== 'allowed') return false
    const slot = slotOf(batch, action.id)
    return slot === undefined || (slot.kind === 'dispatched' && unaccepted.has(action.id))
  })
}

export function openToolCalls(batch: ActionBatch): readonly PendingCall[] {
  return batch.actions.flatMap(action => {
    const slot = slotOf(batch, action.id)
    return action.call !== null && (slot === undefined || slot.kind === 'dispatched')
      ? [action.call]
      : []
  })
}

export function toolCallOf<P>(access: Access<P>, pending: AssociatedToolCall): ToolCallId {
  return minted(resolveToolInvocationRef(pending.reference, access.tenant)).call
}

export function toolReceivedOf(
  received: readonly ReceivedEntry[],
  pending: AssociatedToolCall,
): ReceivedEntry | undefined {
  return received.find(
    entry =>
      entry.delivery.producer === 'tool' &&
      entry.delivery.key.kind === 'result' &&
      entry.delivery.key.reference === pending.reference &&
      entry.consumption === pending.consumption &&
      canonical(entry.consumer) === canonical(pending.position),
  )
}

export function toolProduced(
  call: ToolCallId,
  delivery: Extract<ToolDelivery<ContentBlock>, { kind: 'result' }>,
): ProducedResult {
  return {
    producer: { kind: 'tool', call },
    version: delivery.key.result,
    delivery: delivery.delivery,
    source: delivery.source,
  }
}

type MessageBlock = Exclude<ContentBlock, Readonly<{ kind: 'thinking' }>>
const VISIBLE = { toHuman: true, toModel: true } as const

function toolMessageId(execution: AgentExecutionId, action: Action): Message['id'] {
  const body = createHash('sha256')
    .update(JSON.stringify([execution, action.id]))
    .digest('hex')
  return `msg_${body.slice(0, 40)}_tool` as Message['id']
}

function toolMessage(
  execution: AgentExecutionId,
  action: Action,
  body: readonly MessageBlock[],
): Message {
  const marker = {
    kind: 'tool_result' as const,
    id: `${action.id}/result` as BlockId,
    visibility: VISIBLE,
    callId: action.original.callId,
  }
  return { id: toolMessageId(execution, action), role: 'tool', blocks: [marker, ...body] }
}

export function toolResultCandidate(
  execution: AgentExecutionId,
  action: Action,
  content: readonly ContentBlock[],
): Message {
  return toolMessage(
    execution,
    action,
    content.filter((block): block is MessageBlock => block.kind !== 'thinking'),
  )
}

export function uncheckedCandidate(execution: AgentExecutionId, action: Action): Message {
  return toolMessage(execution, action, [
    {
      kind: 'text',
      id: `${action.id}/denied` as BlockId,
      visibility: VISIBLE,
      text: 'The tool call did not run: its permission could not be checked, because the permission basis was unavailable at that moment. No rule and no person refused it. The same call may run when it is made again.',
    },
  ])
}

export function deniedCandidate(execution: AgentExecutionId, action: Action): Message {
  return toolMessage(execution, action, [
    {
      kind: 'text',
      id: `${action.id}/denied` as BlockId,
      visibility: VISIBLE,
      text: 'The tool call was denied and did not run.',
    },
  ])
}

export function guidedCandidate(
  execution: AgentExecutionId,
  action: Action,
  words: string,
): Message {
  return toolMessage(execution, action, [
    {
      kind: 'text',
      id: `${action.id}/denied` as BlockId,
      visibility: VISIBLE,
      text: 'The tool call was denied and did not run. The person answered the approval card with guidance instead of a decision. Their words follow.',
    },
    { kind: 'text', id: `${action.id}/guidance` as BlockId, visibility: VISIBLE, text: words },
  ])
}

export function answeredCandidate(
  execution: AgentExecutionId,
  action: Action,
  text: string,
): Message {
  return toolMessage(execution, action, [
    { kind: 'text', id: `${action.id}/answer` as BlockId, visibility: VISIBLE, text },
  ])
}

export function refusedTool(
  at: Pick<AgentCheckpoint, 'step' | 'calls' | 'voided'>,
  action: ActionId,
  basis: DurableEvidence,
): Pick<AgentCheckpoint, 'calls' | 'voided'> {
  const record = { kind: 'tool' as const, step: at.step, action, cause: 'not-accepted' as const }
  return {
    calls: at.calls.filter(call => call.kind !== 'tool' || call.action !== action),
    voided: [...at.voided, { ...record, basis }],
  }
}

export function deniedSlot(action: Action, evidence: DurableEvidence) {
  return {
    kind: 'denied' as const,
    action: action.id,
    evidence,
    each: null,
    candidateDigest: null,
    handoff: null,
  }
}

export function candidateDigest(message: Message): string {
  return `sha256:${createHash('sha256').update(canonical(message)).digest('hex')}`
}
