import { writeJsonText, type JsonEntry, type JsonValue } from '@omne-harness/json-text'

/** The two settings of a provider this block draws, the same as the provider body contract declares. */
export const MODEL_SWITCHES = 'model-switches'
export const MODEL_REASONING_EFFORTS = 'model-reasoning-efforts'

export type CatalogRow = Readonly<{
  model: string
  title: string
  input: readonly string[]
  output: readonly string[]
  window: string
  efforts: readonly string[]
  enabled: boolean
}>

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

function catalogRow(item: unknown): CatalogRow | undefined {
  const row = (item ?? {}) as Record<string, unknown>
  const { model, title, input, output, window, efforts, enabled } = row
  if (typeof model !== 'string' || typeof title !== 'string' || typeof window !== 'string')
    return undefined
  if (!isTexts(input) || !isTexts(output) || !isTexts(efforts) || typeof enabled !== 'boolean')
    return undefined
  return { model, title, input, output, window, efforts, enabled }
}

const isChat = (item: unknown): boolean =>
  typeof item === 'object' && item !== null && (item as { kind?: unknown }).kind === 'llm'

/** The chat models of the catalog a provider body carries; undefined when it has none, or one of them does not read. */
export function catalogOf(body: unknown): readonly CatalogRow[] | undefined {
  const models = (body as { models?: unknown } | null | undefined)?.models
  if (!Array.isArray(models)) return undefined
  const rows = models.filter(isChat).map(catalogRow)
  return rows.every(row => row !== undefined) ? rows : undefined
}

function plainOf(own: Own): Readonly<Record<string, unknown>> {
  if (own.kind !== 'set' || own.value.kind !== 'object') return {}
  return JSON.parse(writeJsonText(own.value)) as Record<string, unknown>
}

/** Each catalog model with its switch and default effort as this layer holds them over the release. */
export function rowsOf(
  catalog: readonly CatalogRow[],
  switches: Own,
  efforts: Own,
): readonly ModelRow[] {
  const on = plainOf(switches)
  const chosen = plainOf(efforts)
  return catalog.map(row => {
    const own = on[row.model]
    const stored = chosen[row.model]
    const effort = typeof stored === 'string' && row.efforts.includes(stored) ? stored : undefined
    return {
      ...row,
      on: typeof own === 'boolean' ? own : row.enabled,
      onFrom: typeof own === 'boolean' ? 'tenant' : 'release',
      effort,
      unsupported: typeof stored === 'string' && effort === undefined ? stored : undefined,
    }
  })
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
