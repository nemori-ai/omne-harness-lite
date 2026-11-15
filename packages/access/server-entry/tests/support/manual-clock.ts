export type ManualClock = {
  readonly schedule: (ms: number, run: () => void) => () => void
  readonly advance: (ms: number) => void
  readonly pending: () => number
}

export function manualClock(): ManualClock {
  let now = 0
  const timers = new Set<{ at: number; run: () => void }>()
  return {
    schedule(ms, run) {
      const timer = { at: now + ms, run }
      timers.add(timer)
      return () => {
        timers.delete(timer)
      }
    },
    advance(ms) {
      now += ms
      for (const timer of [...timers].sort((a, b) => a.at - b.at)) {
        if (timer.at > now) break
        timers.delete(timer)
        timer.run()
      }
    },
    pending: () => timers.size,
  }
}
