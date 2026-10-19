import { describe, expect, it } from 'vitest'
import type { JsonValue } from '@omne-harness/json-text'
import { succeed } from '@omne-harness/operation-result'
import {
  defaultResultPolicy,
  judgeToolDefinition,
  renderToolResult,
} from '@omne-harness/tool-contract'
import {
  adoption,
  functionDefinition,
  ordinaryAuthor,
  parameters,
  textFactory,
  valueSchema,
} from './tool-values.ts'

// The json-text tree check of this package is a thin adapter over `judgeJsonValue`: it gives a
// structural path the field names of this package. These tests reach it through the schema of a
// tool definition, so every field name below starts with `parameters.schema`.
const AT = 'parameters.schema'

function rejection(schema: unknown) {
  const judged = judgeToolDefinition({
    ...functionDefinition(),
    parameters: { ...parameters([]), schema },
  })
  if ('ok' in judged) throw new Error('the definition was accepted')
  return judged.failure
}

/** A list of `length` empty slots: a hole is no own property. */
function holes(length: number): unknown[] {
  const list: unknown[] = []
  list.length = length
  return list
}

const nil = { kind: 'null' }
const object = (...entries: unknown[]) => ({ kind: 'object', entries })
const array = (...items: unknown[]) => ({ kind: 'array', items })
const entry = (key: string, value: unknown) => ({ key, value })

describe('json tree check: field names for the paths of json-text', () => {
  it.each([
    ['an unknown node kind, at its kind', { kind: 'date', value: 'x' }, `${AT}.kind`, 'value'],
    ['a node that is not an object', 'text', AT, 'type'],
    [
      'a number lexeme in a deep item',
      object(entry('a', array(nil, { kind: 'number', lexeme: '0x10' }))),
      `${AT}.entries[0].value.items[1].lexeme`,
      'type',
    ],
    [
      'a missing leaf field',
      object(entry('a', { kind: 'string' })),
      `${AT}.entries[0].value.value`,
      'missing',
    ],
    [
      'an unknown field of a node',
      object(entry('a', array({ kind: 'null', extra: 1 }))),
      `${AT}.entries[0].value.items[0].extra`,
      'unknown-field',
    ],
    [
      'an unknown field of an entry',
      object({ key: 'a', value: nil, extra: 1 }),
      `${AT}.entries[0].extra`,
      'unknown-field',
    ],
    [
      'an entry key that is no string',
      object({ key: 1, value: nil }),
      `${AT}.entries[0].key`,
      'type',
    ],
    ['an entry without a value', object({ key: 'a' }), `${AT}.entries[0].value`, 'missing'],
    ['an entry that is no object', object('a'), `${AT}.entries[0]`, 'type'],
    ['a list field that is no list', { kind: 'array', items: 'x' }, `${AT}.items`, 'type'],
    ['a hole in a list', { kind: 'array', items: holes(2) }, `${AT}.items[0]`, 'missing'],
    ['an undefined item', array(undefined), `${AT}.items[0]`, 'type'],
    [
      'a repeated key, at the second key',
      object(entry('a', object(entry('k', nil), entry('j', nil), entry('k', nil)))),
      `${AT}.entries[0].value.entries[2].key`,
      'duplicate',
    ],
  ])('rejects %s', (_, schema, field, reason) => {
    expect(rejection(schema)).toEqual({ field, reason })
  })

  it('rejects a cycle at the container that is inside itself, below the field prefix', () => {
    const inner: { kind: 'array'; items: unknown[] } = { kind: 'array', items: [] }
    inner.items.push(nil, inner)
    expect(rejection(object(entry('a', inner)))).toEqual({
      field: `${AT}.entries[0].value.items[1]`,
      reason: 'cycle',
    })
  })

  it('reports the budget at the list whose slots pass the limit, not at a node', () => {
    let shared: unknown = nil
    for (let level = 0; level < 24; level += 1) shared = array(shared, shared)
    const failure = rejection(object(entry('wide', shared)))
    expect(failure.reason).toBe('budget')
    expect(failure.field).toMatch(
      /^parameters\.schema\.entries\[0\]\.value(\.items\[[01]\])*\.items$/u,
    )
  })

  it('rejects an accessor without calling it, at a field and at a list element', () => {
    let reads = 0
    const node = { kind: 'string' }
    Object.defineProperty(node, 'value', {
      enumerable: true,
      get() {
        reads += 1
        return 'x'
      },
    })
    expect(rejection(object(entry('a', node)))).toEqual({
      field: `${AT}.entries[0].value.value`,
      reason: 'accessor',
    })
    const items: unknown[] = []
    Object.defineProperty(items, 0, {
      enumerable: true,
      get() {
        reads += 1
        return nil
      },
    })
    expect(rejection({ kind: 'array', items })).toEqual({
      field: `${AT}.items[0]`,
      reason: 'accessor',
    })
    expect(reads).toBe(0)
  })

  it('rejects a tree whose reading throws as unreadable, without throwing', () => {
    const hostile = new Proxy(
      { kind: 'null' },
      {
        ownKeys: () => {
          throw new Error('trap')
        },
      },
    )
    expect(rejection(object(entry('a', array(hostile))))).toEqual({
      field: AT,
      reason: 'unreadable',
    })
  })

  it('names the field of data.value for an encode output that cannot be read, without throwing', () => {
    const hostile = new Proxy<JsonValue>(
      { kind: 'null' },
      {
        getOwnPropertyDescriptor: () => {
          throw new Error('trap')
        },
      },
    )
    const program = {
      kind: 'json',
      adoption: adoption('count'),
      schema: valueSchema('count'),
      encode: () => succeed(hostile),
    } as const
    expect(
      renderToolResult({}, { ...ordinaryAuthor(), program }, textFactory, defaultResultPolicy),
    ).toEqual({ failure: { reason: 'program: data.value: unreadable' } })
  })
})
