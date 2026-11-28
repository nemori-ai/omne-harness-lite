import type { JsonLimits, JsonValue } from '@omne-harness/json-text'
import { describe, expect, it } from 'vitest'
import {
  LEAF_ALLOWS,
  rejectionText,
  ruleCodec,
  type Codec,
  type LeafKind,
  type Rule,
} from '@omne-harness/public-contract'

const limits: JsonLimits = {
  maxBytes: 4096,
  maxDepth: 8,
  maxItems: 32,
  maxMembers: 16,
  maxStringLength: 256,
  maxNumberLength: 24,
}
const text = (value: string): JsonValue => ({ kind: 'string', value })
const number = (lexeme: string): JsonValue => ({ kind: 'number', lexeme })
const object = (...entries: [string, JsonValue][]): JsonValue => ({
  kind: 'object',
  entries: entries.map(([key, value]) => ({ key, value })),
})
const array = (...items: JsonValue[]): JsonValue => ({ kind: 'array', items })

const page = ruleCodec({
  kind: 'object',
  fields: {
    limit: { rule: { kind: 'page-limit' } },
    tags: {
      rule: { kind: 'array', item: { kind: 'literal', values: ['draft', 'shared'] }, max: 2 },
    },
    size: { rule: { kind: 'one-of', rules: [{ kind: 'null' }, { kind: 'positive-integer' }] } },
  },
})
const fine = (...more: [string, JsonValue][]): JsonValue =>
  object(['limit', number('10')], ['tags', array(text('draft'))], ['size', number('3')], ...more)

describe('a refused value says where it is, what was given and what the rule allows', () => {
  it('names the field and the bound of a leaf', () => {
    const read = page.read(
      object(['limit', number('101')], ['tags', array()], ['size', number('3')]),
      limits,
    )
    expect(read).toEqual({
      ok: false,
      rejection: { at: ['limit'], given: '101', allows: 'a whole number from 1 to 100' },
    })
  })

  it('names a stray field and the fields there are', () => {
    expect(page.read(fine(['color', text('red')]), limits)).toEqual({
      ok: false,
      rejection: {
        at: ['color'],
        given: '"red"',
        allows: 'no field "color" here: an object with the fields limit, tags, size',
      },
    })
  })

  it('names a missing field', () => {
    expect(page.read(object(['limit', number('1')], ['size', number('3')]), limits)).toEqual({
      ok: false,
      rejection: {
        at: ['tags'],
        given: 'missing',
        allows: 'a list (at most 2, each one of "draft", "shared"): the field is required',
      },
    })
  })

  it('names the index of an item in a list', () => {
    const read = page.read(
      object(
        ['limit', number('1')],
        ['tags', array(text('draft'), text('secret'))],
        ['size', number('3')],
      ),
      limits,
    )
    expect(read).toEqual({
      ok: false,
      rejection: { at: ['tags', 1], given: '"secret"', allows: 'one of "draft", "shared"' },
    })
  })

  it('names the length of a list that is too long', () => {
    const read = page.read(
      object(
        ['limit', number('1')],
        ['tags', array(text('draft'), text('draft'), text('shared'))],
        ['size', number('3')],
      ),
      limits,
    )
    expect(read).toEqual({
      ok: false,
      rejection: {
        at: ['tags'],
        given: '["draft","draft","shared"]',
        allows: 'a list of at most 2 items',
      },
    })
  })

  it('names every option of a union', () => {
    const read = page.read(
      object(['limit', number('1')], ['tags', array()], ['size', text('big')]),
      limits,
    )
    expect(read).toEqual({
      ok: false,
      rejection: {
        at: ['size'],
        given: '"big"',
        allows: `one of: null; or ${LEAF_ALLOWS['positive-integer']}`,
      },
    })
  })

  it('refuses the same way when writing, before anything is sent', () => {
    expect(page.write({ limit: 0, tags: [], size: null }, limits)).toEqual({
      ok: false,
      rejection: { at: ['limit'], given: '0', allows: 'a whole number from 1 to 100' },
    })
  })

  it('cuts a long given value and says how long it was', () => {
    const read = ruleCodec({ kind: 'boolean' }).read(text('x'.repeat(200)), limits)
    expect(read.ok).toBe(false)
    if (read.ok) return
    expect(read.rejection.given).toBe(`"${'x'.repeat(119)}… (202 characters)`)
  })

  it('reads as one sentence', () => {
    expect(
      rejectionText({ at: ['tags', 1], given: '"secret"', allows: 'one of "draft", "shared"' }),
    ).toBe('tags[1] is "secret"; allows one of "draft", "shared"')
    expect(rejectionText({ at: [], given: '3', allows: 'a text' })).toBe(
      'the value is 3; allows a text',
    )
  })
})

describe('each leaf refuses with the sentence of its own range', () => {
  const wrong: { readonly [K in LeafKind]: JsonValue } = {
    'positive-integer': number('0'),
    count: number('-1'),
    'page-limit': number('101'),
    text: text(''),
    string: number('1'),
    session: text('A'),
    'page-bytes': text('0'),
    bytes: text('abc'),
    revision: text('01'),
    boolean: text('true'),
    null: text('null'),
    account: text('nobody'),
    organization: text('nobody'),
    login: text('nobody'),
    tenant: text('{}'),
    instant: text('yesterday'),
    'plain-date': text('2026-02-30'),
    parameters: array(),
    json: text('fine'),
    'user-message': object(['role', text('assistant')]),
  }
  for (const kind of Object.keys(wrong) as LeafKind[]) {
    if (kind === 'json') continue
    it(kind, () => {
      const codecOf = ruleCodec as unknown as (rule: Rule) => Codec<unknown>
      const read = codecOf({ kind } as Rule).read(wrong[kind], limits)
      expect(read).toMatchObject({ ok: false, rejection: { at: [], allows: LEAF_ALLOWS[kind] } })
    })
  }
})

describe('the range a sentence names is the range the leaf checks', () => {
  const bound = (sentence: string): number => Number(/(\d+)$/u.exec(sentence)?.[1])
  it('page-limit', () => {
    const most = bound(LEAF_ALLOWS['page-limit'])
    const codec = ruleCodec({ kind: 'page-limit' })
    expect(codec.read(number(String(most)), limits).ok).toBe(true)
    expect(codec.read(number(String(most + 1)), limits).ok).toBe(false)
    expect(codec.read(number('1'), limits).ok).toBe(true)
    expect(codec.read(number('0'), limits).ok).toBe(false)
  })
})
