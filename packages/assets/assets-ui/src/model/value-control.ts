import type { JsonValue } from '@omne-harness/json-text'

export type ValueControl =
  | Readonly<{ kind: 'pick'; values: readonly string[] }>
  | Readonly<{ kind: 'text' }>
  | Readonly<{ kind: 'none' }>

const NONE: ValueControl = { kind: 'none' }

export function controlOf(schema: JsonValue): ValueControl {
  if (schema.kind !== 'object') return NONE
  const field = (key: string) => schema.entries.find(entry => entry.key === key)?.value
  const choices = field('enum')
  if (choices !== undefined) return pickOf(choices)
  const type = field('type')
  return type?.kind === 'string' && type.value === 'string' ? { kind: 'text' } : NONE
}

function pickOf(choices: JsonValue): ValueControl {
  if (choices.kind !== 'array' || choices.items.length === 0) return NONE
  const values = choices.items.flatMap(item => (item.kind === 'string' ? [item.value] : []))
  return values.length === choices.items.length ? { kind: 'pick', values } : NONE
}

export type FieldControl =
  | Exclude<ValueControl, { kind: 'none' }>
  | Readonly<{ kind: 'switch' }>
  | Readonly<{ kind: 'number' }>

export type FormField = Readonly<{
  key: string
  title: string | null
  required: boolean
  control: FieldControl
}>

/** A body the form can draw field by field, or one it can only take as JSON text. */
export type DataForm =
  | Readonly<{ kind: 'fields'; fields: readonly FormField[] }>
  | Readonly<{ kind: 'json' }>

const JSON_FORM: DataForm = { kind: 'json' }

const member = (value: JsonValue, key: string): JsonValue | undefined =>
  value.kind === 'object' ? value.entries.find(entry => entry.key === key)?.value : undefined

function fieldControl(schema: JsonValue): FieldControl | undefined {
  const control = controlOf(schema)
  if (control.kind !== 'none') return control
  const type = member(schema, 'type')
  if (type?.kind !== 'string') return undefined
  if (type.value === 'boolean') return { kind: 'switch' }
  if (type.value === 'number' || type.value === 'integer') return { kind: 'number' }
  return undefined
}

function requiredKeys(schema: JsonValue): ReadonlySet<string> {
  const required = member(schema, 'required')
  if (required?.kind !== 'array') return new Set()
  return new Set(required.items.flatMap(item => (item.kind === 'string' ? [item.value] : [])))
}

/** A top-level object of strings, enums, booleans and numbers is drawn; any other shape is JSON. */
export function formOf(schema: JsonValue): DataForm {
  const type = member(schema, 'type')
  const properties = member(schema, 'properties')
  if (type?.kind !== 'string' || type.value !== 'object' || properties?.kind !== 'object')
    return JSON_FORM
  const needed = requiredKeys(schema)
  const fields: FormField[] = []
  for (const { key, value } of properties.entries) {
    const control = fieldControl(value)
    if (control === undefined) return JSON_FORM
    const title = member(value, 'title')
    fields.push({
      key,
      title: title?.kind === 'string' ? title.value : null,
      required: needed.has(key),
      control,
    })
  }
  return fields.length === 0 ? JSON_FORM : { kind: 'fields', fields }
}
