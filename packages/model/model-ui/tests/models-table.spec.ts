import { describe, expect, it } from 'vitest'
import type { JsonValue } from '@omne-harness/json-text'
import { catalogOf, rowsOf, withEntry, type Own } from '../src/view/models-table.ts'

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
const catalog = catalogOf({ name: 'openrouter', models: [MODEL, OFF] }) ?? []

const unset: Own = { kind: 'unset' }
const setTo = (entries: Record<string, boolean | string>): { kind: 'set'; value: JsonValue } =>
  ({
    kind: 'set',
    value: {
      kind: 'object',
      entries: Object.entries(entries).map(([key, value]) => ({
        key,
        value: typeof value === 'boolean' ? { kind: 'boolean', value } : { kind: 'string', value },
      })),
    },
  }) as const

describe('the catalog a provider body carries', () => {
  it('reads every model of it', () => {
    expect(
      catalog.map(row => [row.model, row.title, row.window, row.efforts, row.enabled]),
    ).toEqual([
      ['z-ai/glm-5.3', 'GLM 5.3', '202752', ['low', 'medium', 'high'], true],
      ['z-ai/glm-5.2', 'GLM 5.2', '202752', ['high', 'xhigh'], false],
    ])
  })

  it('is not read from a body without a list of models, or with a model it cannot read', () => {
    for (const body of [
      undefined,
      null,
      {},
      { models: {} },
      { models: [{ ...MODEL, efforts: 'high' }] },
    ])
      expect(catalogOf(body)).toBeUndefined()
    for (const broken of [
      { model: 3 },
      { title: null },
      { window: 202752 },
      { input: 'text' },
      { output: [1] },
      { enabled: 'yes' },
    ])
      expect(catalogOf({ models: [MODEL, { ...MODEL, ...broken }] })).toBeUndefined()
  })

  it('lists the chat models only: a model of another kind is not a row of this table', () => {
    const decisions = { kind: 'decisions', model: 'vendor/judge', title: 'Judge', enabled: true }
    expect(catalogOf({ models: [MODEL, decisions] })).toEqual(catalogOf({ models: [MODEL] }))
    expect(catalogOf({ models: [decisions] })).toEqual([])
  })
})

describe('what each row shows', () => {
  it('without values of this layer every model is as the release has it, on the provider default', () => {
    expect(rowsOf(catalog, unset, unset).map(row => [row.on, row.onFrom, row.effort])).toEqual([
      [true, 'release', undefined],
      [false, 'release', undefined],
    ])
  })

  it('takes the switch and the effort this layer holds', () => {
    const rows = rowsOf(catalog, setTo({ 'z-ai/glm-5.2': true }), setTo({ 'z-ai/glm-5.3': 'high' }))
    expect(rows.map(row => [row.on, row.onFrom, row.effort, row.unsupported])).toEqual([
      [true, 'release', 'high', undefined],
      [true, 'tenant', undefined, undefined],
    ])
  })

  it('names a stored effort the model does not take, and uses the provider default for it', () => {
    const rows = rowsOf(catalog, unset, setTo({ 'z-ai/glm-5.3': 'xhigh', 'z-ai/glm-5.2': 'max' }))
    expect(rows.map(row => [row.effort, row.unsupported])).toEqual([
      [undefined, 'xhigh'],
      [undefined, 'max'],
    ])
  })

  it('ignores a value of the wrong kind', () => {
    const rows = rowsOf(catalog, setTo({ 'z-ai/glm-5.3': 'no' }), setTo({ 'z-ai/glm-5.2': true }))
    expect(rows.map(row => [row.on, row.onFrom, row.effort, row.unsupported])).toEqual([
      [true, 'release', undefined, undefined],
      [false, 'release', undefined, undefined],
    ])
  })
})

describe('what a change writes', () => {
  it('the whole map of this layer, with the one model changed', () => {
    expect(withEntry(setTo({ a: true, b: false }), 'b', true)).toEqual(
      setTo({ a: true, b: true }).value,
    )
    expect(withEntry(unset, 'a', 'high')).toEqual(setTo({ a: 'high' }).value)
  })

  it('takes the model out when it goes back to the default', () => {
    expect(withEntry(setTo({ a: 'high', b: 'low' }), 'a', undefined)).toEqual(
      setTo({ b: 'low' }).value,
    )
  })
})
