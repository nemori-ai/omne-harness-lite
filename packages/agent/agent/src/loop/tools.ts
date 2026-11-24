import { createHash } from 'node:crypto'
import {
  admissionPassageOf,
  decodeActionId,
  type Access,
  type Action,
  type ActionBatch,
  type ActionId,
  type ActionSlot,
  type ActionBatchId,
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
  type DenialCategory,
  type DurableEvidence,
  type Failure,
  type Material,
  type PendingCall,
  type Waiting,
  type ProducedResult,
  type ReceivedEntry,
  type StepId,
} from '@omne-harness/agent-contract'
import type { BlockId, ContentBlock } from '@omne-harness/content-block'
import {
  resolveToolInvocationRef,
  type BackgroundSource,
  type ToolCallId,
  type ToolInvokeOutcome,
  type ToolInvokeRequest,
  type ToolDelivery,
} from '@omne-harness/tool-contract'
import { judgeToolInvokeRequest } from '@omne-harness/tool-contract/provider'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { AgentDependencies } from '../construction.ts'
import { canonical } from '../canonical.ts'
import { json, plain } from '../receiving-values.ts'
import { agentEvidence, toolConsumption, type Message } from './identities.ts'
import { readToolDeliveryMaterial } from '../tool-receiving-material.ts'

type Ports<P> = Pick<AgentDependencies<P, ContentBlock>, 'admission' | 'toolRequests' | 'materials'>

export const fixedToolRequestSchema = {
  owner: 'agent',
  name: 'fixed-tool-request',
  revision: '1',
  digest: 'agent:fixed-tool-request/1',
} as const

export function toolRequestMaterial(
  request: ToolInvokeRequest,
): Extract<Material<ContentBlock>, { kind: 'facts' }> {
  return { kind: 'facts', schema: fixedToolRequestSchema, value: json(request) }
}

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
  | Readonly<{ kind: 'denied'; action: Action; category: DenialCategory }>
  | Readonly<{
      kind: 'allowed'
      action: Action
      evidence: DurableEvidence
      request: ToolInvokeRequest
      notice?: string
    }>
  | Readonly<{ kind: 'asked'; action: Action; card: DecisionCardDraft; evidence: DurableEvidence }>
  | Readonly<{ kind: 'unavailable'; owner: string; diagnostic: string }>
  | Readonly<{ kind: 'refused'; owner: string; diagnostic: string }>

export type HandBack = Readonly<{ card: DurableEvidence; answer: CardAnswer | CardRemark }>

const judged = (action: Action): Outcome<ToolAdmission, Failure> =>
  succeed({ kind: 'judged', action })

const unavailableAdmission = (owner: string, diagnostic: string): Outcome<ToolAdmission, Failure> =>
  succeed({ kind: 'unavailable', owner, diagnostic })

function notAnswered(owner: string, failure: Failure): Outcome<ToolAdmission, Failure> {
  if (failure.kind === 'unavailable') return unavailableAdmission(failure.owner, failure.diagnostic)
  if (failure.kind === 'denied')
    return succeed({ kind: 'refused', owner, diagnostic: `denied ${failure.action}` })
  return fail(failure)
}

const noticed = (notice: string | undefined): Readonly<{ notice?: string }> =>
  notice === undefined ? {} : { notice }

function notAllowed(
  action: Action,
  decision: Exclude<AdmissionDecision, { kind: 'allow' }>,
): Outcome<ToolAdmission, Failure> {
  if (decision.kind === 'deny')
    return succeed({
      kind: 'denied',
      action: {
        ...action,
        judgment: { kind: 'denied', evidence: decision.evidence, ...noticed(decision.notice) },
      },
      category: decision.category,
    })
  if (decision.kind === 'unavailable')
    return unavailableAdmission('agentActionAdmission', decision.diagnostic)
  if (decision.kind === 'undecidable')
    return succeed({
      kind: 'refused',
      owner: 'agentActionAdmission',
      diagnostic: decision.diagnostic,
    })
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
  batch?: Readonly<{ id: ActionBatchId; pass: string }>,
): Promise<Outcome<ToolAdmission, Failure>> {
  if (action.judgment.kind !== 'pending') return judged(action)
  if (original.callId !== action.original.callId)
    return fail({ kind: 'invalid', field: 'original', reason: 'not the tool call of the action' })
  if (ports.toolRequests === undefined)
    return succeed({
      kind: 'refused',
      owner: 'agentToolRequests',
      diagnostic: 'trusted Tool request source is not assembled',
    })
  const input = {
    ...access,
    execution,
    action: action.id,
    original,
    effectiveArguments: action.effectiveArguments,
    consumer: toolConsumer(execution, action),
  }
  const described = await ports.toolRequests.describe(input)
  if ('failure' in described) return notAnswered('agentToolRequests', described.failure)
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
    ...(batch === undefined ? {} : { batch }),
  })
  if ('failure' in admitted) return notAnswered('agentActionAdmission', admitted.failure)
  if (admitted.ok.kind !== 'allow') return notAllowed(action, admitted.ok)
  const prepared = await ports.toolRequests.prepare({ ...input, definition })
  if ('failure' in prepared) return notAnswered('agentToolRequests', prepared.failure)
  const request = checkedRequest(prepared.ok, definition, input.consumer, action, original)
  if ('failure' in request) return request
  return succeed({
    kind: 'allowed',
    action,
    evidence: admitted.ok.evidence,
    request: request.ok,
    ...noticed(admitted.ok.notice),
  })
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
    value: toolRequestMaterial(request),
    readers: 'until-release',
  })
  if ('failure' in stored) return stored
  return succeed({
    ...action,
    judgment: { kind: 'allowed', evidence, request: stored.ok, ...noticed(allowed.notice) },
  })
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

export function deniedForRefusedAdmission(
  execution: AgentExecutionId,
  batch: ActionBatch,
  cause: Extract<ToolAdmission, { kind: 'refused' }>,
  judged: readonly Readonly<{ action: Action }>[],
): readonly Action[] {
  const evidence = agentEvidence(uncheckedRecord(execution, batch), {
    owner: cause.owner,
    diagnostic: cause.diagnostic,
  })
  const actions = [...judged.map(answer => answer.action), ...batch.actions.slice(judged.length)]
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
    canonical(request.availability.definition) === canonical(definition) &&
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

export const associationOf = (
  invoked: Extract<ToolInvokeOutcome, { kind: 'accepted' | 'commit-unknown' }>,
): Pick<AssociatedToolCall, 'reference' | 'acceptance'> => ({
  reference: invoked.reference,
  acceptance: invoked.kind === 'accepted' ? 'accepted' : 'unknown',
})

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

export function producerWaits(calls: readonly PendingCall[]): Waiting[] {
  return calls.map(pending => ({ kind: 'producer', pending }))
}

export function toolCallOf<P>(access: Access<P>, pending: AssociatedToolCall): ToolCallId {
  return minted(resolveToolInvocationRef(pending.reference, access.tenant)).call
}

type ReturnKind = 'result' | 'placeholder'
type ToolReturn<K extends ReturnKind> = Extract<ToolDelivery<ContentBlock>, { kind: K }>

export type ReceivedToolDelivery<K extends ReturnKind> = Readonly<{
  entry: ReceivedEntry
  delivery: ToolReturn<K>
  pending: AssociatedToolCall
}>

/** The first kept entry of the call, trying the kinds in order: a placeholder before a result. */
export function toolReceivedOf(
  received: readonly ReceivedEntry[],
  pending: AssociatedToolCall,
  kinds: readonly ReturnKind[],
): ReceivedEntry | undefined {
  const of = (kind: ReturnKind) =>
    received.find(
      entry =>
        entry.delivery.producer === 'tool' &&
        entry.delivery.key.kind === kind &&
        entry.delivery.key.reference === pending.reference &&
        entry.consumption === pending.consumption &&
        canonical(entry.consumer) === canonical(pending.position),
    )
  return kinds.map(of).find(entry => entry !== undefined)
}

/** Whether the material holds a delivery of the kind its entry names, and one of the kinds. */
export function isToolReturnOf<K extends ReturnKind>(
  delivery: ToolDelivery<ContentBlock> | null | undefined,
  kinds: readonly K[],
  entry: ReceivedEntry,
): delivery is ToolReturn<K> {
  return (
    delivery != null &&
    delivery.kind === entry.delivery.key.kind &&
    (kinds as readonly string[]).includes(delivery.kind)
  )
}

export const RETURN_KINDS = ['placeholder', 'result'] as const

type DeliveryPorts<P> = Pick<AgentDependencies<P, ContentBlock>, 'entries' | 'materials'>

/** The kept delivery of the action's call, of one of the kinds and checked against its binding; null when none is kept. */
export async function toolDeliveryOf<P, K extends ReturnKind>(
  ports: DeliveryPorts<P>,
  access: Access<P>,
  execution: AgentExecutionId,
  action: Action,
  kinds: readonly K[],
): Promise<Outcome<ReceivedToolDelivery<K> | null, Failure>> {
  const pending = toolCall(action)
  if (pending === null) return succeed(null)
  const consumption = pending.consumption
  const received = await ports.entries.receivedOf({ ...access, execution, consumption })
  if ('failure' in received) return received
  const found = toolReceivedOf(received.ok, pending, kinds)
  if (found === undefined) return succeed(null)
  const { material: source, ...expected } = found
  const material = await ports.materials.read({ ...access, source })
  if ('failure' in material) return material
  const delivery = readToolDeliveryMaterial(access, material.ok, expected)
  if (!isToolReturnOf(delivery, kinds, found))
    return fail({
      kind: 'invalid',
      field: 'received.material',
      reason: 'invalid schema or original binding',
    })
  return succeed({ entry: found, delivery, pending })
}

/** Whether a call the batch still waits on already has its placeholder or result kept. */
export async function anyToolReceived<P>(
  ports: DeliveryPorts<P>,
  access: Access<P>,
  execution: AgentExecutionId,
  batch: ActionBatch,
): Promise<Outcome<boolean, Failure>> {
  for (const action of batch.actions) {
    if (slotOf(batch, action.id)?.kind !== 'dispatched') continue
    const received = await toolDeliveryOf(ports, access, execution, action, RETURN_KINDS)
    if ('failure' in received) return received
    if (received.ok !== null) return succeed(true)
  }
  return succeed(false)
}

/** The slot a kept placeholder or result fills, and the produced result it records. */
export function receivedSlot(
  action: ActionId,
  call: ToolCallId,
  { entry, delivery }: ReceivedToolDelivery<ReturnKind>,
): Readonly<{ slot: ActionSlot; result: ProducedResult }> {
  const common = { action, each: null, candidateDigest: null, handoff: null }
  if (delivery.kind === 'placeholder') {
    const result = toolPlaceholderProduced(call, delivery)
    const slot = {
      ...common,
      kind: 'background',
      placeholder: result,
      confirmation: entry.material,
    }
    return { slot: slot as ActionSlot, result }
  }
  const result = toolProduced(call, delivery)
  const { terminal } = delivery
  return {
    slot: {
      ...common,
      kind: 'result',
      result,
      terminal,
      custody: entry.material,
      completion: null,
    },
    result,
  }
}

/** A slot that T2 passes with no conclusions, or null when it is not ready to pass. */
export function passingSlot(slot: ActionSlot | undefined): ActionSlot | null {
  if (slot?.kind === 'background') return slot.candidateDigest === null ? slot : null
  if (slot === undefined || slot.each !== null) return null
  return slot.kind === 'denied' || slot.kind === 'result' ? { ...slot, each: [] } : null
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

export const PLACEHOLDER_VERSION = 'placeholder'

export function toolPlaceholderProduced(
  call: ToolCallId,
  delivery: Extract<ToolDelivery<ContentBlock>, { kind: 'placeholder' }>,
): ProducedResult {
  return {
    producer: { kind: 'tool', call },
    version: PLACEHOLDER_VERSION,
    delivery: delivery.delivery,
    source: delivery.evidence,
  }
}

const PLACEHOLDER_REASONS: Readonly<Record<BackgroundSource['kind'], string>> = {
  launched: 'started in the background',
  control: 'moved to the background on request',
  threshold: 'moved to the background after its foreground threshold',
  'foreground-limit': 'moved to the background at its foreground time limit',
}

type MessageBlock = Exclude<ContentBlock, Readonly<{ kind: 'thinking' }>>
const VISIBLE = { toHuman: true, toModel: true } as const

function toolMessageId(execution: AgentExecutionId, action: Action): Message['id'] {
  const body = createHash('sha256')
    .update(JSON.stringify([execution, action.id]))
    .digest('hex')
  return `msg_${body.slice(0, 40)}_tool` as Message['id']
}

function noticeOf(action: Action): readonly MessageBlock[] {
  const { judgment } = action
  const settled = judgment.kind === 'allowed' || judgment.kind === 'denied'
  if (!settled || judgment.notice === undefined) return []
  return [
    {
      kind: 'text',
      id: `${action.id}/notice` as BlockId,
      visibility: VISIBLE,
      text: judgment.notice,
    },
  ]
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
  return {
    id: toolMessageId(execution, action),
    role: 'tool',
    blocks: [marker, ...body, ...noticeOf(action)],
  }
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

export function placeholderCandidate(
  execution: AgentExecutionId,
  action: Action,
  call: ToolCallId,
  source: BackgroundSource,
): Message {
  return toolMessage(execution, action, [
    {
      kind: 'text',
      id: `${action.id}/placeholder` as BlockId,
      visibility: VISIBLE,
      text:
        `The call ${call} ${PLACEHOLDER_REASONS[source.kind]}. It is still running, and this message is not its result. ` +
        `Its outcome will arrive later as a system reminder that names call ${call}. Do not call it again to get the outcome.`,
    },
  ])
}

export function uncheckedCandidate(execution: AgentExecutionId, action: Action): Message {
  return toolMessage(execution, action, [
    {
      kind: 'text',
      id: `${action.id}/denied` as BlockId,
      visibility: VISIBLE,
      text: 'The tool call did not run: its permission could not be decided in this deployment. No rule and no person refused it. Making the same call again will not change this.',
    },
  ])
}

const DENIALS: Readonly<Record<DenialCategory, string>> = {
  rule: 'The tool call was denied by a rule or a prohibition and did not run.',
  'not-released': 'The tool call did not run: the person did not allow it this time.',
  prohibited:
    'The tool call did not run: the person prohibited this capability, so later calls to it are denied too.',
  'card-closed':
    'The tool call did not run: its approval card was closed before the person answered.',
  guidance:
    'The tool call did not run. The person answered the approval card with guidance instead of a decision. Their words follow.',
}

/** The fixed message of a denial category; the person's own words follow only guidance. */
export function deniedCandidate(
  execution: AgentExecutionId,
  action: Action,
  denial: Readonly<{ category: DenialCategory; words: string | null }>,
): Message {
  const words =
    denial.words !== null
      ? [
          {
            kind: 'text' as const,
            id: `${action.id}/guidance` as BlockId,
            visibility: VISIBLE,
            text: denial.words,
          },
        ]
      : []
  return toolMessage(execution, action, [
    {
      kind: 'text',
      id: `${action.id}/denied` as BlockId,
      visibility: VISIBLE,
      text: DENIALS[denial.category],
    },
    ...words,
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

export function dispatchedSlot(action: Action) {
  return {
    kind: 'dispatched' as const,
    action: action.id,
    each: null,
    candidateDigest: null,
    handoff: null,
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
