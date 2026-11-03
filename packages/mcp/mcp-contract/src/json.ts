// Readers over the lossless JSON tree. Internal: the public entries do not export them.
import type { JsonValue } from '@omne-harness/json-text'

export type JsonObject = Extract<JsonValue, { kind: 'object' }>

export function isObject(value: JsonValue | undefined): value is JsonObject {
  return value?.kind === 'object'
}

/** The value of `key`, or undefined when the object has no such member. */
export function member(object: JsonObject, key: string): JsonValue | undefined {
  return object.entries.find(entry => entry.key === key)?.value
}

/** True when every member name of `object` is in `allowed`. */
export function hasOnly(object: JsonObject, allowed: readonly string[]): boolean {
  return object.entries.every(entry => allowed.includes(entry.key))
}

/** The text of a string node. Undefined for any other node. */
export function textOf(value: JsonValue | undefined): string | undefined {
  return value?.kind === 'string' ? value.value : undefined
}

/** The items of an array node. Undefined for any other node. */
export function itemsOf(value: JsonValue | undefined): readonly JsonValue[] | undefined {
  return value?.kind === 'array' ? value.items : undefined
}
