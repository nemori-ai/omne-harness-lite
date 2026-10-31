import { completeEvidence } from './journal-values.ts'
import type { CommandReceipt, ModelReplyAdmission, PendingCall } from '@omne-harness/agent-contract'
import type { CallBinding } from '@omne-harness/session-contract'
import { resolveModelInvocationRef } from '@omne-harness/model-contract'
import type { CommonRoot } from './root.ts'
import type { MemoryExecution } from './journal.ts'
import { pendingCalls, registration } from './history.ts'
import { canonical } from './canonical.ts'

export type ModelSettlement = Readonly<{
  receipt: CommandReceipt
  admission: ModelReplyAdmission
  pending: Extract<PendingCall, { kind: 'model' }>
  binding: CallBinding
}>
/** Admission carries the Agent's settled-reply premise. Result storage alone never does. */
export function captureModelSettlement(
  root: CommonRoot,
  execution: MemoryExecution,
  receipt: CommandReceipt,
  admission: ModelReplyAdmission | null,
): readonly ModelSettlement[] {
  if (!admission || !admission.resultVersion || !completeEvidence(admission.source)) return []
  if (!execution.admissions.some(item => canonical(item.fact) === canonical(admission))) return []
  const candidates = pendingCalls(execution)
    .filter(
      (pending): pending is Extract<PendingCall, { kind: 'model' }> =>
        pending.kind === 'model' && pending.action === admission.action,
    )
    .filter(pending => {
      const value = resolveModelInvocationRef(pending.reference, execution.tenant)
      return 'ok' in value && value.ok.call === admission.call
    })
  const unique = new Map(candidates.map(pending => [canonical(pending), pending]))
  if (unique.size !== 1) return []
  const pending = unique.values().next().value
  if (!pending) return []
  if (root.agent.effectSteps.get(`${execution.id}\0${pending.action}`) !== admission.step) return []
  const stored =
    execution.results.some(
      item =>
        item.consumption === pending.consumption &&
        item.result.producer.kind === 'model' &&
        item.result.producer.call === admission.call &&
        item.result.version === admission.resultVersion,
    ) ||
    execution.entries.some(
      item =>
        item.kind === 'received' &&
        item.consumption === pending.consumption &&
        canonical(item.consumer) === canonical(pending.position) &&
        item.delivery.producer === 'model' &&
        item.delivery.key.kind === 'result' &&
        item.delivery.key.reference === pending.reference &&
        item.delivery.key.result === admission.resultVersion,
    )
  if (!stored) return []
  const value = registration(root, execution, pending)
  if (value.kind !== 'associated') return []
  const fragment = { receipt, admission, pending, binding: value.binding }
  return (root.agent.modelSettlements.get(execution.id) ?? []).some(
    item =>
      canonical(item.admission) === canonical(admission) &&
      canonical(item.binding) === canonical(value.binding),
  )
    ? []
    : [structuredClone(fragment)]
}
