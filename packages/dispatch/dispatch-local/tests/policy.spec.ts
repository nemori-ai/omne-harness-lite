import { describe, expect, it } from 'vitest'
import { DispatchPolicyError, dispatchPolicySchema, parsePolicy } from '../src/policy.ts'

const sound = { maxOpen: 4, reconcileIntervalMs: 30_000 }

describe('the policy of the provider has no silent default', () => {
  it('parses a complete policy as it is', () => {
    expect(parsePolicy(sound)).toEqual(sound)
    expect(dispatchPolicySchema.parse({ maxOpen: 1, reconcileIntervalMs: 1000 })).toEqual({
      maxOpen: 1,
      reconcileIntervalMs: 1000,
    })
  })

  it.each([
    ['nothing', undefined],
    ['a missing limit', { reconcileIntervalMs: 30_000 }],
    ['a missing interval', { maxOpen: 4 }],
    ['no open dispatch at all', { ...sound, maxOpen: 0 }],
    ['more open dispatches than 64', { ...sound, maxOpen: 65 }],
    ['an interval under a second', { ...sound, reconcileIntervalMs: 999 }],
    ['a limit that is not a whole number', { ...sound, maxOpen: 1.5 }],
    ['a member the policy does not have', { ...sound, retries: 3 }],
  ])('refuses %s, and says which value', (_label, input) => {
    expect(() => parsePolicy(input)).toThrow(DispatchPolicyError)
    expect(() => parsePolicy(input)).toThrow(/The dispatch policy is missing or invalid: /u)
  })

  it('names the member that is wrong', () => {
    expect(() => parsePolicy({ ...sound, maxOpen: 0 })).toThrow(/maxOpen: /u)
  })
})
