import type { ScheduleInstant } from '@omne-harness/schedule-contract'
import { admitCommand, iso, refreshCommand, type DispatcherPorts } from './prepare.ts'
import type { DispatchCommand } from './types.ts'

export {
  reminderDeadline,
  type DispatcherPorts,
  type DispatcherTime,
  type OwnerStanding,
  type Prediction,
  type PredictionPage,
} from './prepare.ts'

export type RoundReport = Readonly<{
  kind: 'done' | 'unavailable'
  refreshed: number
  disposed: number
}>

export function createDispatcher(ports: DispatcherPorts) {
  const { store, time, policy } = ports
  let stopping = false
  let inflight: Promise<RoundReport> | undefined
  let cancelWait = (): void => {}
  let cancelHint = (): void => {}

  const committed = async (command: DispatchCommand | null) =>
    command !== null && (await store.commit(command)).kind === 'committed'

  /** One round: the heartbeat first, then what management changed, then every due slot, each in its own commit. */
  async function once(): Promise<RoundReport> {
    let refreshed = 0
    let disposed = 0
    let earliest: ScheduleInstant | null = null
    await store.commit({
      kind: 'beat',
      owner: ports.owner,
      at: iso(time.now()),
      gapMs: policy.gapMs,
    })
    for (let step = 0; step < policy.roundLimit && !stopping; step += 1) {
      const at = iso(time.now())
      const pending = await store.pending(at, policy.roundLimit)
      if (pending.kind === 'unavailable') return { kind: 'unavailable', refreshed, disposed }
      const { stale, due, watch } = pending.value
      earliest = pending.value.earliest
      let moved = 0
      for (const item of stale)
        moved += Number(await committed(await refreshCommand(ports, item, at)))
      refreshed += moved
      for (const item of due) {
        const done = Number(await committed(await admitCommand(ports, item, watch, at)))
        disposed += done
        moved += done
      }
      if (moved === 0) break
    }
    if (earliest !== null) hint(earliest)
    return { kind: 'done', refreshed, disposed }
  }

  function round(): Promise<RoundReport> {
    if (stopping) return Promise.resolve({ kind: 'done', refreshed: 0, disposed: 0 })
    inflight ??= once().finally(() => {
      inflight = undefined
    })
    return inflight
  }

  /** A wall-clock hint for the next due slot; the periodic round stays the authority. */
  function hint(at: ScheduleInstant): void {
    cancelHint()
    if (stopping) return
    cancelHint = time.at(Date.parse(at), () => void round().catch(error => ports.report?.(error)))
  }

  function arm(): void {
    if (stopping) return
    cancelWait = time.after(policy.intervalMs, () => {
      void round()
        .catch(error => ports.report?.(error))
        .finally(arm)
    })
  }

  return {
    round,
    start(): void {
      void round()
        .catch(error => ports.report?.(error))
        .finally(arm)
    },
    async close(): Promise<void> {
      stopping = true
      cancelWait()
      cancelHint()
      await inflight?.catch(() => undefined)
    },
  }
}
