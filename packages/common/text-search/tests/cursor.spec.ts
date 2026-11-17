import { describe, expect, it } from 'vitest'
import { decodeCursor, encodeCursor } from '../src/index.ts'

const binding = 'a'.repeat(64)

describe('cursor', () => {
  it('round-trips a binding and an offset in the existing format', () => {
    const text = encodeCursor({ binding, offset: 3 })
    expect(Buffer.from(text, 'base64url').toString('utf8')).toBe(`[2,"${binding}",3]`)
    expect(decodeCursor(text)).toEqual({ binding, offset: 3 })
  })
  it('refuses text that is too long or not base64url', () => {
    expect(decodeCursor('A'.repeat(193))).toBeNull()
    expect(decodeCursor('abc+/')).toBeNull()
    expect(decodeCursor('')).toBeNull()
  })
  it('refuses text that does not read as JSON', () => {
    expect(decodeCursor(Buffer.from('[2,', 'utf8').toString('base64url'))).toBeNull()
  })
  it('refuses JSON of another shape', () => {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
    for (const value of [
      [1, binding, 3],
      [2, binding.toUpperCase(), 3],
      [2, 'ab', 3],
      [2, binding, 0],
      [2, binding, 1.5],
      [2, binding, '3'],
      [2, binding, 3, 4],
      { binding, offset: 3 },
    ])
      expect(decodeCursor(encode(value))).toBeNull()
  })
  it('refuses a cursor that is not written the way this member writes it', () => {
    const spaced = Buffer.from(`[2, "${binding}", 3]`, 'utf8').toString('base64url')
    expect(decodeCursor(spaced)).toBeNull()
  })
})
