import type {
  AgentExecutionId,
  Authority,
  ConsumerRef,
  ExecutionSnapshot,
  LoopFacts,
  PendingCall,
  StepId,
} from '@omne-harness/agent-contract'
import type * as M from '@omne-harness/model-contract'
import { canonical } from '../canonical.ts'
import { replyPosition } from './coordinator-helpers.ts'
import { AGENT_OWNER } from './identities.ts'
import { sameAuthority } from './same.ts'

/** Whether this runtime still advances the execution, read from who is attached to it. */
export function advancementBy(read: ExecutionSnapshot, own: Authority): LoopFacts['advancement'] {
  const source = read.executionAttachment?.source ?? own.source
  if (read.state.kind === 'ended') return { kind: 'ended', source }
  if (!sameAuthority(read.executionAttachment, own)) return { kind: 'superseded', source }
  return { kind: 'current', source }
}

/** The handoff record of the reply of one Model call at one step, when the snapshot has it. */
export function replyRecordOf(snapshot: ExecutionSnapshot, step: StepId, call: M.ModelCallId) {
  return snapshot.handoffs.find(
    record =>
      record.request.kind === 'execution' &&
      record.request.source.kind === 'model-reply' &&
      record.request.source.call === call &&
      canonical(record.request.position) === canonical(replyPosition(step)),
  )
}

export const mainPositionOf = (execution: AgentExecutionId, step: StepId): ConsumerRef => ({
  owner: AGENT_OWNER,
  work: `${execution}/${step}`,
  position: 'I3',
  purpose: 'main',
})

/** The open calls of the checkpoint without the Model call whose result was consumed as unusable. */
export function callsWithout(
  read: ExecutionSnapshot,
  consumed: Readonly<{ consumption: unknown; reference: unknown }> | null,
): readonly PendingCall[] {
  if (consumed === null) return read.checkpoint.calls
  return read.checkpoint.calls.filter(
    call =>
      call.kind !== 'model' ||
      call.consumption !== consumed.consumption ||
      call.reference !== consumed.reference,
  )
}
