import type { JsonValue } from '@omne-harness/json-text'

export function member(value: JsonValue | undefined, key: string): JsonValue | undefined {
  return value?.kind === 'object'
    ? value.entries.find(entry => entry.key === key)?.value
    : undefined
}

export function textAt(
  value: JsonValue | undefined,
  ...path: readonly string[]
): string | undefined {
  const found = path.reduce<JsonValue | undefined>(member, value)
  return found?.kind === 'string' ? found.value : undefined
}
