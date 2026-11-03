// `McpConfig` validation (SPEC S3): every field is required, the three bounds are positive safe
// integers, and an unlawful configuration throws `RangeError` at construction.
import { describe, expect, it } from 'vitest'
import type { McpConfig } from '@omne-harness/mcp-contract'
import { validateConfig } from '../src/config.ts'
import { principalKey, type Principal } from './doubles/values.ts'

const lawful: McpConfig<Principal> = {
  principalKey,
  maxListingPages: 4,
  maxActions: 100,
  instructionsByteLimit: 4096,
}

describe('validateConfig', () => {
  it('accepts a lawful configuration and returns it', () => {
    expect(validateConfig(lawful)).toEqual(lawful)
  })

  it.each([
    ['maxListingPages', 0],
    ['maxListingPages', 1.5],
    ['maxActions', -1],
    ['maxActions', Number.MAX_SAFE_INTEGER + 1],
    ['instructionsByteLimit', 0],
    ['instructionsByteLimit', Number.NaN],
  ] as const)('throws RangeError when %s is %s', (field, value) => {
    expect(() => validateConfig({ ...lawful, [field]: value })).toThrow(RangeError)
  })

  it('throws RangeError when principalKey is not a function', () => {
    const broken: unknown = { ...lawful, principalKey: 'alice' }
    expect(() => validateConfig(broken)).toThrow(RangeError)
  })

  it('throws RangeError when the configuration is not an object', () => {
    expect(() => validateConfig(undefined)).toThrow(RangeError)
    expect(() => validateConfig(null)).toThrow(RangeError)
  })
})
