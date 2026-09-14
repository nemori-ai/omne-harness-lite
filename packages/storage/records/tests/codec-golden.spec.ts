import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { decodeLine, encodeEnvelope } from '../dist/index.js'
import { fixture, fixtureEnvelope, limits } from './fixtures.js'

describe('A30/A31 core-journal/1 fixed golden codec', () => {
  it.each([
    ['G01', 'g01', 1_294, '922232e653e4196bcdda9624769766eb65784c624caf2661f38051543917e63a'],
    ['G10', 'g10', 1_747, 'f29ce05cd8e294b61d0e1ffeb6ed79745dcba2792d96bc4dfe0577f07a06fef8'],
  ] as const)('%s matches fixed physical bytes and round-trips exactly', (_label, name, byteLength, digest) => {
    const expected = fixture(name)
    expect(expected.byteLength).toBe(byteLength)
    expect(createHash('sha256').update(expected).digest('hex')).toBe(digest)

    const encoded = encodeEnvelope(fixtureEnvelope(name), limits)
    expect(encoded.ok).toBe(true)
    if (encoded.ok) expect(Buffer.from(encoded.value).equals(Buffer.from(expected))).toBe(true)

    const decoded = decodeLine(expected, limits)
    expect(decoded.ok).toBe(true)
    if (decoded.ok) {
      expect(decoded.value.envelope).toEqual(fixtureEnvelope(name))
      expect(Object.isFrozen(decoded.value)).toBe(true)
      expect(Object.isFrozen(decoded.value.envelope)).toBe(true)
      expect(Object.isFrozen(decoded.value.envelope.appends)).toBe(true)
      expect(Object.isFrozen(decoded.value.envelope.appends[0]?.records[0]?.data)).toBe(true)
    }
  })
})
