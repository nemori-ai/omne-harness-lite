import { fail } from '@omne-harness/operation-result'
import type { ToolMaterialClock } from '@omne-harness/tool-contract/provider'
import type { Decision, Snapshot } from './ledger-decider.ts'
import { sampleMaterialTime } from './ledger-material-custody.ts'
import {
  activateResultChannels,
  type PreparedResultChannels,
  type ResultChannels,
} from './ledger-result-material.ts'

export async function activateResultDecision<T>(
  snapshot: Snapshot,
  prepared: PreparedResultChannels,
  clock: ToolMaterialClock | undefined,
  decide: (channels: ResultChannels) => Decision<T> | Promise<Decision<T>>,
): Promise<Decision<T>> {
  if (prepared.original.kind === 'none') {
    const channels = activateResultChannels(prepared, null)
    return 'failure' in channels ? { kind: 'reply', outcome: channels } : decide(channels.ok)
  }
  if (clock === undefined)
    return {
      kind: 'reply',
      outcome: fail({
        kind: 'unavailable',
        dependency: 'material-clock',
        diagnostic: 'body activation clock is not connected',
      }),
    }
  const time = await sampleMaterialTime(clock, snapshot.materialTime)
  if ('failure' in time) return { kind: 'reply', outcome: time }
  const channels = activateResultChannels(prepared, time.ok)
  if ('failure' in channels) return { kind: 'reply', outcome: channels }
  const decision = await decide(channels.ok)
  return decision.kind === 'reply'
    ? decision
    : {
        ...decision,
        writes: [
          ...decision.writes,
          { kind: 'put', record: { kind: 'material-time', time: { highWatermark: time.ok } } },
        ],
      }
}
