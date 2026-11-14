import { writeJsonText, type JsonEntry, type JsonValue } from '@omne-harness/json-text'
import { compareCodeUnits } from './order.ts'

export type JsonObject = Extract<JsonValue, { kind: 'object' }>

export function isObject(value: JsonValue | undefined): value is JsonObject {
  return value?.kind === 'object'
}

export function member(object: JsonObject, key: string): JsonValue | undefined {
  return object.entries.find(entry => entry.key === key)?.value
}

export function hasOnly(object: JsonObject, allowed: readonly string[]): boolean {
  return object.entries.every(entry => allowed.includes(entry.key))
}

export function textOf(value: JsonValue | undefined): string | undefined {
  return value?.kind === 'string' ? value.value : undefined
}

export function itemsOf(value: JsonValue | undefined): readonly JsonValue[] | undefined {
  return value?.kind === 'array' ? value.items : undefined
}

export function without(object: JsonObject, key: string): JsonObject {
  return { kind: 'object', entries: object.entries.filter(entry => entry.key !== key) }
}

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

export function sameJson(left: JsonValue, right: JsonValue): boolean {
  return writeJsonText(canonical(left)) === writeJsonText(canonical(right))
}

function compareKeys(left: JsonEntry, right: JsonEntry): number {
  return compareCodeUnits(left.key, right.key)
}
