import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_JOURNAL_INTERPRETATION_RETRY,
  nextRetry,
  type JournalInterpretationRetry,
} from '../src/cordis/journal-interpretation.ts'

const policies: fc.Arbitrary<JournalInterpretationRetry> = fc
  .record({
    initialMs: fc.double({ min: 0.5, max: 2000, noNaN: true }),
    multiplier: fc.double({ min: 1, max: 8, noNaN: true }),
    room: fc.double({ min: 0, max: 60_000, noNaN: true }),
  })
  .map(({ initialMs, multiplier, room }) => ({ initialMs, multiplier, maxMs: initialMs + room }))

function waitsOf(policy: JournalInterpretationRetry, failures: number): number[] {
  const waits: number[] = []
  let retry: ReturnType<typeof nextRetry> | null = null
  for (let n = 1; n <= failures; n += 1) {
    retry = nextRetry(policy, retry)
    expect(retry.calls).toBe(n)
    waits.push(retry.wait)
  }
  return waits
}

describe('the waits between the calls of one interpretation that keeps failing', () => {
  it('start at initialMs, never go under it, never over maxMs, and never get shorter', () => {
    fc.assert(
      fc.property(policies, fc.integer({ min: 1, max: 80 }), (policy, failures) => {
        const waits = waitsOf(policy, failures)
        expect(waits[0]).toBe(policy.initialMs)
        for (const [n, wait] of waits.entries()) {
          expect(wait).toBeGreaterThanOrEqual(policy.initialMs)
          expect(wait).toBeLessThanOrEqual(policy.maxMs)
          if (n > 0) expect(wait).toBeGreaterThanOrEqual(waits[n - 1]!)
        }
      }),
      { numRuns: 300 },
    )
  })

  it('with the policy of the release: 50 ms, doubling, 5 seconds at most', () => {
    expect(waitsOf(DEFAULT_JOURNAL_INTERPRETATION_RETRY, 9)).toEqual([
      50, 100, 200, 400, 800, 1600, 3200, 5000, 5000,
    ])
  })
})
