// The settler's clock (BodyLifecycle `Now("settler")`): one reading fixes the expiry of the linked
// body and the due of the orphans of the same settlement.
import { fail } from '@omne-harness/operation-result'
import type { ToolInstant, ToolInstantClock } from '@omne-harness/tool-contract/provider'
import type { Decision } from './ledger-decider.ts'
import {
  activateResultChannels,
  type PreparedResultChannels,
  type ResultChannels,
} from './ledger-result-material.ts'

export async function activateResultDecision<T>(
  prepared: PreparedResultChannels,
  clock: ToolInstantClock | undefined,
  decide: (
    channels: ResultChannels,
    settledAt: ToolInstant | null,
  ) => Decision<T> | Promise<Decision<T>>,
): Promise<Decision<T>> {
  if (clock === undefined) {
    if (prepared.original.kind !== 'none')
      return {
        kind: 'reply',
        outcome: fail({
          kind: 'unavailable',
          dependency: 'body-store',
          diagnostic: 'body custody is not connected',
        }),
      }
    const channels = activateResultChannels(prepared, null)
    return 'failure' in channels ? { kind: 'reply', outcome: channels } : decide(channels.ok, null)
  }
  const now = clock.now()
  const channels = activateResultChannels(prepared, now)
  return 'failure' in channels ? { kind: 'reply', outcome: channels } : decide(channels.ok, now)
}
