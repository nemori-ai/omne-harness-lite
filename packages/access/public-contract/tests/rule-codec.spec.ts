// A codec made from a rule reads and writes through the shared engine. Reading is strict:
// a field outside the rule, a duplicate key or a malformed tree gives `ok: false`.
import type { JsonLimits, JsonValue } from '@omne-harness/json-text'
import { describe, expect, it } from 'vitest'
import { readAccountIdText, ruleCodec } from '@omne-harness/public-contract'

const limits: JsonLimits = {
  maxBytes: 4096,
  maxDepth: 8,
  maxItems: 32,
  maxMembers: 16,
  maxStringLength: 256,
  maxNumberLength: 16,
}
const text = (value: string): JsonValue => ({ kind: 'string', value })
const number = (lexeme: string): JsonValue => ({ kind: 'number', lexeme })
const object = (...entries: [string, JsonValue][]): JsonValue => ({
  kind: 'object',
  entries: entries.map(([key, value]) => ({ key, value })),
})
const array = (...items: JsonValue[]): JsonValue => ({ kind: 'array', items })

const note = ruleCodec({
  kind: 'object',
  fields: {
    title: { rule: { kind: 'text' } },
    owner: { rule: { kind: 'account' }, optional: true },
    tags: { rule: { kind: 'array', item: { kind: 'literal', values: ['draft', 'shared'] } } },
    size: { rule: { kind: 'one-of', rules: [{ kind: 'null' }, { kind: 'positive-integer' }] } },
  },
})
const owner = readAccountIdText('acc_00000000000000000000000001')
const wire = object(
  ['title', text('Plan')],
  ['owner', text('acc_00000000000000000000000001')],
  ['tags', array(text('draft'))],
  ['size', number('3')],
)

describe('round trip', () => {
  it('reads what it wrote', () => {
    if (owner === undefined) throw new Error('fixture account did not parse')
    const value = { title: 'Plan', owner, tags: ['draft'] as const, size: 3 }
    const written = note.write(value, limits)
    expect(written).toEqual({ ok: true, value: wire })
    if (!written.ok) return
    const read = note.read(written.value, limits)
    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(read.value.title).toBe('Plan')
    expect(read.value.tags).toEqual(['draft'])
    expect(read.value.size).toBe(3)
    expect(note.write(read.value, limits)).toEqual({ ok: true, value: wire })
  })

  it('leaves out an optional field that is absent', () => {
    const bare = object(['title', text('Plan')], ['tags', array()], ['size', { kind: 'null' }])
    const read = note.read(bare, limits)
    expect(read).toEqual({ ok: true, value: { title: 'Plan', tags: [], size: null } })
    if (read.ok) expect(note.write(read.value, limits)).toEqual({ ok: true, value: bare })
  })
})

describe('strict reading', () => {
  it('rejects a field outside the rule', () => {
    const extra = object(
      ['title', text('Plan')],
      ['tags', array()],
      ['size', { kind: 'null' }],
      ['admin', { kind: 'boolean', value: true }],
    )
    expect(note.read(extra, limits)).toEqual({ ok: false })
  })

  it('rejects a duplicate key instead of keeping the last value', () => {
    const duplicate = object(
      ['title', text('Plan')],
      ['tags', array()],
      ['size', { kind: 'null' }],
      ['title', text('Other')],
    )
    expect(note.read(duplicate, limits)).toEqual({ ok: false })
  })

  it('rejects a duplicate key nested inside a field', () => {
    const codec = ruleCodec({ kind: 'json' })
    expect(codec.read(object(['a', object(['b', text('1')], ['b', text('2')])]), limits)).toEqual({
      ok: false,
    })
  })

  it('rejects a missing field, a wrong literal and a malformed tree', () => {
    expect(note.read(object(['title', text('Plan')]), limits)).toEqual({ ok: false })
    const wrong = object(
      ['title', text('Plan')],
      ['tags', array(text('x'))],
      ['size', { kind: 'null' }],
    )
    expect(note.read(wrong, limits)).toEqual({ ok: false })
    expect(note.read({ kind: 'object' } as unknown as JsonValue, limits)).toEqual({ ok: false })
    expect(note.read(null as unknown as JsonValue, limits)).toEqual({ ok: false })
  })

  it('rejects a tree larger than the item limit', () => {
    const list = ruleCodec({ kind: 'array', item: { kind: 'text' } })
    const items = Array.from({ length: 40 }, () => text('a'))
    expect(list.read(array(...items), limits)).toEqual({ ok: false })
    expect(list.read(array(...items), { ...limits, maxItems: 64 }).ok).toBe(true)
  })
})

describe('writing', () => {
  it('gives ok false for a value the rule does not accept', () => {
    if (owner === undefined) throw new Error('fixture account did not parse')
    expect(note.write({ title: '', tags: [], size: null }, limits)).toEqual({ ok: false })
    expect(note.write({ title: 'Plan', tags: [], size: 0 }, limits)).toEqual({ ok: false })
    const forged = { title: 'Plan', owner: { ...owner }, tags: [], size: null }
    expect(note.write(forged, limits)).toEqual({ ok: false })
  })

  it('gives ok false for a list longer than the item limit', () => {
    const list = ruleCodec({ kind: 'array', item: { kind: 'text' } })
    expect(
      list.write(
        Array.from({ length: 40 }, () => 'a'),
        limits,
      ),
    ).toEqual({ ok: false })
  })
})
