import { describe, expect, it } from 'vitest'
import { checkSessionDriverPolicy } from '../src/index.ts'

const policy = {
  scanLimit: 4,
  intervalMs: 20,
  maxTasks: 2,
  maxHeld: 8,
  maxFailures: 16,
  maxStepsPerPass: 4,
}
describe('actual driver policy boundary', () => {
  it('captures every explicit field without retaining the caller object', () => {
    const input = { ...policy }
    const result = checkSessionDriverPolicy(input)
    expect(result).toEqual({ policy })
    if ('invalidInput' in result) throw new Error('expected valid policy')
    input.maxTasks = 99
    expect(result.policy.maxTasks).toBe(2)
    expect(Object.isFrozen(result.policy)).toBe(true)
  })
  it.each([0, -1, 1.5, Infinity, NaN, 2147483648, '4', null])(
    'rejects an invalid bound %s',
    value => {
      for (const field of Object.keys(policy))
        expect(checkSessionDriverPolicy({ ...policy, [field]: value })).toEqual({
          invalidInput: true,
        })
    },
  )
  it('rejects missing fields, extra runtime objects and non-object policies', () => {
    const { maxHeld: _removed, ...missing } = policy
    for (const input of [
      missing,
      { ...policy, home: '/tmp/x' },
      { ...policy, signal: new AbortController().signal },
      null,
      [],
      1,
    ])
      expect(checkSessionDriverPolicy(input)).toEqual({ invalidInput: true })
  })
  it('accepts the complete safe inclusive integer range', () => {
    for (const boundary of [1, 2147483647]) {
      const input = Object.fromEntries(Object.keys(policy).map(field => [field, boundary]))
      expect(checkSessionDriverPolicy(input)).toEqual({ policy: input })
    }
  })
})
