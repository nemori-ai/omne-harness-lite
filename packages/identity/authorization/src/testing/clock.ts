import type { SystemActionClock } from '../system-reference.ts'

export type ManualSystemClock = Readonly<{
  clock: SystemActionClock
  pend(expiresAt: string): void
  expire(expiresAt: string): void
  fail(diagnostic: string): void
  asked(): readonly string[]
}>

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
