import { writeJsonText, type JsonValue } from '@omne-harness/json-text'

export function sortedJsonText(value: JsonValue): string {
  if (value.kind === 'array') return `[${value.items.map(sortedJsonText).join(',')}]`
  if (value.kind === 'object') {
    const entries = [...value.entries].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    return `{${entries.map(entry => `${JSON.stringify(entry.key)}:${sortedJsonText(entry.value)}`).join(',')}}`
  }
  return writeJsonText(value)
}
