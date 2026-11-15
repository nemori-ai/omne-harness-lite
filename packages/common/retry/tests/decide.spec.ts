import { describe, expect, it, vi } from 'vitest'
import { decideRetry, parseRetryPolicy, type RetryPolicy } from '@omne-harness/retry'

const policy = parseRetryPolicy({
  maxAttempts: 4,
  maxElapsedMs: 1000,
  delaysMs: [100, 200],
  jitter: 0.5,
})
const fixed = (u: number) => () => u

describe('decideRetry', () => {
  it('is exhausted by attempts once failures reach maxAttempts, without drawing a random number', () => {
    const random = vi.fn(fixed(0))
    expect(decideRetry(policy, { failures: 4, elapsedMs: 0 }, random)).toEqual({
      kind: 'exhausted',
      by: 'attempts',
    })
    expect(decideRetry(policy, { failures: 9, elapsedMs: 0 }, random)).toEqual({
      kind: 'exhausted',
      by: 'attempts',
    })
    expect(random).not.toHaveBeenCalled()
  })

  it('is exhausted by elapsed time when the next delay would pass maxElapsedMs', () => {
    expect(decideRetry(policy, { failures: 1, elapsedMs: 901 }, fixed(0))).toEqual({
      kind: 'exhausted',
      by: 'elapsed',
    })
    expect(decideRetry(policy, { failures: 1, elapsedMs: 900 }, fixed(0))).toEqual({
      kind: 'retry',
      attempt: 2,
      delayMs: 100,
    })
  })

  it('reuses the last delay once failures pass the length of delaysMs', () => {
    expect(decideRetry(policy, { failures: 2, elapsedMs: 0 }, fixed(0))).toEqual({
      kind: 'retry',
      attempt: 3,
      delayMs: 200,
    })
    expect(decideRetry(policy, { failures: 3, elapsedMs: 0 }, fixed(0))).toEqual({
      kind: 'retry',
      attempt: 4,
      delayMs: 200,
    })
  })

  it('keeps the base delay when jitter is 0', () => {
    const plain = parseRetryPolicy({ ...policy, jitter: 0 })
    expect(decideRetry(plain, { failures: 1, elapsedMs: 0 }, fixed(0.9))).toEqual({
      kind: 'retry',
      attempt: 2,
      delayMs: 100,
    })
  })

  it('gives the base delay for u = 0 and nearly base * (1 - jitter) for u close to 1', () => {
    expect(decideRetry(policy, { failures: 1, elapsedMs: 0 }, fixed(0))).toMatchObject({
      delayMs: 100,
    })
    expect(decideRetry(policy, { failures: 1, elapsedMs: 0 }, fixed(0.999999))).toMatchObject({
      delayMs: 50,
    })
    expect(decideRetry(policy, { failures: 1, elapsedMs: 0 }, fixed(0.25))).toMatchObject({
      delayMs: 88,
    })
  })

  it('draws the random number exactly once when it computes a delay', () => {
    const random = vi.fn(fixed(0.5))
    decideRetry(policy, { failures: 1, elapsedMs: 999 }, random)
    expect(random).toHaveBeenCalledTimes(1)
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects failures %j', failures => {
    expect(() => decideRetry(policy, { failures, elapsedMs: 0 }, fixed(0))).toThrow(RangeError)
  })

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])('rejects elapsedMs %j', elapsedMs => {
    expect(() => decideRetry(policy, { failures: 1, elapsedMs }, fixed(0))).toThrow(RangeError)
  })

  it.each([-0.1, 1, 1.5, Number.NaN])('rejects a random number %j', u => {
    expect(() => decideRetry(policy, { failures: 1, elapsedMs: 0 }, fixed(u))).toThrow(RangeError)
  })

  it('rejects a hand-built policy without delays', () => {
    const empty: RetryPolicy = { maxAttempts: 2, maxElapsedMs: 10, delaysMs: [], jitter: 0 }
    expect(() => decideRetry(empty, { failures: 1, elapsedMs: 0 }, fixed(0))).toThrow(RangeError)
  })

  it('keeps every delay within [round(base * (1 - jitter)), base] for every failure count', () => {
    const policies: RetryPolicy[] = [
      parseRetryPolicy({
        maxAttempts: 6,
        maxElapsedMs: 1e9,
        delaysMs: [1000, 5000, 30000],
        jitter: 0.2,
      }),
      parseRetryPolicy({ maxAttempts: 5, maxElapsedMs: 1e9, delaysMs: [3, 7], jitter: 1 }),
      parseRetryPolicy({ maxAttempts: 4, maxElapsedMs: 1e9, delaysMs: [0, 11], jitter: 0.37 }),
    ]
    const draws = [0, 0.1, 0.33, 0.5, 0.77, 0.9999999]
    for (const each of policies)
      for (let failures = 1; failures < each.maxAttempts; failures++) {
        const base = each.delaysMs[Math.min(failures, each.delaysMs.length) - 1] ?? 0
        for (const u of draws) {
          const decision = decideRetry(each, { failures, elapsedMs: 0 }, fixed(u))
          if (decision.kind !== 'retry') throw new Error('expected a retry')
          expect(decision.attempt).toBe(failures + 1)
          expect(decision.delayMs).toBeGreaterThanOrEqual(Math.round(base * (1 - each.jitter)))
          expect(decision.delayMs).toBeLessThanOrEqual(base)
        }
      }
  })
})
