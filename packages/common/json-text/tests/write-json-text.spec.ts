import { describe, expect, it } from 'vitest'
import {
  judgeJsonValue,
  readJsonText,
  writeJsonText,
  type JsonLimits,
  type JsonValue,
} from '@omne-harness/json-text'

const roomy: JsonLimits = {
  maxBytes: 10_000_000,
  maxDepth: 200_000,
  maxItems: 1_000_000,
  maxMembers: 100,
  maxStringLength: 1_000,
  maxNumberLength: 100,
}

const nil: JsonValue = { kind: 'null' }
const str = (value: string): JsonValue => ({ kind: 'string', value })
const num = (lexeme: string): JsonValue => ({ kind: 'number', lexeme })
const arr = (...items: JsonValue[]): JsonValue => ({ kind: 'array', items })
const obj = (...entries: [string, JsonValue][]): JsonValue => ({
  kind: 'object',
  entries: entries.map(([key, value]) => ({ key, value })),
})

function readTree(text: string): JsonValue {
  const read = readJsonText(text, roomy)
  if (read.kind !== 'ok') throw new Error(`reader failed: ${read.kind}`)
  return read.value
}

describe('writeJsonText writes the text of a tree', () => {
  it.each([
    ['null', nil, 'null'],
    ['true', { kind: 'boolean', value: true }, 'true'],
    ['false', { kind: 'boolean', value: false }, 'false'],
    ['a string', str('hi'), '"hi"'],
    ['an empty list', arr(), '[]'],
    ['an empty object', obj(), '{}'],
    ['a list without space', arr(nil, str('a'), arr(arr())), '[null,"a",[[]]]'],
    [
      'an object without space',
      obj(['a', nil], ['b', arr(num('1'), obj(['c', nil]))]),
      '{"a":null,"b":[1,{"c":null}]}',
    ],
  ] as const)('%s', (_, tree, text) => {
    expect(writeJsonText(tree)).toBe(text)
  })

  it.each(['1.0', '-0', '1E5', '1e+5', '0.10', '1e-007', '123456789012345678901234567890'])(
    'writes the number %s as its source lexeme, not as a reformatted number',
    lexeme => {
      expect(writeJsonText(num(lexeme))).toBe(lexeme)
      expect(writeJsonText(arr(num(lexeme)))).toBe(`[${lexeme}]`)
    },
  )

  it('writes the keys in the order of entries, never sorted', () => {
    expect(writeJsonText(obj(['b', nil], ['a', nil], ['2', nil], ['1', nil]))).toBe(
      '{"b":null,"a":null,"2":null,"1":null}',
    )
  })

  it('escapes strings and keys as JSON strings', () => {
    const tricky = 'q"b\\n\n\t\u0001 /é😀'
    expect(writeJsonText(str(tricky))).toBe(JSON.stringify(tricky))
    expect(writeJsonText(obj([tricky, nil]))).toBe(`{${JSON.stringify(tricky)}:null}`)
  })

  it('writes a lone surrogate as an escape, so the text is well formed', () => {
    expect(writeJsonText(str('\uD800'))).toBe('"\\ud800"')
    expect(writeJsonText(obj(['\uDC00', nil]))).toBe('{"\\udc00":null}')
    expect(writeJsonText(arr(str('\uD800'))).isWellFormed()).toBe(true)
  })

  it('writes a key named __proto__ as an ordinary key', () => {
    expect(writeJsonText(obj(['__proto__', obj(['constructor', nil])]))).toBe(
      '{"__proto__":{"constructor":null}}',
    )
  })

  it('does not call toJSON of a node', () => {
    const tree: JsonValue = { kind: 'string', value: 'x' }
    Object.defineProperty(tree, 'toJSON', { value: () => 'wrong' })
    expect(writeJsonText(tree)).toBe('"x"')
  })
})

describe('writeJsonText round trip with readJsonText', () => {
  it.each([
    'null',
    '"plain"',
    '"\\uD800"',
    '{"\\uD800":"\\uDC00\\uD800"}',
    '[1.0,-0,1E5,1e-5,0.1,123456789012345678901234567890]',
    '{"2":1,"1":2,"__proto__":{}}',
    '{"a":[{"b":[[],{}]},true,false,null,"é😀\\u0000"]}',
    ' { "a" : [ 1 , 2 ] } ',
  ])('the tree read from %s is read again from its written text', source => {
    const tree = readTree(source)
    expect(readTree(writeJsonText(tree))).toEqual(tree)
  })

  it('keeps the written text of a document without space or escapes byte for byte', () => {
    const compact = '{"b":[1.0,-0,1E5,{"a":null}],"a":"x"}'
    expect(writeJsonText(readTree(compact))).toBe(compact)
  })

  it('a written text is read again under the limits that read the tree', () => {
    const source = '{"k\\ud800":["\\u0041\\ud800\\n",1.0e+5,{"\\u0001":"\\/"}]}'
    const bytes = new TextEncoder().encode(source).length
    const tight: JsonLimits = { ...roomy, maxBytes: bytes, maxItems: 6, maxDepth: 3, maxMembers: 1 }
    const read = readJsonText(source, tight)
    if (read.kind !== 'ok') throw new Error(`reader failed: ${read.kind}`)
    expect(readJsonText(writeJsonText(read.value), tight)).toEqual(read)
  })

  it('writes what judgeJsonValue accepted the same as the input', () => {
    const tree = obj(['k', arr(num('1.0'), str('\uD800'))])
    const judged = judgeJsonValue(tree)
    if ('rejected' in judged) throw new Error('expected an accepted tree')
    expect(writeJsonText(judged.ok)).toBe(writeJsonText(tree))
  })
})

describe('writeJsonText on a deep tree', () => {
  const depth = 100_000

  it('writes a list nested 100,000 levels without a RangeError', () => {
    let tree: JsonValue = nil
    for (let level = 0; level < depth; level += 1) tree = arr(tree)
    const text = writeJsonText(tree)
    expect(text).toBe(`${'['.repeat(depth)}null${']'.repeat(depth)}`)
  })

  it('writes an object nested 100,000 levels without a RangeError', () => {
    let tree: JsonValue = nil
    for (let level = 0; level < depth; level += 1) tree = obj(['k', tree])
    const text = writeJsonText(tree)
    expect(text).toBe(`${'{"k":'.repeat(depth)}null${'}'.repeat(depth)}`)
  })

  it('round-trips a deep tree that readJsonText produced', () => {
    const source = `${'['.repeat(depth)}${']'.repeat(depth)}`
    expect(writeJsonText(readTree(source))).toBe(source)
  })
})

describe('writeJsonText on a wide tree', () => {
  // A spread of the members as call arguments overflows the stack from about 130,000 members.
  it('writes an object of 200,000 members and reads it back to the same tree', () => {
    const wide: JsonValue = {
      kind: 'object',
      entries: Array.from({ length: 200_000 }, (_, i) => ({ key: `k${i}`, value: nil })),
    }
    const text = writeJsonText(wide)
    expect(text.startsWith('{"k0":null,"k1":null,')).toBe(true)
    expect(text.endsWith(',"k199999":null}')).toBe(true)
    expect(readJsonText(text, { ...roomy, maxMembers: 200_000 })).toEqual({
      kind: 'ok',
      value: wide,
    })
  })

  it('writes a list of 200,000 items', () => {
    const wide: JsonValue = { kind: 'array', items: Array.from({ length: 200_000 }, () => nil) }
    expect(writeJsonText(wide)).toBe(`[${'null,'.repeat(199_999)}null]`)
  })

  // Slow: 999 keys of 50,000 units are 50 MB of text.
  it(
    'writes 999 keys of 50,000 equal-length code units in under 1.5 seconds, and reads them back',
    { tags: ['slow'] },
    () => {
      const keys = Array.from(
        { length: 999 },
        (_, i) => 'x'.repeat(49_992) + String(i).padStart(8, '0'),
      )
      const tree: JsonValue = {
        kind: 'object',
        entries: keys.map(key => ({ key, value: nil })),
      }
      const started = performance.now()
      const text = writeJsonText(tree)
      const elapsed = performance.now() - started
      expect(text.length).toBe(999 * (50_000 + 2 + 1 + 4) + 998 + 2)
      expect(elapsed).toBeLessThan(1_500)
      expect(
        readJsonText(text, {
          ...roomy,
          maxBytes: 100_000_000,
          maxMembers: 999,
          maxStringLength: 50_000,
        }),
      ).toEqual({ kind: 'ok', value: tree })
    },
  )
})

describe('writeJsonText throws TypeError on a value that is not a tree', () => {
  const loose = writeJsonText as (value: unknown) => string

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a number', 3],
    ['a string', 'x'],
    ['a bare list', []],
    ['a node without kind', {}],
    ['an unknown kind', { kind: 'bogus' }],
    ['a kind that is not a string', { kind: 5 }],
    ['a kind named like a prototype member', { kind: 'toString' }],
    ['a string node without value', { kind: 'string' }],
    ['a string whose value is not a string', { kind: 'string', value: 5 }],
    ['a boolean whose value is not a boolean', { kind: 'boolean', value: 'true' }],
    ['a number without lexeme', { kind: 'number' }],
    ['a number whose lexeme is not a string', { kind: 'number', lexeme: 1 }],
    ['a lexeme with a leading zero', { kind: 'number', lexeme: '01' }],
    ['a lexeme that is NaN', { kind: 'number', lexeme: 'NaN' }],
    ['an empty lexeme', { kind: 'number', lexeme: '' }],
    ['a lexeme with a trailing dot', { kind: 'number', lexeme: '1.' }],
    ['a lexeme with a plus sign', { kind: 'number', lexeme: '+1' }],
    ['an array without items', { kind: 'array' }],
    ['an array whose items are not a list', { kind: 'array', items: {} }],
    ['an object without entries', { kind: 'object' }],
    ['an object whose entries are not a list', { kind: 'object', entries: 'x' }],
    ['an entry that is not an object', { kind: 'object', entries: [5] }],
    ['an entry that is null', { kind: 'object', entries: [null] }],
    ['an entry without key', { kind: 'object', entries: [{ value: nil }] }],
    ['an entry whose key is not a string', { kind: 'object', entries: [{ key: 1, value: nil }] }],
    ['an entry without value', { kind: 'object', entries: [{ key: 'a' }] }],
    ['a bad node inside a list', { kind: 'array', items: [nil, { kind: 'bogus' }] }],
    [
      'a bad lexeme inside an entry',
      { kind: 'object', entries: [{ key: 'a', value: { kind: 'number', lexeme: '1.' } }] },
    ],
  ])('%s', (_, value) => {
    expect(() => loose(value)).toThrow(TypeError)
  })

  it('throws TypeError, not RangeError, for a bad node 100,000 levels down', () => {
    let tree: unknown = { kind: 'bogus' }
    for (let level = 0; level < 100_000; level += 1) tree = { kind: 'array', items: [tree] }
    expect(() => loose(tree)).toThrow(TypeError)
  })
})
