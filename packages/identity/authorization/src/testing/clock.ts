import type { SystemActionClock } from '../system-reference.ts'

export type ManualSystemClock = Readonly<{
  clock: SystemActionClock
  /** From now on `expiresAt` counts as not reached yet. */
  pend(expiresAt: string): void
  /** From now on `expiresAt` counts as reached. */
  expire(expiresAt: string): void
  /** From now on the clock answers `unavailable` with this diagnostic. */
  fail(diagnostic: string): void
  /** The end times that were asked about, in order. */
  asked(): readonly string[]
}>

/** A clock that knows only the end times it was told about; for any other it answers `unavailable`. */
export function manualSystemClock(): ManualSystemClock {
  const pending = new Set<string>()
  const reached = new Set<string>()
  const asked: string[] = []
  let outage: string | null = null
  const clock: SystemActionClock = {
    reached: expiresAt => {
      asked.push(expiresAt)
      if (outage !== null) return Promise.resolve({ kind: 'unavailable', diagnostic: outage })
      if (reached.has(expiresAt)) return Promise.resolve({ kind: 'reached' })
      if (pending.has(expiresAt)) return Promise.resolve({ kind: 'pending' })
      return Promise.resolve({
        kind: 'unavailable',
        diagnostic: `no answer scripted for ${expiresAt}`,
      })
    },
  }
  return {
    clock,
    pend: expiresAt => {
      pending.add(expiresAt)
    },
    expire: expiresAt => {
      reached.add(expiresAt)
    },
    fail: diagnostic => {
      outage = diagnostic
    },
    asked: () => [...asked],
  }
}
