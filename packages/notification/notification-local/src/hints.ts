import type { Instant, TenantId } from '@omne-harness/notification-contract'
import type { Clock, ClockHints } from '@omne-harness/notification'

export type Timers = Readonly<{
  set(run: () => void, delayMs: number): unknown
  clear(timer: unknown): void
}>

export const realTimers: Timers = {
  set: (run, delayMs) => setTimeout(run, delayMs),
  clear: timer => clearTimeout(timer as ReturnType<typeof setTimeout>),
}

export type WakeUps = ClockHints & Readonly<{ stop(): void }>

/** Keeps one timer per tenant, for the earliest instant asked for. A later hint for the same tenant is dropped: the pass that the earlier one starts asks again. */
export function createWakeUps(
  clock: Clock,
  timers: Timers,
  wake: (tenant: TenantId) => void,
): WakeUps {
  const scheduled = new Map<TenantId, { at: Instant; timer: unknown }>()
  let stopped = false
  return {
    wakeAt(tenant, at) {
      if (stopped) return
      const current = scheduled.get(tenant)
      if (current !== undefined && current.at <= at) return
      if (current !== undefined) timers.clear(current.timer)
      const delay = Math.max(0, Date.parse(at) - Date.parse(clock.now()))
      const timer = timers.set(() => {
        scheduled.delete(tenant)
        wake(tenant)
      }, delay)
      scheduled.set(tenant, { at, timer })
    },
    stop() {
      stopped = true
      for (const { timer } of scheduled.values()) timers.clear(timer)
    },
  }
}
