// The packed text of a large text column (SPEC §10.1): the format marker, the threshold, the round
// trip and the refusal of an unknown marker.
import { describe, expect, it } from 'vitest'
import { packText, unpackText } from '@omne-harness/sql-contract/worker'

const utf8Length = (text: string): number => Buffer.byteLength(text, 'utf8')

const short = '{"kind":"ok"}'
const atThreshold = 'a'.repeat(128)
const long = JSON.stringify({ records: Array.from({ length: 40 }, (_, at) => ({ at, kind: 'x' })) })
const multibyte = '中文内容，'.repeat(40)

describe('packText', () => {
  it('keeps a value shorter than 128 UTF-8 bytes as marker 0 and the UTF-8 bytes', () => {
    const packed = packText(short)
    expect(packed[0]).toBe(0)
    expect(Buffer.from(packed.subarray(1)).toString('utf8')).toBe(short)
  })

  it('counts the threshold in UTF-8 bytes, not in characters', () => {
    const text = '中'.repeat(43)
    expect(text.length).toBeLessThan(128)
    expect(utf8Length(text)).toBeGreaterThanOrEqual(128)
    expect(packText(text)[0]).toBe(1)
    expect(packText('中'.repeat(42))[0]).toBe(0)
  })

  it('compresses a value of 128 UTF-8 bytes or more as marker 1', () => {
    expect(packText('a'.repeat(127))[0]).toBe(0)
    expect(packText(atThreshold)[0]).toBe(1)
    const packed = packText(long)
    expect(packed[0]).toBe(1)
    expect(packed.length).toBeLessThan(utf8Length(long))
  })
})

describe('unpackText', () => {
  it.each([
    ['empty', ''],
    ['short', short],
    ['at the threshold', atThreshold],
    ['long', long],
    ['multibyte', multibyte],
  ])('gives back the %s text byte for byte', (_name, text) => {
    const back = unpackText(new Uint8Array(packText(text)))
    expect(back).toBe(text)
    expect(Buffer.from(back, 'utf8').equals(Buffer.from(text, 'utf8'))).toBe(true)
  })

  it.each([
    ['marker 2', Uint8Array.of(2, 0x7b, 0x7d)],
    ['marker 255', Uint8Array.of(255)],
  ])('refuses %s', (_name, bytes) => {
    expect(() => unpackText(bytes)).toThrow(/unknown format marker/)
  })

  it('refuses bytes without a marker', () => {
    expect(() => unpackText(new Uint8Array(0))).toThrow(/no format marker/)
  })
})
