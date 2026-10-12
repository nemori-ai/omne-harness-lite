import { describe, expect, test } from 'vitest'
import { isStandardBase64, reduceFills } from '../src/index.ts'

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
/** Independent test oracle: explicit 24-bit grouping; no Buffer or production helper. */
function encode(bytes: readonly number[]): string {
  let result = ''
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index] ?? 0
    const b = bytes[index + 1] ?? 0
    const c = bytes[index + 2] ?? 0
    result += alphabet[a >> 2] ?? ''
    result += alphabet[((a & 3) << 4) | (b >> 4)] ?? ''
    result += index + 1 < bytes.length ? (alphabet[((b & 15) << 2) | (c >> 6)] ?? '') : '='
    result += index + 2 < bytes.length ? (alphabet[c & 63] ?? '') : '='
  }
  return result
}
describe('AEV-1 standard alphabet/padding/zero tail bits and RFC 4648 known vectors', () => {
  for (const [bytes, canonical] of [
    [[102], 'Zg=='],
    [[102, 111], 'Zm8='],
    [[102, 111, 111], 'Zm9v'],
    [[102, 111, 111, 98], 'Zm9vYg=='],
    [[102, 111, 111, 98, 97], 'Zm9vYmE='],
    [[102, 111, 111, 98, 97, 114], 'Zm9vYmFy'],
    [[0], 'AA=='],
    [[255], '/w=='],
  ] as const) {
    test(`known bytes ${bytes.join(',')}`, () => {
      expect(encode(bytes)).toBe(canonical)
      expect(isStandardBase64(canonical)).toBe(true)
      expect(reduceFills({ kind: 'voice', fill: 'replace' }, [canonical])).toBe(canonical)
    })
  }
  for (const invalid of [
    '',
    'Zg',
    'Zg=',
    'Zg===',
    '=Zg=',
    'Z===',
    'Zg==Zg==',
    ' Zg==',
    'Zg== ',
    'Zg==\n',
    'Z\tg==',
    'Zg==!',
    '_w==',
    '-w==',
    'Ｚg==',
    'Zg==\u0000',
    'Zh==',
    'Zm9=',
    'YR==',
    'YWF=',
    null,
    123,
    {},
  ]) {
    test(`strict rejection ${JSON.stringify(invalid)}`, () =>
      expect(isStandardBase64(invalid)).toBe(false))
  }
  for (let byte = 0; byte < 256; byte++) {
    test(`one-byte canonical and all 15 illegal low tail bits ${byte}`, () => {
      const canonical = encode([byte])
      expect(isStandardBase64(canonical)).toBe(true)
      const high = (byte & 3) << 4
      for (let low = 1; low < 16; low++) {
        const mutated = `${canonical[0]}${alphabet[high | low]}==`
        expect(isStandardBase64(mutated), mutated).toBe(false)
      }
    })
  }
  test('two-byte every overflow-bit variant is rejected', () => {
    for (let high = 0; high < 16; high++) {
      const canonical = encode([255, high])
      expect(isStandardBase64(canonical)).toBe(true)
      for (let low = 1; low < 4; low++) {
        const tail = ((high & 15) << 2) | low
        const mutated = `${canonical.slice(0, 2)}${alphabet[tail]}=`
        expect(isStandardBase64(mutated), mutated).toBe(false)
      }
    }
  })
})
describe('fixed-seed independent byte oracle, append regrouping and replace last-write semantics', () => {
  let state = 0x5e19a231
  function next(): number {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state
  }
  for (let sample = 0; sample < 96; sample++) {
    const length = 1 + (next() % 97)
    const bytes = Array.from({ length }, () => next() & 255)
    const chunks: number[][] = []
    for (let index = 0; index < length;) {
      const end = Math.min(length, index + 1 + (next() % 7))
      chunks.push(bytes.slice(index, end))
      index = end
    }
    test(`seed0x5e19a231 sample${sample} length${length} chunks${chunks.length}`, () => {
      const fills = Object.freeze(chunks.map(encode))
      const expected = encode(bytes)
      expect(fills.every(isStandardBase64)).toBe(true)
      expect(reduceFills({ kind: 'voice', fill: 'append' }, fills)).toBe(expected)
      const merged =
        chunks.length < 2
          ? fills
          : [encode([...(chunks[0] ?? []), ...(chunks[1] ?? [])]), ...chunks.slice(2).map(encode)]
      expect(reduceFills({ kind: 'voice', fill: 'append' }, merged)).toBe(expected)
      expect(reduceFills({ kind: 'voice', fill: 'replace' }, fills)).toBe(fills.at(-1))
      expect(reduceFills({ kind: 'voice', fill: 'append' }, [expected])).toBe(expected)
    })
  }
})
