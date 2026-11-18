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
