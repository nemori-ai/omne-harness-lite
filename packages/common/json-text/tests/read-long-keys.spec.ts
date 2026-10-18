import { describe, expect, it } from 'vitest'
import { readJsonText, type JsonLimits } from '@omne-harness/json-text'
import { KeySet } from '../src/read.ts'

const limits: JsonLimits = {
  maxBytes: 100_000_000,
  maxDepth: 10,
  maxItems: 1_000_000,
  maxMembers: 100_000,
  maxStringLength: 1_000_000,
  maxNumberLength: 100,
}

/** A key of `length` units that differs from the others of that length only in its last 8 units. */
const longKey = (length: number, index: number): string =>
  'x'.repeat(length - 8) + String(index).padStart(8, '0')

const member = (key: string): string => `${JSON.stringify(key)}:1`
const objectText = (keys: readonly string[]): string => `{${keys.map(member).join(',')}}`

describe('readJsonText finds a repeated key of any length', () => {
  it.each([255, 256, 257, 20_000])('at the position of the second use, for keys of %i units', n => {
    const keys = [longKey(n, 1), longKey(n, 2), longKey(n, 3), longKey(n, 2)]
    expect(readJsonText(objectText(keys), limits)).toEqual({
      kind: 'duplicate-key',
      path: [],
      key: longKey(n, 2),
    })
  })

  it('takes long keys that differ only in the last unit, or only in the first, as distinct', () => {
    const base = 'y'.repeat(20_000)
    const keys = [`${base}a`, `${base}b`, `a${base}`, `b${base}`, base]
    const read = readJsonText(objectText(keys), limits)
    expect(read.kind).toBe('ok')
    if (read.kind === 'ok' && read.value.kind === 'object')
      expect(read.value.entries.map(entry => entry.key)).toEqual(keys)
  })

  it('does not mistake a short key and a long key of the same prefix for equal', () => {
    const keys = ['x'.repeat(255), 'x'.repeat(256), 'x'.repeat(257), 'x', '']
    expect(readJsonText(objectText(keys), limits).kind).toBe('ok')
  })

  it('compares keys after escape decoding, so an escaped long key equals its plain form', () => {
    const plain = longKey(300, 7)
    const escaped = plain.replace(/x/g, '\\u0078')
    const text = `{${JSON.stringify(plain)}:1,"${escaped}":2}`
    expect(readJsonText(text, limits)).toEqual({ kind: 'duplicate-key', path: [], key: plain })
  })

  it('reports the repeated long key with the path of its parent', () => {
    const key = longKey(1_000, 1)
    const text = `{"a":[{${member(key)},${member(key)}}]}`
    expect(readJsonText(text, limits)).toEqual({ kind: 'duplicate-key', path: ['a', 0], key })
  })

  it('keeps the failure order: members budget, then repeated key, on long keys', () => {
    const keys = [longKey(300, 1), longKey(300, 2), longKey(300, 1)]
    const tight = { ...limits, maxMembers: 2 }
    expect(readJsonText(objectText(keys), tight)).toEqual({ kind: 'budget', name: 'members' })
    expect(readJsonText(objectText(keys), { ...limits, maxMembers: 3 })).toEqual({
      kind: 'duplicate-key',
      path: [],
      key: longKey(300, 1),
    })
  })

  it('stops at the repeated long key before the value that follows it', () => {
    const key = longKey(300, 1)
    expect(readJsonText(`{${member(key)},${JSON.stringify(key)}:`, limits)).toEqual({
      kind: 'duplicate-key',
      path: [],
      key,
    })
  })
})

describe('KeySet when every long key lands in one bucket', () => {
  it('tells distinct keys apart and finds a repeat only by exact equality', () => {
    const keys = new KeySet(() => 'one-bucket')
    const first = longKey(300, 1)
    const second = longKey(300, 2)
    expect(keys.add(first)).toBe(true)
    expect(keys.add(second)).toBe(true)
    expect(keys.add(first)).toBe(false)
    expect(keys.add(second)).toBe(false)
    expect(keys.size).toBe(2)
  })
})

describe('readJsonText on long keys of equal length', () => {
  // Slow: 999 keys of 50,000 units. The engine hashes a string of 16,384 units or more by its
  // length only, so a native Set of such keys takes seconds.
  it(
    'reads 999 keys of 50,000 equal-length code units in under 1.5 seconds',
    { tags: ['slow'] },
    () => {
      const text = objectText(Array.from({ length: 999 }, (_, index) => longKey(50_000, index)))
      const started = performance.now()
      const read = readJsonText(text, limits)
      const elapsed = performance.now() - started
      expect(read.kind).toBe('ok')
      expect(elapsed).toBeLessThan(1_500)
    },
  )
})
