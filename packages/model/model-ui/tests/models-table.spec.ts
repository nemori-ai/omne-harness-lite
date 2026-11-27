import { describe, expect, it } from 'vitest'
import type { JsonValue } from '@omne-harness/json-text'
import {
  catalogOf,
  groupsOf,
  rowsOf,
  withEntry,
  withSwitch,
  type Own,
} from '../src/view/models-table.ts'

const MODEL = {
  kind: 'llm',
  model: 'z-ai/glm-5.3',
  title: 'GLM 5.3',
  input: ['text'],
  output: ['text'],
  window: '202752',
  efforts: ['low', 'medium', 'high'],
  enabled: true,
}
const OFF = {
  ...MODEL,
  model: 'z-ai/glm-5.2',
  title: 'GLM 5.2',
  efforts: ['high', 'xhigh'],
  enabled: false,
}
const JUDGE = {
  kind: 'decisions',
  model: 'z-ai/glm-5.3',
  title: 'GLM 5.3 判定',
  input: ['text'],
  output: ['text'],
  maxQuestions: '200',
  enabled: true,
}
const catalog = catalogOf({ name: 'openrouter', models: [MODEL, OFF, JUDGE] }) ?? []

const unset: Own = { kind: 'unset' }
type Plain = Readonly<Record<string, boolean | string | Readonly<Record<string, boolean>>>>
const jsonOf = (value: boolean | string | Readonly<Record<string, boolean>>): JsonValue =>
  typeof value === 'boolean'
    ? { kind: 'boolean', value }
    : typeof value === 'string'
      ? { kind: 'string', value }
      : {
          kind: 'object',
          entries: Object.entries(value).map(([key, item]) => ({ key, value: jsonOf(item) })),
        }
const setTo = (entries: Plain): { kind: 'set'; value: JsonValue } => ({
  kind: 'set',
  value: {
    kind: 'object',
    entries: Object.entries(entries).map(([key, value]) => ({ key, value: jsonOf(value) })),
  },
})

describe('the catalog a provider body carries', () => {
  it('reads every model of it, of every kind, each with the facts of its kind', () => {
    expect(catalog.map(row => [row.kind, row.model, row.title, row.enabled])).toEqual([
      ['llm', 'z-ai/glm-5.3', 'GLM 5.3', true],
      ['llm', 'z-ai/glm-5.2', 'GLM 5.2', false],
      ['decisions', 'z-ai/glm-5.3', 'GLM 5.3 判定', true],
    ])
    expect(catalog[0]).toMatchObject({ window: '202752', efforts: ['low', 'medium', 'high'] })
    expect(catalog[2]).toMatchObject({ maxQuestions: '200' })
  })

  it('reads a decisions model without a question limit as one that states none', () => {
    const { maxQuestions: _limit, ...unlimited } = JUDGE
    expect(catalogOf({ models: [unlimited] })?.[0]).toMatchObject({ maxQuestions: undefined })
  })

  it('is not read from a body without a list of models, or with a model it cannot read', () => {
    for (const body of [undefined, null, {}, { models: {} }])
      expect(catalogOf(body)).toBeUndefined()
    for (const broken of [
      { kind: 'image' },
      { kind: undefined },
      { model: 3 },
      { title: null },
      { window: 202752 },
      { efforts: 'high' },
      { input: 'text' },
      { output: [1] },
      { enabled: 'yes' },
    ])
      expect(catalogOf({ models: [MODEL, { ...MODEL, ...broken }] })).toBeUndefined()
    expect(catalogOf({ models: [{ ...JUDGE, maxQuestions: 200 }] })).toBeUndefined()
  })
})

describe('the groups of the table', () => {
  it('are the kinds of model in their order, each with its own rows, and none for a kind with no row', () => {
    const groups = groupsOf(rowsOf(catalog, unset, unset))
    expect(groups.map(group => [group.kind, group.rows.map(row => row.title)])).toEqual([
      ['llm', ['GLM 5.3', 'GLM 5.2']],
      ['decisions', ['GLM 5.3 判定']],
    ])
    const chatOnly = catalogOf({ models: [MODEL] }) ?? []
    expect(groupsOf(rowsOf(chatOnly, unset, unset)).map(group => group.kind)).toEqual(['llm'])
  })
})

describe('what each row shows', () => {
  it('without values of this layer every model is as the release has it, on the provider default', () => {
    expect(rowsOf(catalog, unset, unset).map(row => [row.on, row.onFrom, row.effort])).toEqual([
      [true, 'release', undefined],
      [false, 'release', undefined],
      [true, 'release', undefined],
    ])
  })

  it('takes the switch of its own kind and the effort this layer holds', () => {
    const rows = rowsOf(
      catalog,
      setTo({ llm: { 'z-ai/glm-5.2': true }, decisions: { 'z-ai/glm-5.3': false } }),
      setTo({ 'z-ai/glm-5.3': 'high' }),
    )
    expect(rows.map(row => [row.kind, row.on, row.onFrom, row.effort])).toEqual([
      ['llm', true, 'release', 'high'],
      ['llm', true, 'tenant', undefined],
      ['decisions', false, 'tenant', undefined],
    ])
  })

  it('names a stored effort the model does not take, and uses the provider default for it', () => {
    const rows = rowsOf(catalog, unset, setTo({ 'z-ai/glm-5.3': 'xhigh', 'z-ai/glm-5.2': 'max' }))
    expect(rows.map(row => [row.effort, row.unsupported])).toEqual([
      [undefined, 'xhigh'],
      [undefined, 'max'],
      [undefined, undefined],
    ])
  })

  it('reads no switch from a kind whose value is no map', () => {
    const held: Own = {
      kind: 'set',
      value: {
        kind: 'object',
        entries: [
          { key: 'llm', value: { kind: 'null' } },
          { key: 'decisions', value: { kind: 'array', items: [] } },
        ],
      },
    }
    expect(rowsOf(catalog, held, unset).map(row => [row.on, row.onFrom])).toEqual([
      [true, 'release'],
      [false, 'release'],
      [true, 'release'],
    ])
  })

  it('ignores a value of the wrong kind, and switches that name no kind of model', () => {
    const rows = rowsOf(
      catalog,
      setTo({ 'z-ai/glm-5.3': false, llm: { 'z-ai/glm-5.2': 'yes' } as never }),
      setTo({ 'z-ai/glm-5.2': true }),
    )
    expect(rows.map(row => [row.on, row.onFrom, row.effort, row.unsupported])).toEqual([
      [true, 'release', undefined, undefined],
      [false, 'release', undefined, undefined],
      [true, 'release', undefined, undefined],
    ])
  })
})

describe('what a change writes', () => {
  it('a switch: the whole map of this layer, with the one model of the one kind changed', () => {
    const held = setTo({ llm: { a: true, b: false }, decisions: { b: true } })
    expect(withSwitch(held, 'llm', 'b', true)).toEqual(
      setTo({ llm: { a: true, b: true }, decisions: { b: true } }).value,
    )
    expect(withSwitch(held, 'decisions', 'b', false)).toEqual(
      setTo({ llm: { a: true, b: false }, decisions: { b: false } }).value,
    )
    expect(withSwitch(unset, 'decisions', 'a', true)).toEqual(
      setTo({ decisions: { a: true } }).value,
    )
  })

  it('a switch starts from nothing when this layer holds no map', () => {
    const held: Own = { kind: 'set', value: { kind: 'boolean', value: true } }
    expect(withSwitch(held, 'llm', 'a', true)).toEqual(setTo({ llm: { a: true } }).value)
  })

  it('a switch drops what names no kind of model', () => {
    expect(withSwitch(setTo({ a: true }), 'llm', 'b', false)).toEqual(
      setTo({ llm: { b: false } }).value,
    )
  })

  it('an effort: the whole map of this layer, with the one model changed', () => {
    expect(withEntry(setTo({ a: 'low', b: 'high' }), 'b', 'low')).toEqual(
      setTo({ a: 'low', b: 'low' }).value,
    )
    expect(withEntry(unset, 'a', 'high')).toEqual(setTo({ a: 'high' }).value)
  })

  it('an effort is taken out when it goes back to the default', () => {
    expect(withEntry(setTo({ a: 'high', b: 'low' }), 'a', undefined)).toEqual(
      setTo({ b: 'low' }).value,
    )
  })
})
