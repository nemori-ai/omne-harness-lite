// Builders of json-text value trees. Every object the engine writes has its keys sorted by UTF-16
// code units, so the request body is sorted-key lossless JSON.
import type { JsonEntry, JsonValue } from '@omne-harness/json-text'

export function text(value: string): JsonValue {
  return { kind: 'string', value }
}

/** A number with this exact lexeme. The caller passes a valid JSON number text. */
export function lexeme(value: string): JsonValue {
  return { kind: 'number', lexeme: value }
}

/** A finite JavaScript number, written as `JSON.stringify` writes it. */
export function finite(value: number): JsonValue {
  if (!Number.isFinite(value)) throw new RangeError('a JSON number must be finite')
  return { kind: 'number', lexeme: JSON.stringify(value) }
}

export function bool(value: boolean): JsonValue {
  return { kind: 'boolean', value }
}

export function list(items: readonly JsonValue[]): JsonValue {
  return { kind: 'array', items }
}

function byKey(left: JsonEntry, right: JsonEntry): number {
  if (left.key < right.key) return -1
  return left.key > right.key ? 1 : 0
}

/** An object with sorted keys. Members whose value is `undefined` are left out. */
export function object(members: Readonly<Record<string, JsonValue | undefined>>): JsonValue {
  const entries: JsonEntry[] = []
  for (const [key, value] of Object.entries(members))
    if (value !== undefined) entries.push({ key, value })
  return { kind: 'object', entries: entries.toSorted(byKey) }
}

/**
 * The same tree with the keys of every object sorted. Values a hook returned are sorted this way
 * before they enter the body. The sort is stable, so repeated keys keep their order.
 */
export function sorted(value: JsonValue): JsonValue {
  switch (value.kind) {
    case 'array':
      return { kind: 'array', items: value.items.map(sorted) }
    case 'object':
      return {
        kind: 'object',
        entries: value.entries
          .map(entry => ({ key: entry.key, value: sorted(entry.value) }))
          .toSorted(byKey),
      }
    case 'null':
    case 'boolean':
    case 'string':
    case 'number':
      return value
    default: {
      const _exhaustive: never = value
      return _exhaustive
    }
  }
}
