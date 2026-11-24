import type { Instant, TenantId } from '@omne-harness/notification-contract'
import type { ClockHints } from '@omne-harness/notification'

/** The two waits notification needs from the time the assembly runs on; each returns its cancel. */
export type Timers = Readonly<{
  after(delayMs: number, fire: () => void): () => void
  at(epochMs: number, fire: () => void): () => void
}>

export type WakeUps = ClockHints & Readonly<{ stop(): void }>

/** Keeps one wait per tenant, for the earliest instant asked for. A later hint for the same tenant is dropped: the pass that the earlier one starts asks again. */
export function createWakeUps(timers: Timers, wake: (tenant: TenantId) => void): WakeUps {
  const scheduled = new Map<TenantId, { at: Instant; cancel: () => void }>()
  let stopped = false
  return {
    wakeAt(tenant, at) {
      if (stopped) return
      const current = scheduled.get(tenant)
      if (current !== undefined && current.at <= at) return
      current?.cancel()
      const cancel = timers.at(Date.parse(at), () => {
        scheduled.delete(tenant)
        wake(tenant)
      })
      scheduled.set(tenant, { at, cancel })
    },
    stop() {
      stopped = true
      for (const { cancel } of scheduled.values()) cancel()
    },
  }
}
