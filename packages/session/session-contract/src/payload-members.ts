// The two steps every payload reader of this member takes: a member of an object, and a text value.
// Internal to the readers; not exported from the root entry.
import type { JsonValue } from '@omne-harness/json-text'

export function member(value: JsonValue | undefined, key: string): JsonValue | undefined {
  return value?.kind === 'object'
    ? value.entries.find(entry => entry.key === key)?.value
    : undefined
}

export function text(value: JsonValue | undefined): string | undefined {
  return value?.kind === 'string' ? value.value : undefined
}
