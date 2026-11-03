// Canonical JSON text for equality: object members sorted by name in UTF-16 code units, numbers
// as written. Two trees that differ only in member order have the same text.
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'

function compareKeys(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function canonical(value: JsonValue): JsonValue {
  switch (value.kind) {
    case 'array':
      return { kind: 'array', items: value.items.map(canonical) }
    case 'object':
      return {
        kind: 'object',
        entries: [...value.entries]
          .sort((left, right) => compareKeys(left.key, right.key))
          .map(entry => ({ key: entry.key, value: canonical(entry.value) })),
      }
    case 'null':
    case 'boolean':
    case 'string':
    case 'number':
      return value
    default: {
      const exhaustive: never = value
      return exhaustive
    }
  }
}

export function sameJson(left: JsonValue, right: JsonValue): boolean {
  return writeJsonText(canonical(left)) === writeJsonText(canonical(right))
}
