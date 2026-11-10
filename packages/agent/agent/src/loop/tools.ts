import { createHash } from 'node:crypto'
import {
  decodeActionId,
  decodePassageId,
  type Access,
  type Action,
  type ActionBatch,
  type ActionToolCall,
  type AdmissionDecision,
  type Adoption,
  type AgentExecutionId,
  type Authority,
  type ConsumerRef,
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

/** The schema of a preserved answer of the trusted request source: one JSON string. */
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

/**
 * The action of one `tool_call` part: it keeps the call id of the part, not the part. The part is
 * read back from the preserved reply when a judgment needs it (SPEC "工具执行与结果承接" 10).
 */
export function actionOf(step: StepId, original: ActionToolCall, ordinal: number): Action {
  const id = minted(decodeActionId(`${step}/tool/${ordinal}`))
  return {
    id,
    original: { callId: original.callId },
    effectiveArguments: argumentsText(original.arguments),
    call: null,
    judgment: { kind: 'pending', passage: minted(decodePassageId(`${id}/admission`)) },
  }
}

export function toolConsumer(execution: AgentExecutionId, action: Action): ConsumerRef {
  return { owner: '@omne-harness/agent', work: execution, position: action.id, purpose: 'action' }
}

/**
 * The judgment of one action at A0: judged (denied, or already judged), allowed with its checked
 * request, or the admission was unavailable. An unavailable admission denies the whole batch
 * (agent-contract SPEC "整批判断屏障与动作准入" rule 2), so it is an answer of the judgment, not a
 * failure of the step. An allowed request is not saved here: A0 preserves every allowed request of
 * the batch only when no admission of the batch was unavailable, and before it commits the
 * judgments.
 */
export type ToolAdmission =
  | Readonly<{ kind: 'judged'; action: Action }>
  | Readonly<{
      kind: 'allowed'
      action: Action
      evidence: DurableEvidence
      request: ToolInvokeRequest
    }>
  | Readonly<{ kind: 'unavailable'; owner: string; diagnostic: string }>

const judged = (action: Action): Outcome<ToolAdmission, Failure> =>
  succeed({ kind: 'judged', action })

const unavailableAdmission = (owner: string, diagnostic: string): Outcome<ToolAdmission, Failure> =>
  succeed({ kind: 'unavailable', owner, diagnostic })

/**
 * A port Failure that stands for an unavailable admission. Rule 2 reads a `denied` or `unavailable`
 * Failure of the admission port as unavailable; the trusted Tool request source is part of the same
 * admission (R2-D36, agent-host-local SPEC "Tool 请求来源"), so its two refusals read the same way.
 * Every other Failure (a stale advance, a defect, an invalid request) stays a failure of the step.
 */
function asUnavailable(owner: string, failure: Failure): Outcome<ToolAdmission, Failure> {
  if (failure.kind === 'unavailable') return unavailableAdmission(failure.owner, failure.diagnostic)
  if (failure.kind === 'denied') return unavailableAdmission(owner, `denied ${failure.action}`)
  return fail(failure)
}

/** An admission that did not allow the action: a denial, an unavailable admission, or a failure. */
function notAllowed(
  action: Action,
  decision: Exclude<AdmissionDecision, { kind: 'allow' }>,
): Outcome<ToolAdmission, Failure> {
  if (decision.kind === 'deny')
    return judged({ ...action, judgment: { kind: 'denied', evidence: decision.evidence } })
  if (decision.kind === 'unavailable')
    return unavailableAdmission('agentActionAdmission', decision.diagnostic)
  // need-decision: the decision card round is not implemented yet.
  return fail({ kind: 'unsupported' })
}

/**
 * A0 for one pending action: describe, admit and prepare its request. `original` is the
 * `tool_call` part the action names, read back from the preserved reply.
 */
export async function admitToolAction<P>(
  ports: Ports<P>,
  access: Access<P>,
  execution: AgentExecutionId,
  advance: Authority,
  action: Action,
  original: ActionToolCall,
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
    decision: null,
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

/**
 * A0 for a call that the trusted request source answered without running a tool (D-104): the
 * answer is preserved first, and the action is denied with it. Only this action is denied; the
 * model reads the answer as the result of its call.
 */
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
    // The digest keeps a retried A0 whose source answers another text from refusing the same
    // identity with other content: each text is its own material.
    identity: `${execution}/${action.id}/answer/${createHash('sha256').update(text).digest('hex')}`,
    consumer: toolConsumer(execution, action),
    value: { kind: 'facts', schema: toolCallAnswerSchema, value: { kind: 'string', value: text } },
  })
  if ('failure' in stored) return stored
  const evidence = agentEvidence(`${execution}/${action.id}/answered`, stored.ok)
  return judged({ ...action, judgment: { kind: 'denied', evidence, answer: stored.ok } })
}

/** The text of a preserved answer, or null when the material is not one. */
export function toolCallAnswerOf(material: Material<ContentBlock>): string | null {
  if (material.kind !== 'facts' || canonical(material.schema) !== canonical(toolCallAnswerSchema))
    return null
  return material.value.kind === 'string' ? material.value.value : null
}

/**
 * A0 after every action of the batch was judged: the allowed request is preserved, and the
 * judgment names the material (SPEC "工具执行与结果承接" 10). The material comes first; a crash
 * before the judgment commit leaves a block that no fact refers to, and the same request preserved
 * again answers the same source.
 */
export async function preserveAllowedRequest<P>(
  ports: Ports<P>,
  access: Access<P>,
  execution: AgentExecutionId,
  allowed: Extract<ToolAdmission, { kind: 'allowed' }>,
): Promise<Outcome<Action, Failure>> {
  const { action, evidence, request } = allowed
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

/**
 * Rule 2 for an unavailable admission: no action of the batch is released. Every action that is
 * not denied already, allowed or still pending, is denied with the evidence of the unavailable
 * admission; A1 then closes the barrier as all-denied and no later chain calls admit.
 */
export function deniedForUnavailableAdmission(
  execution: AgentExecutionId,
  batch: ActionBatch,
  cause: Extract<ToolAdmission, { kind: 'unavailable' }>,
  actions: readonly Action[],
): readonly Action[] {
  const evidence = agentEvidence(`${execution}/${batch.id}/admission-unavailable`, {
    owner: cause.owner,
    diagnostic: cause.diagnostic,
  })
  return actions.map(action =>
    action.judgment.kind === 'denied'
      ? action
      : { ...action, judgment: { kind: 'denied', evidence } },
  )
}

/**
 * The prepared request, checked by the public Tool judgment and against the admitted action: the
 * same definition, consumer and arguments. The source may not choose another of any of them.
 */
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

/**
 * The intent of an allowed action: its fixed request is the material the judgment named, so the
 * intent preserves nothing more (SPEC "工具执行与结果承接" 10).
 */
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

/**
 * The request A2 sends: the preserved request of the judgment, read back and checked again, with
 * the evidence of the opened barrier as its batch decision. A material that is not the fixed
 * request of this action is `invalid`; nothing else stands in for it.
 */
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

/** The Tool request a fixed-request material holds, or null when it is not one. */
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

/** The Tool call that a saved reference names, read back for the tenant it was issued to. */
export function toolCallOf<P>(access: Access<P>, pending: AssociatedToolCall): ToolCallId {
  return minted(resolveToolInvocationRef(pending.reference, access.tenant)).call
}

/**
 * The received result entry of the original Tool call among the received entries of its
 * consumption: the same reference and consumer. A late version or an account revision is not the
 * result of the slot.
 */
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

/** The produced result that the slot keeps for a received Tool result. */
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

/** The message identity of the result or denial message of one action. */
function toolMessageId(execution: AgentExecutionId, action: Action): Message['id'] {
  const body = createHash('sha256')
    .update(JSON.stringify([execution, action.id]))
    .digest('hex')
  // `msg_`, 40 hex digits and `_tool`: the 22 to 64 characters parseMessageId accepts. The brand
  // has no runtime value, so naming it is the cast.
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

/** T2: the candidate message of a result slot keeps every content block the Tool returned. */
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

/** T2: the candidate message of a denied slot names the denial; the evidence stays in the slot. */
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

/** T2: the candidate message of a slot denied with an answer is the answer, not the denial. */
export function answeredCandidate(
  execution: AgentExecutionId,
  action: Action,
  text: string,
): Message {
  return toolMessage(execution, action, [
    { kind: 'text', id: `${action.id}/answer` as BlockId, visibility: VISIBLE, text },
  ])
}

/** A denied slot before any single-result passage. */
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

/** The digest of a candidate message that a slot keeps in place of the message. */
export function candidateDigest(message: Message): string {
  return `sha256:${createHash('sha256').update(canonical(message)).digest('hex')}`
}
