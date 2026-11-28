import type { JsonLimits, JsonValue } from '@omne-harness/json-text'
import { describe, expect, it } from 'vitest'
import {
  defineProtocol,
  projectRule,
  revisionOf,
  ruleCodec,
  type ProtocolContract,
  type Rule,
} from '@omne-harness/public-contract'

const limits: JsonLimits = {
  maxBytes: 4096,
  maxDepth: 8,
  maxItems: 32,
  maxMembers: 16,
  maxStringLength: 256,
  maxNumberLength: 16,
}
const text = (value: string): JsonValue => ({ kind: 'string', value })
const object = (...entries: [string, JsonValue][]): JsonValue => ({
  kind: 'object',
  entries: entries.map(([key, value]) => ({ key, value })),
})

const noteRule = {
  kind: 'object',
  fields: {
    title: { rule: { kind: 'text' } },
    colour: { rule: { kind: 'text' }, optional: true, since: 2 },
    pinned: { rule: { kind: 'boolean' }, optional: true, since: 3 },
  },
} as const satisfies Rule
const note = ruleCodec(noteRule)
const full = { title: 'Plan', colour: 'red', pinned: true }
const wireAt1 = object(['title', text('Plan')])
const wireAt2 = object(['title', text('Plan')], ['colour', text('red')])
const wireAt3 = object(
  ['title', text('Plan')],
  ['colour', text('red')],
  ['pinned', { kind: 'boolean', value: true }],
)

describe('writing at a revision', () => {
  it('leaves out the fields that came after it', () => {
    expect(note.write(full, limits, 1)).toEqual({ ok: true, value: wireAt1 })
    expect(note.write(full, limits, 2)).toEqual({ ok: true, value: wireAt2 })
    expect(note.write(full, limits, 3)).toEqual({ ok: true, value: wireAt3 })
  })

  it('writes everything at a revision past the last, and when no revision is given', () => {
    expect(note.write(full, limits, 9)).toEqual({ ok: true, value: wireAt3 })
    expect(note.write(full, limits)).toEqual({ ok: true, value: wireAt3 })
  })

  it('still refuses a value with a key the rule does not have', () => {
    const stray = { ...full, other: 1 } as unknown as typeof full
    expect(note.write(stray, limits, 1).ok).toBe(false)
  })

  it('still refuses a later field of the wrong kind, though it is not written', () => {
    const wrong = { title: 'Plan', colour: 7 } as unknown as typeof full
    expect(note.write(wrong, limits, 1).ok).toBe(false)
  })
})

describe('reading at a revision', () => {
  it('refuses a field that came after it: reading stays strict (V1)', () => {
    expect(note.read(wireAt2, limits, 1).ok).toBe(false)
    expect(note.read(wireAt3, limits, 2).ok).toBe(false)
  })

  it('reads the fields up to it', () => {
    expect(note.read(wireAt1, limits, 1)).toEqual({ ok: true, value: { title: 'Plan' } })
    expect(note.read(wireAt2, limits, 2)).toEqual({
      ok: true,
      value: { title: 'Plan', colour: 'red' },
    })
    expect(note.read(wireAt1, limits, 3)).toEqual({ ok: true, value: { title: 'Plan' } })
  })

  it('reads everything when no revision is given', () => {
    expect(note.read(wireAt3, limits)).toEqual({ ok: true, value: full })
  })
})

describe('inside arrays, nested objects and one-of', () => {
  const rule = {
    kind: 'object',
    fields: {
      items: {
        rule: {
          kind: 'array',
          item: {
            kind: 'object',
            fields: {
              id: { rule: { kind: 'text' } },
              note: { rule: { kind: 'text' }, optional: true, since: 2 },
            },
          },
        },
      },
      head: {
        rule: {
          kind: 'one-of',
          rules: [
            { kind: 'null' },
            {
              kind: 'object',
              fields: {
                by: { rule: { kind: 'text' } },
                at: { rule: { kind: 'text' }, optional: true, since: 2 },
              },
            },
          ],
        },
      },
    },
  } as const satisfies Rule
  const codec = ruleCodec(rule)
  const value = { items: [{ id: 'a', note: 'n' }], head: { by: 'me', at: 'now' } }

  it('leaves out later fields at every depth', () => {
    expect(codec.write(value, limits, 1)).toEqual({
      ok: true,
      value: object(
        ['items', { kind: 'array', items: [object(['id', text('a')])] }],
        ['head', object(['by', text('me')])],
      ),
    })
  })

  it('refuses later fields at every depth', () => {
    const written = codec.write(value, limits, 2)
    if (!written.ok) throw new Error('did not write')
    expect(codec.read(written.value, limits, 2)).toEqual({ ok: true, value })
    expect(codec.read(written.value, limits, 1).ok).toBe(false)
  })
})

describe('projectRule', () => {
  it('gives the rule as it was at a revision', () => {
    expect(projectRule(noteRule, 1)).toEqual({
      kind: 'object',
      fields: { title: { rule: { kind: 'text' } } },
    })
    expect(projectRule(noteRule, 2)).toEqual({
      kind: 'object',
      fields: {
        title: { rule: { kind: 'text' } },
        colour: { rule: { kind: 'text' }, optional: true, since: 2 },
      },
    })
    expect(projectRule(noteRule, 3)).toEqual(noteRule)
  })

  it('projects inside arrays and inside every choice of a one-of', () => {
    const inner = {
      kind: 'object',
      fields: {
        id: { rule: { kind: 'text' } },
        note: { rule: { kind: 'text' }, optional: true, since: 2 },
      },
    } as const satisfies Rule
    const at1 = { kind: 'object', fields: { id: { rule: { kind: 'text' } } } }
    expect(projectRule({ kind: 'array', item: inner }, 1)).toEqual({ kind: 'array', item: at1 })
    expect(projectRule({ kind: 'one-of', rules: [{ kind: 'null' }, inner] }, 1)).toEqual({
      kind: 'one-of',
      rules: [{ kind: 'null' }, at1],
    })
    expect(projectRule({ kind: 'array', item: inner }, 2)).toEqual({ kind: 'array', item: inner })
  })

  it('carries the rule on the codec it was built from', () => {
    expect(note.rule).toBe(noteRule)
  })
})

describe('a rule that cannot be', () => {
  const field = (extra: object): Rule =>
    ({ kind: 'object', fields: { a: { rule: { kind: 'text' }, ...extra } } }) as unknown as Rule
  const build = ruleCodec as unknown as (rule: Rule) => unknown

  it('refuses a required field that came later: an older writer could not have written it', () => {
    expect(() => build(field({ since: 2 }))).toThrow(
      'field a came at revision 2 and is not optional',
    )
  })

  it('says which field has a since that is not a revision', () => {
    expect(() => build(field({ optional: true, since: 0 }))).toThrow(
      'the since of field a is not a positive integer',
    )
  })

  it.each([0, -1, 1.5, Number.NaN, '2'])('refuses since %s', since => {
    expect(() => build(field({ optional: true, since }))).toThrow(TypeError)
  })

  it('finds it at any depth', () => {
    const deep = {
      kind: 'array',
      item: { kind: 'one-of', rules: [{ kind: 'null' }, field({ since: 2 })] },
    } as unknown as Rule
    expect(() => build(deep)).toThrow(TypeError)
  })

  it('refuses a since past the largest revision a caller can name, and takes that largest one', () => {
    expect(() => build(field({ optional: true, since: 1_000_000_000 }))).toThrow(TypeError)
    expect(() => build(field({ optional: true, since: 999_999_999 }))).not.toThrow()
  })

  it('takes since 1 on any field: it says what was always so', () => {
    expect(() => build(field({ since: 1 }))).not.toThrow()
  })
})

describe('revisionOf', () => {
  const body = ruleCodec({ kind: 'object', fields: {} })
  const base = { identity: 'none', effect: 'read', limit: 'small', body } as const

  it('is 1 for a protocol that says nothing', () => {
    const protocol = defineProtocol({
      name: 'test',
      major: 1,
      operations: { get: { ...base, outcomes: { succeeded: body } } },
      observations: {},
    })
    expect(revisionOf(protocol)).toBe(1)
  })

  it('counts an outcome that has no body, and a codec written by hand, as saying nothing', () => {
    const handmade = { read: () => ({ ok: false }), write: () => ({ ok: false }) } as never
    const define = defineProtocol as unknown as (protocol: object) => ProtocolContract
    const protocol = define({
      name: 'test',
      major: 1,
      operations: {
        get: { ...base, body: handmade, outcomes: { succeeded: body, 'protocol-rejected': true } },
      },
      observations: {},
    })
    expect(revisionOf(protocol)).toBe(1)
  })

  it('is the latest since of any field, operation or observation', () => {
    const answer = ruleCodec({
      kind: 'object',
      fields: { extra: { rule: { kind: 'text' }, optional: true, since: 2 } },
    })
    const frame = ruleCodec({
      kind: 'object',
      fields: { more: { rule: { kind: 'text' }, optional: true, since: 4 } },
    })
    const fields = defineProtocol({
      name: 'test',
      major: 1,
      operations: { get: { ...base, outcomes: { succeeded: answer } } },
      observations: {},
    })
    expect(revisionOf(fields)).toBe(2)
    const operation = defineProtocol({
      name: 'test',
      major: 1,
      operations: {
        get: { ...base, outcomes: { succeeded: answer } },
        put: { ...base, effect: 'commit', outcomes: { succeeded: body }, since: 3 },
      },
      observations: {},
    })
    expect(revisionOf(operation)).toBe(3)
    const observation = defineProtocol({
      name: 'test',
      major: 1,
      operations: { get: { ...base, outcomes: { succeeded: answer } } },
      observations: {
        watch: { identity: 'none', open: body, frame, ends: [] },
        later: { identity: 'none', open: body, frame: body, ends: [], since: 5 },
      },
    })
    expect(revisionOf(observation)).toBe(5)
  })

  it('refuses an operation or an observation whose since is not a positive integer', () => {
    const operations = { get: { ...base, outcomes: { succeeded: body }, since: 0 } }
    expect(() => defineProtocol({ name: 'test', major: 1, operations, observations: {} })).toThrow(
      TypeError,
    )
    const observations = {
      watch: { identity: 'none', open: body, frame: body, ends: [], since: 1.5 },
    }
    expect(() =>
      defineProtocol({ name: 'test', major: 1, operations: {}, observations } as never),
    ).toThrow(TypeError)
  })
})
