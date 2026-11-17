import {
  type Access,
  type AgentExecutionId,
  type AgentInstant,
  type ControlRecord,
  type ExecutionControl,
  type FailureCandidate,
  type Next,
  type MessageSource,
  type PendingCall,
  type Preparation,
} from '@omne-harness/agent-contract'
import { agentEvidence, invocationParts } from './identities.ts'
import { toolCall, toolCallOf } from './tools.ts'
import type {
  Action,
  ActionBatch,
  ActionSlot,
  AgentCheckpoint,
  ExecutionSnapshot,
  Failure,
  HandoffOutcome,
  PendingHandoff,
  StepId,
} from '@omne-harness/agent-contract'
import { fail, type Outcome } from '@omne-harness/operation-result'
import { localFailure } from './node-failure.ts'
import { required, type ModelPendingCall, type ReadyPreparation } from './coordinator-steps.ts'

// Helpers of the execution coordinator that read none of its state.

export function adoptedRequestOf(
  pending: ModelPendingCall,
  ready: ReadyPreparation,
): Pick<AgentCheckpoint, 'adoptedRequest'> {
  if (pending.purpose !== 'main' || ready.purpose !== 'main') return {}
  return {
    adoptedRequest: {
      reference: pending.reference,
      fixed: ready.source,
      schema: ready.schema,
      record: ready.state,
    },
  }
}

export function replaceSlot(batch: ActionBatch, slot: ActionSlot): ActionBatch {
  return {
    ...batch,
    slots: batch.slots.some(item => item.action === slot.action)
      ? batch.slots.map(item => (item.action === slot.action ? slot : item))
      : [...batch.slots, slot],
  }
}

export async function capabilityResult<T>(
  result: Promise<Outcome<T, Failure>>,
): Promise<Outcome<T, Failure>> {
  const answer = await result
  if ('failure' in answer && answer.failure.kind === 'denied')
    return fail(localFailure('rejected', answer.failure))
  return answer
}

export function replaceAction(batch: ActionBatch, action: Action): ActionBatch {
  return {
    ...batch,
    actions: batch.actions.map(item => (item.id === action.id ? action : item)),
  }
}

export function recordedOutcome(
  resolution: ExecutionSnapshot['handoffs'][number]['resolution'],
): HandoffOutcome | undefined {
  return resolution?.kind === 'recorded' ? resolution.outcome : undefined
}

export function replyPosition(step: StepId): PendingHandoff['position'] {
  return { step, node: 'I3', slot: null }
}

export function cannotFit(
  execution: AgentExecutionId,
  of: StepId,
  preparation: Extract<Preparation, { kind: 'cannot-fit' }>,
  at: AgentInstant,
): Extract<Next, { kind: 'try-finish' }> {
  const failure: FailureCandidate = {
    kind: 'cannot-fit',
    step: of,
    at,
    source: preparation.source,
    reason: preparation.reason,
    context: preparation.source,
  }
  const cause = agentEvidence(`${execution}/${of}/cannot-fit`, failure)
  return { kind: 'try-finish', conclusion: { kind: 'fail', cause }, failure }
}

export function cancelInterrupt<P>(
  access: Access<P>,
  control: ControlRecord,
  pending: PendingCall,
): Readonly<{ stage: string; command: ExecutionControl }> | null {
  const reason = control.stages.accepted.source
  if (pending.kind === 'model') {
    const call = invocationParts(pending.reference, access.tenant).call
    return { stage: `interrupt/${call}`, command: { kind: 'interrupt-model', call, reason } }
  }
  if (pending.association !== 'associated') return null
  const call = toolCallOf(access, pending)
  return { stage: `withdraw-tool/${call}`, command: { kind: 'withdraw-tool', call, reason } }
}

export type InternalSource = Exclude<MessageSource, { kind: 'external-input' }>

export function slotSource<P>(access: Access<P>, action: Action, slot: ActionSlot): InternalSource {
  if (slot.kind === 'denied')
    return { kind: 'action-denied', action: action.id, evidence: slot.evidence }
  if (slot.kind === 'dispatched')
    throw new Error('coordinator defect: no message of a dispatched slot')
  return {
    kind: 'tool-result',
    action: action.id,
    call: toolCallOf(access, required(toolCall(action), 'associated Tool call')),
    result: slot.kind === 'result' ? slot.result : slot.placeholder,
  }
}
