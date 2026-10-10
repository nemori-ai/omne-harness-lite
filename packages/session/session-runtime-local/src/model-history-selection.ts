import {
  captureModelLogHistory,
  ModelLogHistory,
  settlementGenerationCurrent,
  type SettlementLogBinding,
} from '@omne-harness-lite/model-request-runtime'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'

/** Read the original durable choice without changing it or testing model availability. */
export async function readSessionOriginalModelSelection(
  binding: SettlementLogBinding,
): Promise<{ readonly selected: string | null } | { readonly unavailable: true }> {
  if (!settlementGenerationCurrent(binding)) return { unavailable: true }
  const received = await binding.readPrefix?.()
  if (!received || 'failure' in received || !settlementGenerationCurrent(binding))
    return { unavailable: true }
  const captured =
    'history' in received && ModelLogHistory.owns(received.history)
      ? received
      : captureModelLogHistory(null, received)
  if ('failure' in captured) return { unavailable: true }
  const history = captured.history
  if (!sameSession(history, binding)) return { unavailable: true }
  const result = history.modelSelection()
  return settlementGenerationCurrent(binding) ? result : { unavailable: true }
}

function sameSession(history: ModelLogHistory, binding: SettlementLogBinding): boolean {
  return (
    history.source.session === binding.session &&
    tenantIdEquals(history.source.tenant, binding.tenant)
  )
}
