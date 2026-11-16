export type ManualClock = {
  readonly schedule: (ms: number, run: () => void) => () => void
  readonly advance: (ms: number) => void
  readonly pending: () => number
  /** Resolves when the next wait of exactly `ms` is scheduled. */
  readonly nextScheduled: (ms: number) => Promise<void>
  /** Passes `stepMs` on each host turn until `done` settles: time flows, the test waits for the event. */
  readonly flowUntil: <T>(done: Promise<T>, stepMs: number) => Promise<T>
}

const hostTurn = (): Promise<void> => new Promise(resolve => setImmediate(resolve))

export function manualClock(): ManualClock {
  let now = 0
  const timers = new Set<{ at: number; run: () => void }>()
  const watchers = new Set<{ ms: number; seen: () => void }>()
  const advance = (ms: number): void => {
    now += ms
    for (const timer of [...timers].sort((a, b) => a.at - b.at)) {
      if (timer.at > now) break
      timers.delete(timer)
      timer.run()
    }
  }
  return {
    schedule(ms, run) {
      const timer = { at: now + ms, run }
      timers.add(timer)
      for (const watcher of watchers)
        if (watcher.ms === ms) {
          watchers.delete(watcher)
          watcher.seen()
        }
      return () => {
        timers.delete(timer)
      }
    },
    advance,
    pending: () => timers.size,
    nextScheduled: ms => new Promise(seen => watchers.add({ ms, seen })),
    async flowUntil(done, stepMs) {
      let settled = false
      const settle = (): void => {
        settled = true
      }
      done.then(settle, settle)
      while (!settled) {
        advance(stepMs)
        await hostTurn()
      }
      return done
    },
  }
}
