import canonicalize from 'canonicalize'
import { Ajv, type ValidateFunction } from 'ajv'
import { SettingDefinitionsSchema, type SettingDefinitions, type SettingItem } from './schema.ts'
import { immutable, withinSettingsBudget } from './value.ts'

export type SettingsInputFailure = Readonly<{ kind: 'invalid_input' | 'limit_exceeded' }>
export type SettingsDefinitionResult =
  | Readonly<{ kind: 'defined'; definition: SettingDefinitions }>
  | SettingsInputFailure

function validGroups(definition: SettingDefinitions): boolean {
  const groups = new Map(definition.groups.map(group => [group.id, group]))
  if (groups.size !== definition.groups.length) return false
  for (const group of groups.values()) {
    const seen = new Set([group.id])
    let parent = group.parentId
    while (parent !== null) {
      if (seen.has(parent)) return false
      seen.add(parent)
      const entry = groups.get(parent)
      if (!entry) return false
      parent = entry.parentId
    }
  }
  return definition.items.every(item => groups.has(item.groupId))
}

function safeSchema(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return true
  if (Array.isArray(value)) return value.every(safeSchema)
  return Object.entries(value).every(
    ([key, child]) =>
      !['$ref', '$dynamicRef', '$recursiveRef', '$id', 'pattern', 'patternProperties'].includes(
        key,
      ) && safeSchema(child),
  )
}

export function valueValidator(item: SettingItem): ValidateFunction | undefined {
  if (!safeSchema(item.valueSchema)) return undefined
  try {
    return new Ajv({
      strict: true,
      allowUnionTypes: true,
      allErrors: false,
      validateFormats: true,
    }).compile(item.valueSchema)
  } catch {
    return undefined
  }
}

function enumMetadata(item: SettingItem): boolean {
  const choices = item.valueSchema['enum']
  if (!Array.isArray(choices)) return true
  const labels = item.presentation.enumLabels ?? []
  if (labels.length !== choices.length) return false
  const keys = labels.map(label => canonicalize(label.value))
  return (
    new Set(keys).size === choices.length &&
    choices.every(value => keys.includes(canonicalize(value)))
  )
}

function semanticMetadata(item: SettingItem): boolean {
  const schema = item.valueSchema
  const types = Array.isArray(schema['type']) ? schema['type'] : [schema['type']]
  if ((types.includes('number') || types.includes('integer')) && !item.presentation.unit)
    return false
  if (!enumMetadata(item)) return false
  if (item.merge === 'disabled')
    return types.length === 1 && types[0] === 'boolean' && item.sensitivity === 'ordinary'
  return item.sensitivity !== 'secret' || item.default.kind === 'absent'
}

export function defineSettings(input: unknown): SettingsDefinitionResult {
  if (!withinSettingsBudget(input)) return { kind: 'limit_exceeded' }
  const parsed = SettingDefinitionsSchema.safeParse(input)
  if (!parsed.success) return { kind: 'invalid_input' }
  const definition = parsed.data
  if (
    !validGroups(definition) ||
    new Set(definition.items.map(item => item.id)).size !== definition.items.length
  )
    return { kind: 'invalid_input' }
  for (const item of definition.items) {
    const validate = valueValidator(item)
    if (
      !semanticMetadata(item) ||
      !validate ||
      (item.default.kind === 'value' && !validate(item.default.value))
    )
      return { kind: 'invalid_input' }
  }
  return immutable({ kind: 'defined', definition })
}
