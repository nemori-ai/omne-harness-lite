// The byte range rules of the SPEC "读取的形状规则", on the pure function: the page limit, the
// character boundaries, the empty range that moves its start, the BOM, `complete`, and the
// caller errors. The body offset makes the range relative to the body.
import { describe, expect, it } from 'vitest'
import { sliceRange } from '../src/access/range.ts'

const encoder = new TextEncoder()
const text = (value: string) => encoder.encode(value)

describe('the page limit', () => {
  const big = text('a'.repeat(70_000))

  it('gives at most 65536 bytes without a range', () => {
    const page = sliceRange(big, 'text')
    expect(page.range).toStrictEqual({ start: 0, length: 65_536 })
    expect(page.total).toBe(70_000)
    expect(page.complete).toBe(false)
    expect(page.content).toStrictEqual({ kind: 'text', text: 'a'.repeat(65_536) })
  })

  it('narrows a longer request to 65536 bytes', () => {
    expect(sliceRange(big, 'text', { start: 10, length: 100_000 }).range).toStrictEqual({
      start: 10,
      length: 65_536,
    })
  })

  it('gives exactly 65536 bytes when that many are requested', () => {
    expect(sliceRange(big, 'binary', { start: 4_464, length: 65_536 }).range.length).toBe(65_536)
  })
})

describe('character boundaries of text', () => {
  // a | C3 A9 | E4 B8 AD
  const mixed = text('aé中')

  it('moves the start forward to the next character boundary', () => {
    const page = sliceRange(mixed, 'text', { start: 2, length: 4 })
    expect(page.range).toStrictEqual({ start: 3, length: 3 })
    expect(page.content).toStrictEqual({ kind: 'text', text: '中' })
    expect(page.complete).toBe(true)
  })

  it('moves the end back to the previous character boundary', () => {
    const page = sliceRange(mixed, 'text', { start: 0, length: 2 })
    expect(page.range).toStrictEqual({ start: 0, length: 1 })
    expect(page.content).toStrictEqual({ kind: 'text', text: 'a' })
    expect(page.complete).toBe(false)
  })

  it('keeps a start that is already a boundary', () => {
    expect(sliceRange(mixed, 'text', { start: 1, length: 2 }).range).toStrictEqual({
      start: 1,
      length: 2,
    })
  })

  it('does not move the end when it is a boundary or the total', () => {
    expect(sliceRange(mixed, 'text', { start: 1, length: 5 }).range).toStrictEqual({
      start: 1,
      length: 5,
    })
    expect(sliceRange(mixed, 'text', { start: 0, length: 3 }).range).toStrictEqual({
      start: 0,
      length: 3,
    })
  })

  it('treats every byte of a binary entry as a boundary', () => {
    const page = sliceRange(mixed, 'binary', { start: 2, length: 2 })
    expect(page.range).toStrictEqual({ start: 2, length: 2 })
    expect(page.content).toStrictEqual({ kind: 'bytes', bytes: new Uint8Array([0xa9, 0xe4]) })
  })
})

describe('the requested end is the requested start plus the length', () => {
  // a | C3 A9 | b | c
  const sample = text('aébc')

  it('P5: a start inside a character and a length of 2 gives one byte after the boundary', () => {
    const page = sliceRange(sample, 'text', { start: 2, length: 2 })
    expect(page.range).toStrictEqual({ start: 3, length: 1 })
    expect(page.content).toStrictEqual({ kind: 'text', text: 'b' })
  })

  it('gives an empty range at the moved start when the requested end is before it', () => {
    const page = sliceRange(sample, 'text', { start: 2, length: 0 })
    expect(page.range).toStrictEqual({ start: 3, length: 0 })
    expect(page.complete).toBe(false)
  })
})

describe('an empty range after a short request', () => {
  const mixed = text('aé中')

  it('reports the moved start and length 0 when the request is shorter than one character', () => {
    const page = sliceRange(mixed, 'text', { start: 2, length: 1 })
    expect(page.range).toStrictEqual({ start: 3, length: 0 })
    expect(page.content).toStrictEqual({ kind: 'text', text: '' })
    expect(page.complete).toBe(false)
  })

  it('reports length 0 at a boundary start when one byte of a two-byte character is asked', () => {
    expect(sliceRange(mixed, 'text', { start: 1, length: 1 }).range).toStrictEqual({
      start: 1,
      length: 0,
    })
  })
})

describe('the byte order mark', () => {
  const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...text('x')])

  it('is part of the text and of the byte range', () => {
    const page = sliceRange(bom, 'text')
    expect(page.total).toBe(4)
    expect(page.content).toStrictEqual({ kind: 'text', text: '﻿x' })
    expect(sliceRange(bom, 'text', { start: 0, length: 3 }).content).toStrictEqual({
      kind: 'text',
      text: '﻿',
    })
    expect(sliceRange(bom, 'text', { start: 1, length: 3 }).range).toStrictEqual({
      start: 3,
      length: 1,
    })
  })
})

describe('complete and the total', () => {
  const four = text('abcd')

  it('is complete when the end reaches the total', () => {
    expect(sliceRange(four, 'text', { start: 2, length: 2 }).complete).toBe(true)
    expect(sliceRange(four, 'text', { start: 2, length: 1 }).complete).toBe(false)
  })

  it('gives an empty, complete page at or past the total', () => {
    for (const start of [4, 9]) {
      const page = sliceRange(four, 'text', { start, length: 2 })
      expect(page).toStrictEqual({
        content: { kind: 'text', text: '' },
        range: { start: 4, length: 0 },
        total: 4,
        complete: true,
      })
    }
  })

  it('is not complete for an empty page before the total', () => {
    const page = sliceRange(four, 'binary', { start: 1, length: 0 })
    expect(page.range).toStrictEqual({ start: 1, length: 0 })
    expect(page.complete).toBe(false)
  })

  it('is complete for an empty entry', () => {
    expect(sliceRange(new Uint8Array(), 'text')).toStrictEqual({
      content: { kind: 'text', text: '' },
      range: { start: 0, length: 0 },
      total: 0,
      complete: true,
    })
  })
})

describe('caller errors', () => {
  it.each([
    ['a negative start', { start: -1, length: 1 }],
    ['a negative length', { start: 0, length: -1 }],
    ['a fractional start', { start: 0.5, length: 1 }],
    ['a fractional length', { start: 0, length: 1.5 }],
    ['a NaN start', { start: Number.NaN, length: 1 }],
    ['an infinite length', { start: 0, length: Number.POSITIVE_INFINITY }],
  ])('throws a TypeError for %s', (_case, range) => {
    expect(() => sliceRange(text('abc'), 'text', range)).toThrow(TypeError)
  })
})

describe('the body offset', () => {
  const file = text('---\nname: x\n---\nbody 中')

  it('makes the range and the total relative to the body', () => {
    const page = sliceRange(file, 'text', undefined, 16)
    expect(page.total).toBe(8)
    expect(page.content).toStrictEqual({ kind: 'text', text: 'body 中' })
    expect(sliceRange(file, 'text', { start: 5, length: 3 }, 16).content).toStrictEqual({
      kind: 'text',
      text: '中',
    })
  })

  it('gives an empty body when the offset is the length of the file', () => {
    expect(sliceRange(file, 'text', undefined, file.length)).toStrictEqual({
      content: { kind: 'text', text: '' },
      range: { start: 0, length: 0 },
      total: 0,
      complete: true,
    })
  })
})
