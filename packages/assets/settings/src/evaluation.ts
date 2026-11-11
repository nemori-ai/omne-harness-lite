import { defineSettings, valueValidator, type SettingsInputFailure } from './definition.ts'
import {
  SettingsEvaluationSchema,
  type SettingItem,
  type SettingPresence,
  type SettingSource,
} from './schema.ts'
import { immutable, withinSettingsBudget } from './value.ts'

export type SettingResolution = Readonly<{
  itemId: string
  value: SettingPresence
  source: string | null
  lockedBy: string | null
  suppressed: readonly string[]
}>
export type SettingsEvaluationResult =
  | Readonly<{ kind: 'complete'; entries: readonly SettingResolution[] }>
  | SettingsInputFailure
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{ kind: 'incompatible'; itemId: string }>

function applyAssignment(
  item: SettingItem,
  sourceId: string,
  assignment: SettingSource['values'][number],
  resolution: SettingResolution,
): SettingResolution {
  const next = assignment.value
  if (resolution.lockedBy !== null) {
    if (next.kind === 'value' || assignment.locked)
      return { ...resolution, suppressed: [...resolution.suppressed, sourceId] }
    return resolution
  }
  if (next.kind === 'value') {
    const value = resolution.value
    if (item.merge !== 'disabled' || value.kind === 'absent' || value.value !== true)
      resolution = { ...resolution, value: next, source: sourceId }
  }
  return { ...resolution, lockedBy: assignment.locked ? sourceId : resolution.lockedBy }
}

function evaluateItem(
  item: SettingItem,
  sources: readonly SettingSource[],
): SettingResolution | Readonly<{ kind: 'incompatible'; itemId: string }> {
  const validate = valueValidator(item)!
  let resolution: SettingResolution = {
    itemId: item.id,
    value: item.default,
    source: item.default.kind === 'value' ? 'default' : null,
    lockedBy: null,
    suppressed: [],
  }
  for (const entry of sources) {
    const assignment = entry.values.find(candidate => candidate.itemId === item.id)
    if (!assignment) continue
    const next = assignment.value
    if (next.kind === 'value' && (item.sensitivity === 'secret' || !validate(next.value)))
      return { kind: 'incompatible', itemId: item.id }
    resolution = applyAssignment(item, entry.id, assignment, resolution)
  }
  return resolution
}

/** Sources arrive in policy-approved order. This pure function does not authorize them. */
export function evaluateSettings(input: unknown): SettingsEvaluationResult {
  if (!withinSettingsBudget(input)) return { kind: 'limit_exceeded' }
  const parsed = SettingsEvaluationSchema.safeParse(input)
  if (!parsed.success) return { kind: 'invalid_input' }
  const { definition, sources, availability } = parsed.data
  if (availability === 'unavailable') return { kind: 'unavailable' }
  const checked = defineSettings(definition)
  if (checked.kind !== 'defined') return checked
  if (new Set(sources.map(source => source.id)).size !== sources.length)
    return { kind: 'invalid_input' }
  const ids = new Set(definition.items.map(item => item.id))
  for (const source of sources) {
    if (new Set(source.values.map(value => value.itemId)).size !== source.values.length)
      return { kind: 'invalid_input' }
    for (const value of source.values)
      if (!ids.has(value.itemId)) return { kind: 'incompatible', itemId: value.itemId }
  }
  const entries: SettingResolution[] = []
  for (const item of definition.items) {
    const result = evaluateItem(item, sources)
    if ('kind' in result) return result
    entries.push(result)
  }
  return immutable({ kind: 'complete', entries })
}
