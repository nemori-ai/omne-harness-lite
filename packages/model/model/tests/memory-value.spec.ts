import { expect, it } from 'vitest'
import { canonical } from '../src/testing/value.ts'

it('canonicalizes nested data in sorted key order without consulting toJSON', () => {
  const value = { z: [null, true, -0, { b: 2, a: 'x' }], a: false }
  Object.defineProperty(value, 'toJSON', {
    value: () => {
      throw new Error('toJSON')
    },
  })
  expect(canonical(value)).toBe('{"a":false,"z":[null,true,0,{"a":"x","b":2}]}')
})

it('preserves rejection order and never invokes object accessors', () => {
  let invoked = false
  const value = Object.defineProperty({ z: undefined }, 'a', {
    enumerable: true,
    get() {
      invoked = true
      return 1
    },
  })
  expect(() => canonical(value)).toThrow('Model values must be data')
  expect(invoked).toBe(false)
  expect(() => canonical([, 1])).toThrow('Model arrays must be dense')
  for (const unsupported of [undefined, NaN, Infinity, 1n])
    expect(() => canonical(unsupported)).toThrow('Model values must be finite data')
  const cyclic: unknown[] = []
  cyclic.push(cyclic)
  expect(() => canonical(cyclic)).toThrow(RangeError)
})
