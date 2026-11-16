import { describe, expect, it } from 'vitest'
import { parseRetryPolicy } from '@omne-harness/retry'

const valid = { maxAttempts: 3, maxElapsedMs: 1000, delaysMs: [10, 20], jitter: 0.5 }

function rejects(value: unknown, field: string): void {
  expect(() => parseRetryPolicy(value)).toThrow(TypeError)
  expect(() => parseRetryPolicy(value)).toThrow(field)
}

describe('parseRetryPolicy', () => {
  it.each([null, undefined, 3, 'policy', [1, 2]])(
    'rejects %j because it is not an object',
    value => {
      expect(() => parseRetryPolicy(value)).toThrow(TypeError)
    },
  )

  it.each(['maxAttempts', 'maxElapsedMs', 'delaysMs', 'jitter'])(
    'rejects a policy without %s',
    field => {
      const { [field as keyof typeof valid]: _dropped, ...rest } = valid
      rejects(rest, field)
    },
  )

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '3'])(
    'rejects maxAttempts %j',
    maxAttempts => rejects({ ...valid, maxAttempts }, 'maxAttempts'),
  )

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, '10'])(
    'rejects maxElapsedMs %j',
    maxElapsedMs => rejects({ ...valid, maxElapsedMs }, 'maxElapsedMs'),
  )

  it.each([[], 'x', [10, -1], [Number.NaN], [Number.POSITIVE_INFINITY], ['10']])(
    'rejects delaysMs %j',
    delaysMs => rejects({ ...valid, delaysMs }, 'delaysMs'),
  )

  it.each([-0.01, 1.01, Number.NaN, '0.5'])('rejects jitter %j', jitter =>
    rejects({ ...valid, jitter }, 'jitter'),
  )

  it('accepts the boundary values', () => {
    const policy = parseRetryPolicy({ maxAttempts: 1, maxElapsedMs: 0, delaysMs: [0], jitter: 1 })
    expect(policy).toEqual({ maxAttempts: 1, maxElapsedMs: 0, delaysMs: [0], jitter: 1 })
    expect(parseRetryPolicy({ ...valid, jitter: 0 }).jitter).toBe(0)
  })

  it('returns a new frozen object with a frozen copy of the delays and drops extra fields', () => {
    const delaysMs = [10, 20]
    const policy = parseRetryPolicy({ ...valid, delaysMs, extra: true })
    expect(policy).toEqual({ maxAttempts: 3, maxElapsedMs: 1000, delaysMs: [10, 20], jitter: 0.5 })
    expect(Object.keys(policy).sort()).toEqual([
      'delaysMs',
      'jitter',
      'maxAttempts',
      'maxElapsedMs',
    ])
    expect(Object.isFrozen(policy)).toBe(true)
    expect(Object.isFrozen(policy.delaysMs)).toBe(true)
    expect(policy.delaysMs).not.toBe(delaysMs)
    delaysMs.push(30)
    expect(policy.delaysMs).toEqual([10, 20])
  })
})
