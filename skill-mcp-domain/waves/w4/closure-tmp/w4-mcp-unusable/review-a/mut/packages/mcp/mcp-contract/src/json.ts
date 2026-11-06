// Readers over the lossless JSON tree. The public root exports `canonical` and `sameJson`; the
// rest is internal.
import { writeJsonText, type JsonEntry, type JsonValue } from '@omne-harness/json-text'
import { compareCodeUnits } from './order.ts'

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

/** The object without the member `key`, keeping the order of the other members. */
export function without(object: JsonObject, key: string): JsonObject {
  return { kind: 'object', entries: object.entries.filter(entry => entry.key !== key) }
}

/**
 * A copy of the tree whose object members are sorted by name in UTF-16 code unit order. Numbers
 * keep their lexeme. Two trees that differ only in member order have the same canonical form.
 */
export function canonical(value: JsonValue): JsonValue {
  switch (value.kind) {
    case 'array':
      return { kind: 'array', items: value.items.map(canonical) }
    case 'object':
      return {
        kind: 'object',
        entries: [...value.entries]
          .sort(compareKeys)
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

/** True when the two trees have the same canonical text: member order apart, they are equal. */
export function sameJson(left: JsonValue, right: JsonValue): boolean {
  return writeJsonText(canonical(left)) === writeJsonText(canonical(right))
}

/** Orders object members by name in UTF-16 code units. See `compareCodeUnits` on ties. */
function compareKeys(left: JsonEntry, right: JsonEntry): number {
  return compareCodeUnits(left.key, right.key)
}
