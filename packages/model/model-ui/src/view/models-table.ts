import { writeJsonText, type JsonEntry, type JsonValue } from '@omne-harness/json-text'

/** The two settings of a provider this block draws, the same as the provider body contract declares. */
export const MODEL_SWITCHES = 'model-switches'
export const MODEL_REASONING_EFFORTS = 'model-reasoning-efforts'

export const CATALOG_KINDS = ['llm', 'decisions'] as const
export type CatalogKind = (typeof CATALOG_KINDS)[number]

type RowCommon = Readonly<{
  model: string
  title: string
  input: readonly string[]
  output: readonly string[]
  enabled: boolean
}>
export type CatalogRow = RowCommon &
  (
    | Readonly<{ kind: 'llm'; window: string; efforts: readonly string[] }>
    | Readonly<{ kind: 'decisions'; maxQuestions: string | undefined }>
  )

/** What this layer holds of a setting. */
export type Own = Readonly<{ kind: 'unset' } | { kind: 'set'; value: JsonValue }>

export type ModelRow = CatalogRow &
  Readonly<{
    on: boolean
    onFrom: 'tenant' | 'release'
    effort: string | undefined
    unsupported: string | undefined
  }>

const isTexts = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every(item => typeof item === 'string')

function commonOf(row: Record<string, unknown>): RowCommon | undefined {
  const { model, title, input, output, enabled } = row
  if (typeof model !== 'string' || typeof title !== 'string') return undefined
  if (!isTexts(input) || !isTexts(output) || typeof enabled !== 'boolean') return undefined
  return { model, title, input, output, enabled }
}

function ownRow(row: Record<string, unknown>): CatalogRow | undefined {
  const common = commonOf(row)
  if (common === undefined) return undefined
  const { window, efforts, maxQuestions } = row
  switch (row['kind']) {
    case 'llm':
      return typeof window === 'string' && isTexts(efforts)
        ? { ...common, kind: 'llm', window, efforts }
        : undefined
    case 'decisions':
      return maxQuestions === undefined || typeof maxQuestions === 'string'
        ? { ...common, kind: 'decisions', maxQuestions }
        : undefined
  }
  return undefined
}

/** The models of the catalog a provider body carries; undefined when it has none, or one of them does not read. */
export function catalogOf(body: unknown): readonly CatalogRow[] | undefined {
  const models = (body as { models?: unknown } | null | undefined)?.models
  if (!Array.isArray(models)) return undefined
  const rows = models.map(item => ownRow((item ?? {}) as Record<string, unknown>))
  return rows.every(row => row !== undefined) ? rows : undefined
}

function plainOf(own: Own): Readonly<Record<string, unknown>> {
  if (own.kind !== 'set' || own.value.kind !== 'object') return {}
  return JSON.parse(writeJsonText(own.value)) as Record<string, unknown>
}

const entryOf = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && Object.hasOwn(value, key)
    ? Reflect.get(value, key)
    : undefined

/** Each catalog model with its switch and default effort as this layer holds them over the release. */
export function rowsOf(
  catalog: readonly CatalogRow[],
  switches: Own,
  efforts: Own,
): readonly ModelRow[] {
  const on = plainOf(switches)
  const chosen = plainOf(efforts)
  return catalog.map(row => {
    const own = entryOf(on[row.kind], row.model)
    const stored = row.kind === 'llm' ? chosen[row.model] : undefined
    const effort = row.kind === 'llm' ? row.efforts.find(level => level === stored) : undefined
    return {
      ...row,
      on: typeof own === 'boolean' ? own : row.enabled,
      onFrom: typeof own === 'boolean' ? 'tenant' : 'release',
      effort,
      unsupported: typeof stored === 'string' && effort === undefined ? stored : undefined,
    }
  })
}

export function groupsOf(
  rows: readonly ModelRow[],
): readonly Readonly<{ kind: CatalogKind; rows: readonly ModelRow[] }>[] {
  return CATALOG_KINDS.flatMap(kind => {
    const own = rows.filter(row => row.kind === kind)
    return own.length === 0 ? [] : [{ kind, rows: own }]
  })
}

/** The whole switch map of this layer with one model of one kind set; what names no kind of model is dropped. */
export function withSwitch(own: Own, kind: CatalogKind, model: string, on: boolean): JsonValue {
  const held = own.kind === 'set' && own.value.kind === 'object' ? own.value.entries : []
  const entries = CATALOG_KINDS.flatMap(name => {
    const value = held.find(entry => entry.key === name)?.value
    if (name === kind) {
      const models: Own = value === undefined ? { kind: 'unset' } : { kind: 'set', value }
      return [{ key: name, value: withEntry(models, model, on) }]
    }
    return value === undefined ? [] : [{ key: name, value }]
  })
  return { kind: 'object', entries }
}

/** The whole map of this layer with one model's entry set, or taken out when the value is undefined. */
export function withEntry(own: Own, model: string, value: boolean | string | undefined): JsonValue {
  const kept: JsonEntry[] =
    own.kind === 'set' && own.value.kind === 'object'
      ? own.value.entries.filter(entry => entry.key !== model)
      : []
  if (value === undefined) return { kind: 'object', entries: kept }
  const written: JsonValue =
    typeof value === 'boolean' ? { kind: 'boolean', value } : { kind: 'string', value }
  return { kind: 'object', entries: [...kept, { key: model, value: written }] }
}
