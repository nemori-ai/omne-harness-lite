import { createHash } from 'node:crypto'
import {
  decodeActionId,
  decodeConsumptionId,
  decodePassageId,
  type Access,
  type Action,
  type AdmissionDecision,
  type Adoption,
  type AgentExecutionId,
  type Authority,
  type ConsumerRef,
  type DurableEvidence,
  type ExecutionSnapshot,
  type Failure,
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
import { json } from '../receiving-values.ts'
import type { Message } from './identities.ts'

type Ports<P> = Pick<AgentDependencies<P, ContentBlock>, 'admission' | 'toolRequests' | 'materials'>

export const fixedToolRequestSchema = {
  owner: 'agent',
  name: 'fixed-tool-request',
  revision: '1',
  digest: 'agent:fixed-tool-request/1',
} as const

function minted<T>(result: Outcome<T, unknown>): T {
  if ('failure' in result) throw new Error('invalid derived Tool action identity')
  return result.ok
}

function argumentsText(value: Action['original']['arguments']): string {
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

export function actionOf(step: StepId, original: Action['original'], ordinal: number): Action {
  const id = minted(decodeActionId(`${step}/tool/${ordinal}`))
  return {
    id,
    original,
    effectiveArguments: argumentsText(original.arguments),
    call: null,
    judgment: { kind: 'pending', passage: minted(decodePassageId(`${id}/admission`)) },
  }
}

export function toolConsumer(execution: AgentExecutionId, action: Action): ConsumerRef {
  return { owner: '@omne-harness/agent', work: execution, position: action.id, purpose: 'action' }
}

/** An admission that did not allow the action: a denial, or the failure it stands for. */
function notAllowed(
  action: Action,
  decision: Exclude<AdmissionDecision, { kind: 'allow' }>,
): Outcome<Action, Failure> {
  if (decision.kind === 'deny')
    return succeed({ ...action, judgment: { kind: 'denied', evidence: decision.evidence } })
  if (decision.kind === 'unavailable')
    return fail({
      kind: 'unavailable',
      owner: 'agentActionAdmission',
      diagnostic: decision.diagnostic,
    })
  // need-decision: the decision card round is not implemented yet.
  return fail({ kind: 'unsupported' })
}

export async function admitToolAction<P>(
  ports: Ports<P>,
  access: Access<P>,
  execution: AgentExecutionId,
  advance: Authority,
  action: Action,
): Promise<Outcome<Action, Failure>> {
  if (action.judgment.kind !== 'pending') return succeed(action)
  if (ports.toolRequests === undefined)
    return fail({
      kind: 'unavailable',
      owner: 'agentToolRequests',
      diagnostic: 'trusted Tool request source is unavailable',
    })
  const input = {
    ...access,
    execution,
    action: action.id,
    original: action.original,
    effectiveArguments: action.effectiveArguments,
    consumer: toolConsumer(execution, action),
  }
  const described = await ports.toolRequests.describe(input)
  if ('failure' in described) return described
  const admitted = await ports.admission.admit({
    ...input,
    advance,
    passage: action.judgment.passage,
    definition: described.ok,
    permissions: [],
    decision: null,
  })
  if ('failure' in admitted) return admitted
  if (admitted.ok.kind !== 'allow') return notAllowed(action, admitted.ok)
  const prepared = await ports.toolRequests.prepare({
    ...input,
    definition: described.ok,
    admission: admitted.ok.evidence,
  })
  if ('failure' in prepared) return prepared
  const request = checkedRequest(prepared.ok, described.ok, input.consumer, action)
  if ('failure' in request) return request
  return succeed({
    ...action,
    judgment: { kind: 'allowed', evidence: admitted.ok.evidence, request: request.ok },
  })
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
    request.arguments.original === argumentsText(action.original.arguments) &&
    request.arguments.effective === action.effectiveArguments
  if (!same)
    return fail({
      kind: 'invalid',
      field: 'toolRequests',
      reason: 'request does not match the admitted action',
    })
  return succeed(request)
}

export async function preserveToolIntent<P>(
  ports: Ports<P>,
  access: Access<P>,
  execution: AgentExecutionId,
  action: Action,
): Promise<Outcome<PendingCall, Failure>> {
  if (action.judgment.kind !== 'allowed')
    return fail({ kind: 'invalid', field: 'action', reason: 'not allowed' })
  const input = {
    ...access,
    execution,
    identity: `${execution}/${action.id}/request`,
    consumer: action.judgment.request.consumer,
    value: {
      kind: 'facts' as const,
      schema: fixedToolRequestSchema,
      value: json(action.judgment.request),
    },
  }
  const stored = await ports.materials.preserve(input)
  if ('failure' in stored) return stored
  return succeed({
    kind: 'tool',
    purpose: 'action',
    association: 'intent',
    action: action.id,
    consumption: minted(decodeConsumptionId(`${action.id}/result`)),
    position: input.consumer,
    fixed: stored.ok,
  })
}

export type AssociatedToolCall = Extract<PendingCall, { kind: 'tool'; association: 'associated' }>

/** The Tool call that a saved reference names, read back for the tenant it was issued to. */
export function toolCallOf<P>(access: Access<P>, pending: AssociatedToolCall): ToolCallId {
  return minted(resolveToolInvocationRef(pending.reference, access.tenant)).call
}

/**
 * The received result entry of the original Tool call: the same reference, consumption and
 * consumer. A late version or an account revision is not the result of the slot.
 */
export function toolReceivedOf(
  read: ExecutionSnapshot,
  pending: AssociatedToolCall,
): ReceivedEntry | undefined {
  return read.entries?.find(
    (entry): entry is ReceivedEntry =>
      entry.kind === 'received' &&
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

/** A denied slot before any single-result passage. */
export function deniedSlot(action: Action, evidence: DurableEvidence) {
  return {
    kind: 'denied' as const,
    action: action.id,
    evidence,
    each: null,
    candidate: null,
    handoff: null,
  }
}
