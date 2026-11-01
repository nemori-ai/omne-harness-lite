import type { SystemActionClock } from '../system-reference.ts'

export type ManualSystemClock = Readonly<{
  clock: SystemActionClock
  /** From now on `expiresAt` counts as reached. */
  expire(expiresAt: string): void
  /** From now on the clock answers `unavailable` with this diagnostic. */
  fail(diagnostic: string): void
  /** The end times that were asked about, in order. */
  asked(): readonly string[]
}>

/** A clock that decides which end times are reached. No end time is reached until `expire` says so. */
export function manualSystemClock(): ManualSystemClock {
  const reached = new Set<string>()
  const asked: string[] = []
  let outage: string | null = null
  const clock: SystemActionClock = {
    reached: expiresAt => {
      asked.push(expiresAt)
      if (outage !== null) return Promise.resolve({ kind: 'unavailable', diagnostic: outage })
      return Promise.resolve({ kind: reached.has(expiresAt) ? 'reached' : 'pending' })
    },
  }
  return {
    clock,
    expire: expiresAt => {
      reached.add(expiresAt)
    },
    fail: diagnostic => {
      outage = diagnostic
    },
    asked: () => [...asked],
  }
}
