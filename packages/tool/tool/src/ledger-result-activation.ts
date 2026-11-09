// The settler's clock (BodyLifecycle `Now("settler")`): one reading fixes the expiry of the linked
// body and the due of the orphans of the same settlement.
import { fail } from '@omne-harness/operation-result'
import type { ToolInstant, ToolInstantClock } from '@omne-harness/tool-contract/provider'
import type { Decision } from './ledger-decider.ts'
import { activateResult, type PreparedResult, type ResultValue } from './ledger-result-material.ts'

export async function activateResultDecision<T>(
  prepared: PreparedResult,
  clock: ToolInstantClock | undefined,
  decide: (value: ResultValue, settledAt: ToolInstant | null) => Decision<T> | Promise<Decision<T>>,
): Promise<Decision<T>> {
  if (clock === undefined) {
    if (prepared.value.original.kind !== 'none')
      return {
        kind: 'reply',
        outcome: fail({
          kind: 'unavailable',
          dependency: 'body-store',
          diagnostic: 'body custody is not connected',
        }),
      }
    const value = activateResult(prepared, null)
    return 'failure' in value ? { kind: 'reply', outcome: value } : decide(value.ok, null)
  }
  const now = clock.now()
  const value = activateResult(prepared, now)
  return 'failure' in value ? { kind: 'reply', outcome: value } : decide(value.ok, now)
}
