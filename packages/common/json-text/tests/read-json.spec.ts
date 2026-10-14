import { describe, expect, it } from 'vitest'
import {
  readJsonBytes,
  readJsonText,
  type JsonLimits,
  type JsonRead,
} from '@omne-harness/json-text'

const roomy: JsonLimits = {
  maxBytes: 1_000,
  maxDepth: 10,
  maxItems: 100,
  maxMembers: 100,
  maxStringLength: 100,
  maxNumberLength: 100,
}

const looseText = readJsonText as (text: unknown, limits: unknown) => JsonRead
const looseBytes = readJsonBytes as (bytes: unknown, limits: unknown) => JsonRead
const space = new Uint8Array([0x20])

function expectLimitsRejected(bad: unknown, good: unknown): void {
  expect(() => looseText(' ', bad)).toThrow(TypeError)
  expect(() => looseBytes(space, bad)).toThrow(TypeError)
  expect(looseText(' ', good)).toEqual({ kind: 'empty' })
  expect(looseBytes(space, good)).toEqual({ kind: 'empty' })
}

describe('arguments', () => {
  const fields = Object.keys(roomy)

  it.each([undefined, null, 1, 'limits'])('limits %s throws TypeError', limits => {
    expectLimitsRejected(limits, roomy)
  })

  it.each(fields)('missing %s throws TypeError', field => {
    const limits: Record<string, unknown> = { ...roomy }
    delete limits[field]
    expectLimitsRejected(limits, { ...limits, [field]: 1 })
  })

  const illegal = [0, -1, 1.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1', 1n, null]
  it.each(fields.flatMap(field => illegal.map(value => [field, value] as const)))(
    '%s = %s throws TypeError',
    (field, value) => {
      expectLimitsRejected({ ...roomy, [field]: value }, { ...roomy, [field]: 1 })
    },
  )

  it('accepts Number.MAX_SAFE_INTEGER for every field', () => {
    const max = Number.MAX_SAFE_INTEGER
    expectLimitsRejected(
      { ...roomy, maxBytes: max + 1 },
      {
        maxBytes: max,
        maxDepth: max,
        maxItems: max,
        maxMembers: max,
        maxStringLength: max,
        maxNumberLength: max,
      },
    )
  })

  it.each([new Uint8Array([0x20]), 1, null, undefined, [' ']])(
    'readJsonText(%s) throws TypeError',
    text => {
      expect(() => looseText(text, roomy)).toThrow(TypeError)
      expect(looseText(' ', roomy)).toEqual({ kind: 'empty' })
    },
  )

  it.each([' ', [0x20], new ArrayBuffer(1), new Uint16Array([0x20]), null, undefined])(
    'readJsonBytes(%s) throws TypeError',
    bytes => {
      expect(() => looseBytes(bytes, roomy)).toThrow(TypeError)
      expect(looseBytes(space, roomy)).toEqual({ kind: 'empty' })
    },
  )
})

describe('input encoding', () => {
  it.each([
    ['the byte 0xff', [0xff]],
    ['a lone continuation byte', [0x80]],
    ['a cut two-byte sequence', [0x22, 0xc3, 0x22]],
    ['an overlong slash', [0xc0, 0xaf]],
    ['an encoded surrogate', [0x22, 0xed, 0xa0, 0x80, 0x22]],
  ])('bytes with %s are utf8', (_, bytes) => {
    expect(readJsonBytes(new Uint8Array(bytes), roomy)).toEqual({ kind: 'utf8' })
  })

  it('a leading UTF-8 BOM is bom, after illegal UTF-8 and before maxBytes and empty', () => {
    const bomNull = new Uint8Array([0xef, 0xbb, 0xbf, 0x6e, 0x75, 0x6c, 0x6c])
    expect(readJsonBytes(bomNull, roomy)).toEqual({ kind: 'bom' })
    expect(readJsonBytes(bomNull, { ...roomy, maxBytes: 1 })).toEqual({ kind: 'bom' })
    expect(readJsonBytes(new Uint8Array([0xef, 0xbb, 0xbf]), roomy)).toEqual({ kind: 'bom' })
    expect(readJsonBytes(new Uint8Array([0xef, 0xbb, 0xbf, 0xff]), roomy)).toEqual({
      kind: 'utf8',
    })
  })

  it('text starting with U+FEFF is bom, before maxBytes and empty', () => {
    expect(readJsonText('\uFEFFnull', roomy)).toEqual({ kind: 'bom' })
    expect(readJsonText('\uFEFFnull', { ...roomy, maxBytes: 1 })).toEqual({ kind: 'bom' })
    expect(readJsonText('\uFEFF', roomy)).toEqual({ kind: 'bom' })
    expect(readJsonText('\uFEFF ', roomy)).toEqual({ kind: 'bom' })
  })

  it('bytes longer than maxBytes are budget bytes, after illegal UTF-8 and before empty', () => {
    const fourSpaces = new Uint8Array([0x20, 0x20, 0x20, 0x20])
    expect(readJsonBytes(fourSpaces, { ...roomy, maxBytes: 3 })).toEqual({
      kind: 'budget',
      name: 'bytes',
    })
    expect(readJsonBytes(fourSpaces, { ...roomy, maxBytes: 4 })).toEqual({ kind: 'empty' })
    expect(readJsonBytes(new Uint8Array([0xff, 0x20, 0x20]), { ...roomy, maxBytes: 1 })).toEqual({
      kind: 'utf8',
    })
  })

  it('text maxBytes counts UTF-8 bytes, not UTF-16 code units', () => {
    expect(readJsonText('    ', { ...roomy, maxBytes: 3 })).toEqual({
      kind: 'budget',
      name: 'bytes',
    })
    expect(readJsonText('    ', { ...roomy, maxBytes: 4 })).toEqual({ kind: 'empty' })
    expect(readJsonText('"é"', { ...roomy, maxBytes: 3 })).toEqual({
      kind: 'budget',
      name: 'bytes',
    })
    expect(readJsonText('"中"', { ...roomy, maxBytes: 4 })).toEqual({
      kind: 'budget',
      name: 'bytes',
    })
    expect(readJsonText('"😀"', { ...roomy, maxBytes: 5 })).toEqual({
      kind: 'budget',
      name: 'bytes',
    })
  })

  it.each(['', ' ', '\t', '\n', '\r', ' \t\r\n  '])('%j is empty', text => {
    expect(readJsonText(text, roomy)).toEqual({ kind: 'empty' })
    expect(readJsonBytes(new TextEncoder().encode(text), roomy)).toEqual({ kind: 'empty' })
  })

  it.each(['\uD800', '"\uDC00"', '"a\uD800b"', '"\uDE00\uD83D"', '\uFEFF\uD800'])(
    'text %j with a lone surrogate throws TypeError',
    text => {
      expect(() => readJsonText(text, roomy)).toThrow(TypeError)
      expect(() => readJsonText(text, { ...roomy, maxBytes: 1 })).toThrow(TypeError)
    },
  )

  it('a surrogate pair is not a lone surrogate', () => {
    expect(readJsonText('\uD83D\uDE00', { ...roomy, maxBytes: 3 })).toEqual({
      kind: 'budget',
      name: 'bytes',
    })
  })
})

describe('values', () => {
  it.each([
    ['null', { kind: 'null' }],
    ['true', { kind: 'boolean', value: true }],
    ['false', { kind: 'boolean', value: false }],
    ['"abc"', { kind: 'string', value: 'abc' }],
    ['""', { kind: 'string', value: '' }],
    ['"a\\"\\\\\\/\\b\\f\\n\\r\\t\\u0041"', { kind: 'string', value: 'a"\\/\b\f\n\r\tA' }],
    ['"\\uD800"', { kind: 'string', value: '\uD800' }],
    ['"\\uD83D\\uDE00"', { kind: 'string', value: '😀' }],
    [' \r\n\tnull \n', { kind: 'null' }],
  ])('%j reads as a scalar', (text, value) => {
    expect(readJsonText(text, roomy)).toEqual({ kind: 'ok', value })
  })

  it.each([
    '0',
    '-0',
    '12',
    '1.5',
    '-1.5e+10',
    '1E-3',
    '2e5',
    '9007199254740993',
    '-123456789012345678901234567890',
    '0.10000000000000000555',
  ])('number %s keeps its source lexeme', lexeme => {
    expect(readJsonText(lexeme, roomy)).toEqual({ kind: 'ok', value: { kind: 'number', lexeme } })
  })

  it('arrays keep item order and nesting', () => {
    expect(readJsonText('[]', roomy)).toEqual({ kind: 'ok', value: { kind: 'array', items: [] } })
    expect(readJsonText('[ 1 , "a" , [ null , [ ] ] , true ]', roomy)).toEqual({
      kind: 'ok',
      value: {
        kind: 'array',
        items: [
          { kind: 'number', lexeme: '1' },
          { kind: 'string', value: 'a' },
          {
            kind: 'array',
            items: [{ kind: 'null' }, { kind: 'array', items: [] }],
          },
          { kind: 'boolean', value: true },
        ],
      },
    })
  })

  it('objects keep entries in encounter order', () => {
    expect(readJsonText('{}', roomy)).toEqual({
      kind: 'ok',
      value: { kind: 'object', entries: [] },
    })
    expect(readJsonText('{"2": 1, "1": {"b": [], "a": false}}', roomy)).toEqual({
      kind: 'ok',
      value: {
        kind: 'object',
        entries: [
          { key: '2', value: { kind: 'number', lexeme: '1' } },
          {
            key: '1',
            value: {
              kind: 'object',
              entries: [
                { key: 'b', value: { kind: 'array', items: [] } },
                { key: 'a', value: { kind: 'boolean', value: false } },
              ],
            },
          },
        ],
      },
    })
  })

  it('object keys decode escapes', () => {
    expect(readJsonText('{"\\u0061\\n": null}', roomy)).toEqual({
      kind: 'ok',
      value: { kind: 'object', entries: [{ key: 'a\n', value: { kind: 'null' } }] },
    })
  })

  it('readJsonBytes reads the same value as readJsonText', () => {
    const text = '{"é": [9007199254740993, "😀"]}'
    const expected = {
      kind: 'ok',
      value: {
        kind: 'object',
        entries: [
          {
            key: 'é',
            value: {
              kind: 'array',
              items: [
                { kind: 'number', lexeme: '9007199254740993' },
                { kind: 'string', value: '😀' },
              ],
            },
          },
        ],
      },
    }
    expect(readJsonText(text, roomy)).toEqual(expected)
    expect(readJsonBytes(new TextEncoder().encode(text), roomy)).toEqual(expected)
  })

  it('a document of exactly maxBytes UTF-8 bytes reads', () => {
    expect(readJsonText('"😀"', { ...roomy, maxBytes: 6 })).toEqual({
      kind: 'ok',
      value: { kind: 'string', value: '😀' },
    })
    expect(readJsonText('"é"', { ...roomy, maxBytes: 4 })).toEqual({
      kind: 'ok',
      value: { kind: 'string', value: 'é' },
    })
  })
})
