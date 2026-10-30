// The identities and evidence that the coordinator mints. Every one is derived from stable parts of
// the execution (its identity, a step, a node, the revision that the write follows), never from a
// random value, a clock or a returned value, so the same frame and transition give the same
// identity (docs/architecture/mechanisms.md "操作身份的确定派生"). The exact encoding is this
// implementation's; a digest stands in for the execution identity where a Model identity allows
// only `[A-Za-z0-9_-]`.
import { createHash } from 'node:crypto'
import {
  decodeActionId,
  decodeActionBatchId,
  decodeAgentOperationId,
  decodeConsumptionId,
  decodeStepId,
  type ActionId,
  type ActionBatchId,
  type AgentExecutionId,
  type AgentOperationId,
  type ConsumptionId,
  type DurableEvidence,
  type ExecutionRevision,
  type LoopFacts,
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

/**
 * The value of a decoder that cannot refuse: every text below is built inside the lexicon of its
 * identity. A refusal is a defect of this module, so it throws and the coordinator stops on it.
 */
function minted<T>(outcome: Outcome<T, unknown>, text: string): T {
  if ('failure' in outcome) throw new Error(`minted identity ${text} was refused`)
  return outcome.ok
}

function digest(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

const STEP = /^step-(0|[1-9][0-9]*)$/u

export function stepOf(ordinal: number): StepId {
  const text = `step-${ordinal}`
  return minted(decodeStepId(text), text)
}

/** The ordinal of a step that `stepOf` minted; another text is not a step of this coordinator. */
export function ordinalOf(step: StepId): number {
  const match = STEP.exec(step)
  if (match?.[1] === undefined) throw new Error(`step ${step} was not minted by this coordinator`)
  return Number(match[1])
}

/** The operation of one Journal write: the node, what it writes and the revision it follows. */
export function journalOperation(
  node: string,
  what: string,
  after: ExecutionRevision | null,
): AgentOperationId {
  const text = `${node}/${what}@${after ?? 'open'}`
  return minted(decodeAgentOperationId(text), text)
}

/**
 * The internal admission operation H (SPEC "消息准入"): derived from the source kind, the stable
 * source position and the predecessor revision of its P, never from the attachment or a clock.
 */
export function handoffOperation(
  kind: string,
  position: Readonly<{ step: StepId; node: string; slot: string | null }>,
  predecessor: ExecutionRevision,
): AgentOperationId {
  const slot = position.slot === null ? '' : `/${position.slot}`
  const text = `H/${kind}/${position.step}/${position.node}${slot}@${predecessor}`
  return minted(decodeAgentOperationId(text), text)
}

/**
 * The P and the first Ja of one H (SPEC "消息准入": each derives from H and its own fixed stage).
 * A later application attempt after an excluded Ja is #502 stage 5.
 */
export function handoffStage(
  handoff: AgentOperationId,
  stage: 'prepare' | 'resolve',
): AgentOperationId {
  const text = `${handoff}/${stage}`
  return minted(decodeAgentOperationId(text), text)
}

export function mainAction(step: StepId): ActionId {
  const text = `${step}/main`
  return minted(decodeActionId(text), text)
}

/** The complete action batch formed from the admitted main reply of one step. */
export function mainBatch(step: StepId): ActionBatchId {
  const text = `${step}/actions`
  return minted(decodeActionBatchId(text), text)
}

export function mainConsumption(step: StepId): ConsumptionId {
  const text = `${step}/main/reply`
  return minted(decodeConsumptionId(text), text)
}

/** The prefix-free body that stands for one execution and step in a Model identity. */
function modelBody(execution: AgentExecutionId, step: StepId): string {
  return `${digest(execution).slice(0, 40)}_${ordinalOf(step)}`
}

export function mainCall(execution: AgentExecutionId, step: StepId): ModelCallId {
  const text = `mcall_${modelBody(execution, step)}`
  return minted(decodeModelCallId(text), text)
}

export function modelOperation(
  execution: AgentExecutionId,
  step: StepId,
  what: 'admit' | 'read' | 'ack' | `read_${number}`,
): ModelOperationId {
  const text = `mop_${modelBody(execution, step)}_${what}`
  return minted(decodeModelOperationId(text), text)
}

/** A message of the history, named through the contract so this package needs no message import. */
export type Message = LoopFacts['inputs'][number]

/**
 * The saved locator of the main call of one step (model-contract SPEC "可保存调用引用"): the tenant,
 * the call and its admission operation, encoded by the contract before the first admit, so the
 * PendingCall that holds it can be committed before the Model is asked.
 */
export function mainInvocation(
  tenant: TenantId,
  execution: AgentExecutionId,
  step: StepId,
): ModelInvocationRef {
  const parts = {
    tenant,
    call: mainCall(execution, step),
    admission: modelOperation(execution, step, 'admit'),
  }
  return minted(encodeModelInvocationRef(parts), `${parts.call}/${parts.admission}`)
}

/**
 * The call and admission that a saved locator names, read back through the contract for the tenant
 * of the execution. The locator was encoded for that tenant, so a refusal is a defect.
 */
export function invocationParts(
  reference: ModelInvocationRef,
  tenant: TenantId,
): ModelInvocationParts {
  return minted(resolveModelInvocationRef(reference, tenant), 'the saved Model reference')
}

/** The message identity of the main reply of one step. */
export function replyMessageId(execution: AgentExecutionId, step: StepId): Message['id'] {
  // `msg_` and 40 hex digits, `_`, the ordinal and `_reply`: a body of 22 to 64 characters of
  // [A-Za-z0-9_-], which is what parseMessageId of @omne-harness/message accepts. The brand has no
  // runtime value, so naming it is the cast.
  return `msg_${modelBody(execution, step)}_reply` as Message['id']
}

/** Evidence of a fact that this coordinator records itself, bound to its payload by a digest. */
export function agentEvidence(record: string, payload: unknown = null): DurableEvidence {
  return {
    owner: AGENT_OWNER,
    record,
    revision: '1',
    digest: `sha256:${digest(JSON.stringify([record, payload]))}`,
  }
}
