// The read output limit is an assembly parameter of `sessionStorageMaterials` (SPEC K-1): required,
// a positive safe integer, and the value that every read handler carries as `maxOutputBytes`. The
// member has no default, so a missing or wrong value fails where the materials are built.
import { describe, expect, it } from 'vitest'
import { sessionStorageMaterials } from '../src/materials.ts'

const call = (options: unknown) =>
  (sessionStorageMaterials as (options: unknown) => unknown)(options)

describe('sessionStorageMaterials readOutputLimitBytes', () => {
  it.each([
    ['no options', undefined],
    ['an empty options object', {}],
    ['undefined', { readOutputLimitBytes: undefined }],
    ['null', { readOutputLimitBytes: null }],
    ['zero', { readOutputLimitBytes: 0 }],
    ['a negative number', { readOutputLimitBytes: -1 }],
    ['a fraction', { readOutputLimitBytes: 1.5 }],
    ['NaN', { readOutputLimitBytes: Number.NaN }],
    ['Infinity', { readOutputLimitBytes: Number.POSITIVE_INFINITY }],
    ['an integer past the safe range', { readOutputLimitBytes: 2 ** 53 }],
    ['a numeric text', { readOutputLimitBytes: '1048576' }],
  ])('refuses %s when the materials are built', (_name, options) => {
    expect(() => call(options)).toThrow('readOutputLimitBytes must be a positive safe integer')
  })

  it.each([1, 1048576, 20971520, Number.MAX_SAFE_INTEGER])(
    'gives every read handler the limit %i as its maxOutputBytes',
    limit => {
      const { readHandlers } = sessionStorageMaterials({ readOutputLimitBytes: limit })
      expect(readHandlers.length).toBeGreaterThan(0)
      for (const handler of readHandlers) expect(handler.maxOutputBytes).toBe(limit)
    },
  )

  it('keeps one limit per build: two builds with different limits do not share it', () => {
    const small = sessionStorageMaterials({ readOutputLimitBytes: 1024 })
    const large = sessionStorageMaterials({ readOutputLimitBytes: 4096 })
    expect(new Set(small.readHandlers.map(handler => handler.maxOutputBytes))).toEqual(
      new Set([1024]),
    )
    expect(new Set(large.readHandlers.map(handler => handler.maxOutputBytes))).toEqual(
      new Set([4096]),
    )
  })
})
