import { createHash } from 'node:crypto'
import {
  decodeActionId,
  decodeActionBatchId,
  decodeAgentExecutionId,
  decodeAgentOperationId,
  decodeCardRoundId,
  decodeConsumptionId,
  decodeStepId,
  type ActionId,
  type ActionBatchId,
  type AgentExecutionId,
  type AgentOperationId,
  type CardRoundId,
  type ConsumerRef,
  type ConsumptionId,
  type DurableEvidence,
  type ExecutionRevision,
  type LoopFacts,
  type PassageId,
  type StepId,
} from '@omne-harness/agent-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import {
  decodeModelCallId,
  decodeModelOperationId,
  encodeModelInvocationRef,
  resolveModelInvocationRef,
  type ModelCallId,
  type ModelInvocationParts,
  type ModelInvocationRef,
  type ModelOperationId,
} from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'

export const AGENT_OWNER = '@omne-harness/agent'

function minted<T>(outcome: Outcome<T, unknown>, text: string): T {
  if ('failure' in outcome) throw new Error(`minted identity ${text} was refused`)
  return outcome.ok
}

function digest(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

const STEP = /^step-(0|[1-9][0-9]*)$/u

export function positionExecution(consumer: ConsumerRef): AgentExecutionId | null {
  if (consumer.owner !== AGENT_OWNER) return null
  const at = consumer.work.lastIndexOf('/')
  if (at <= 0 || !STEP.test(consumer.work.slice(at + 1))) return null
  const execution = decodeAgentExecutionId(consumer.work.slice(0, at))
  return 'ok' in execution ? execution.ok : null
}

export function actionPositionExecution(consumer: ConsumerRef): AgentExecutionId | null {
  if (consumer.owner !== AGENT_OWNER || consumer.purpose !== 'action') return null
  const execution = decodeAgentExecutionId(consumer.work)
  return 'ok' in execution ? execution.ok : null
}

export function stepOf(ordinal: number): StepId {
  const text = `step-${ordinal}`
  return minted(decodeStepId(text), text)
}

export function ordinalOf(step: StepId): number {
  const match = STEP.exec(step)
  if (match?.[1] === undefined) throw new Error(`step ${step} was not minted by this coordinator`)
  return Number(match[1])
}

export function journalOperation(
  node: string,
  what: string,
  after: ExecutionRevision | null,
): AgentOperationId {
  const text = `${node}/${what}@${after ?? 'open'}`
  return minted(decodeAgentOperationId(text), text)
}

export function handoffOperation(
  kind: string,
  position: Readonly<{ step: StepId; node: string; slot: string | null }>,
  predecessor: ExecutionRevision,
): AgentOperationId {
  const slot = position.slot === null ? '' : `/${position.slot}`
  const text = `H/${kind}/${position.step}/${position.node}${slot}@${predecessor}`
  return minted(decodeAgentOperationId(text), text)
}

export function handoffStage(
  handoff: AgentOperationId,
  stage: 'prepare' | 'resolve',
): AgentOperationId {
  const text = `${handoff}/${stage}`
  return minted(decodeAgentOperationId(text), text)
}

function attemptSuffix(attempt: number, separator: string): string {
  if (!Number.isSafeInteger(attempt) || attempt < 0)
    throw new Error(`attempt ${attempt} is not a count of voided intents`)
  return attempt === 0 ? '' : `${separator}a${attempt}`
}

export function mainAction(step: StepId, attempt = 0): ActionId {
  const text = `${step}/main${attemptSuffix(attempt, '-')}`
  return minted(decodeActionId(text), text)
}

export function cardRound(passage: PassageId, ordinal: number): CardRoundId {
  const text = `${passage}/round/${ordinal}`
  return minted(decodeCardRoundId(text), text)
}

export function cardRequestIdentity(round: CardRoundId, ordinal: number): string {
  return `${round}/card/${ordinal}`
}

export function mainBatch(step: StepId): ActionBatchId {
  const text = `${step}/actions`
  return minted(decodeActionBatchId(text), text)
}

function consumptionScope(execution: AgentExecutionId): string {
  return digest(execution).slice(0, 40)
}

export function mainConsumption(
  execution: AgentExecutionId,
  step: StepId,
  attempt = 0,
): ConsumptionId {
  const text = `${consumptionScope(execution)}/${step}/main${attemptSuffix(attempt, '-')}/reply`
  return minted(decodeConsumptionId(text), text)
}

export function toolConsumption(execution: AgentExecutionId, action: ActionId): ConsumptionId {
  const text = `${consumptionScope(execution)}/${action}/result`
  return minted(decodeConsumptionId(text), text)
}

// The prefix-free body of one execution, step and attempt in a Model identity. The attempt part
// `_a<n>` starts with a letter, so it never reads as the ordinal or as `what`.
function modelBody(execution: AgentExecutionId, step: StepId, attempt = 0): string {
  return `${digest(execution).slice(0, 40)}_${ordinalOf(step)}${attemptSuffix(attempt, '_')}`
}

export function mainCall(execution: AgentExecutionId, step: StepId, attempt = 0): ModelCallId {
  const text = `mcall_${modelBody(execution, step, attempt)}`
  return minted(decodeModelCallId(text), text)
}

export function modelOperation(
  execution: AgentExecutionId,
  step: StepId,
  what: 'admit' | 'read' | 'ack' | `read_${number}`,
  attempt = 0,
): ModelOperationId {
  const text = `mop_${modelBody(execution, step, attempt)}_${what}`
  return minted(decodeModelOperationId(text), text)
}

export type Message = LoopFacts['inputs'][number]

export function mainInvocation(
  tenant: TenantId,
  execution: AgentExecutionId,
  step: StepId,
  attempt = 0,
): ModelInvocationRef {
  const parts = {
    tenant,
    call: mainCall(execution, step, attempt),
    admission: modelOperation(execution, step, 'admit', attempt),
  }
  return minted(encodeModelInvocationRef(parts), `${parts.call}/${parts.admission}`)
}

export function invocationParts(
  reference: ModelInvocationRef,
  tenant: TenantId,
): ModelInvocationParts {
  return minted(resolveModelInvocationRef(reference, tenant), 'the saved Model reference')
}

export function replyMessageId(execution: AgentExecutionId, step: StepId): Message['id'] {
  return `msg_${modelBody(execution, step)}_reply` as Message['id']
}

export function agentEvidence(record: string, payload: unknown = null): DurableEvidence {
  return {
    owner: AGENT_OWNER,
    record,
    revision: '1',
    digest: `sha256:${digest(JSON.stringify([record, payload]))}`,
  }
}
