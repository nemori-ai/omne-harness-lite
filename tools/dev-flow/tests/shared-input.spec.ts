import { describe, expect, it } from 'vitest'
import { array, InputError, record, text } from '../src/shared/input.ts'

describe('input judgements', () => {
  it('returns an object and refuses null, an array and a primitive', () => {
    const value = { a: 1 }
    expect(record(value, 'v')).toBe(value)
    for (const bad of [null, [], 'x', 1])
      expect(() => record(bad, 'config.v')).toThrow(
        new InputError('config.v must be an object'),
      )
  })
  it('returns a string, the empty string included, and refuses other values', () => {
    expect(text('', 'v')).toBe('')
    expect(text('x', 'v')).toBe('x')
    for (const bad of [null, 1, {}, ['x']])
      expect(() => text(bad, 'v.name')).toThrow(new InputError('v.name must be a string'))
  })
  it('returns an array and refuses an object', () => {
    const value = [1]
    expect(array(value, 'v')).toBe(value)
    expect(() => array({ 0: 1 }, 'v.items')).toThrow(new InputError('v.items must be an array'))
  })
  it('names the error so callers and logs can tell it from other failures', () => {
    const error = new InputError('m')
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('DeliveryInputError')
  })
})
