import type { JsonNumber } from '@omne-harness-lite/content-blocks'
import {
  drainDiagnosticThenable,
  interpretSettlementPrefix,
} from '@omne-harness-lite/model-request-runtime'
import type { SettlementWorkRecoveryInput } from '@omne-harness-lite/model-request-runtime'

/**
 * Seam R4 default path for one post-ACK work row left by a writer this runtime does not own:
 * the host's recovery scope must confirm the original execution absent (actual stop, not a
 * signal or fence); then the complete prefix decides. A complete batch (this one, or a first
 * winner that excludes it) or a whole absence ends the responsibility and retires the row; the
 * consumer re-applies with its own value. Anything unreadable or residual keeps the row.
 */
export async function recoverSettlementWork(input: SettlementWorkRecoveryInput): Promise<void> {
  const { key, binding } = input
  const emit = (kind: string, dispatch: JsonNumber = 0) => {
    try {
      drainDiagnosticThenable(
        input.diagnostic({
          kind,
          tenant: binding.tenant,
          session: key.session,
          call: key.callId,
          dispatch,
          response: input.response,
          owner: input.scope.owner.name,
          policy: 'recovery',
          submissions: 0,
          tailConflicts: 0,
        }),
      )
    } catch {
      // A diagnostic failure is not a recovery fact.
    }
  }
  if (input.work.owns(key)) return
  const read = await input.work.store.read({ binding, call: key.callId, response: input.response })
  if ('absent' in read) return
  // An unreadable row is never evidence of absence: the pending item stays.
  if ('unavailable' in read) return emit('settlement_work.recovery_unreadable')
  const { staged, workId, generation } = read.work
  const original = input.scope.originalInvocation(key, staged.target)
  if (!('absent' in original))
    return emit('settlement_work.recovery_writer_unproven', staged.target.dispatch)
  const interpreted = interpretSettlementPrefix({
    prefix: input.prefix,
    target: staged.target,
    current: staged.current,
  })
  if ('unavailable' in interpreted)
    return emit('settlement_work.recovery_retained', staged.target.dispatch)
  const members = interpreted.facts.members
  if (!('completeMembers' in members) && !('absent' in members))
    return emit('settlement_work.recovery_retained', staged.target.dispatch)
  emit(
    'completeMembers' in members
      ? 'settlement_work.recovery_recognized'
      : 'settlement_work.recovery_ended',
    staged.target.dispatch,
  )
  await input.custody.retireWork({
    binding,
    ref: key,
    response: input.response,
    workId,
    generation,
  })
}
