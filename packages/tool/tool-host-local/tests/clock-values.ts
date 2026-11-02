// Manual time sources for the host clock tests: `advance` moves both readings and fires the
// sleepers that came due, `setBack` turns only the wall time back.
import type { LocalToolClockInput } from '@omne-harness/tool-host-local'

const ORIGIN = Date.parse('2026-11-01T00:00:00.000Z')

export function manualSources() {
  let wall = ORIGIN
  let monotonic = 5_000
  const sleepers = new Set<{ due: number; resolve(answer: 'elapsed' | 'cancelled'): void }>()
  const sources: LocalToolClockInput = {
    wallMs: () => wall,
    monotonicMs: () => monotonic,
    sleep: (milliseconds, signal) => {
      if (signal.aborted) return Promise.resolve('cancelled')
      return new Promise(resolve => {
        const sleeper = { due: monotonic + milliseconds, resolve }
        sleepers.add(sleeper)
        signal.addEventListener(
          'abort',
          () => {
            sleepers.delete(sleeper)
            resolve('cancelled')
          },
          { once: true },
        )
      })
    },
  }
  return {
    sources,
    advance: (milliseconds: number) => {
      wall += milliseconds
      monotonic += milliseconds
      for (const sleeper of sleepers)
        if (sleeper.due <= monotonic) {
          sleepers.delete(sleeper)
          sleeper.resolve('elapsed')
        }
    },
    setBack: (milliseconds: number) => {
      wall -= milliseconds
    },
    instantAfter: (milliseconds: number) => new Date(wall + milliseconds).toISOString(),
  }
}
