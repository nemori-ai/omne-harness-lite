import type { JsonValue } from '@omne-harness/json-text'

type Cursor =
  | { kind: 'array'; items: readonly JsonValue[]; index: number }
  | { kind: 'object'; entries: Extract<JsonValue, { kind: 'object' }>['entries']; index: number }

const SHORT_ESCAPES = new Set([8, 9, 10, 12, 13, 34, 92])

function quotedCharacterBytes(character: string): number {
  const code = character.charCodeAt(0)
  if (SHORT_ESCAPES.has(code)) return 2
  if (code < 32) return 6
  if (code < 128) return 1
  if (code < 2048) return 2
  if (character.length === 2) return 4
  if (code >= 0xd800 && code <= 0xdfff) return 6
  return 3
}

function quotedBytes(text: string, remaining: number): number {
  let bytes = 2
  for (const character of text) {
    if (bytes > remaining) return bytes
    bytes += quotedCharacterBytes(character)
  }
  return bytes
}

function open(value: JsonValue, stack: Cursor[], remaining: number): number {
  switch (value.kind) {
    case 'null':
      return 4
    case 'boolean':
      return value.value ? 4 : 5
    case 'number':
      return value.lexeme.length
    case 'string':
      return quotedBytes(value.value, remaining)
    case 'array':
      stack.push({ kind: 'array', items: value.items, index: 0 })
      return 2 + Math.max(0, value.items.length - 1)
    case 'object':
      stack.push({ kind: 'object', entries: value.entries, index: 0 })
      return 2 + Math.max(0, value.entries.length - 1)
    default: {
      const exhaustive: never = value
      return exhaustive
    }
  }
}

function advance(
  cursor: Cursor,
  remaining: number,
): { node: JsonValue | undefined; bytes: number } {
  const index = cursor.index++
  if (cursor.kind === 'array') return { node: cursor.items[index], bytes: 0 }
  const entry = cursor.entries[index]
  return entry === undefined
    ? { node: undefined, bytes: 0 }
    : { node: entry.value, bytes: quotedBytes(entry.key, remaining) + 1 }
}

export function fitsSerializedBytes(value: JsonValue, maximum: number): boolean {
  let bytes = 0
  let next: JsonValue | undefined = value
  const stack: Cursor[] = []
  while (next !== undefined || stack.length > 0) {
    if (next !== undefined) {
      bytes += open(next, stack, maximum - bytes)
      next = undefined
      if (bytes > maximum) return false
    }
    const cursor = stack.at(-1)
    if (cursor === undefined) continue
    const step = advance(cursor, maximum - bytes)
    bytes += step.bytes
    if (bytes > maximum) return false
    next = step.node
    if (next === undefined) stack.pop()
  }
  return true
}
