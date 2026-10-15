import { readJsonText, type JsonLimits, type JsonRead, type JsonValue } from '@omne-harness/json-text'

const snapshots = new WeakMap<object, JsonValue>()
const owned = new WeakSet<object>()

export function readBodyText(text: string, limits: JsonLimits): JsonRead {
  const read = readJsonText(text, limits)
  if (read.kind !== 'ok') return read
  const shot = copyNode(read.value, new WeakSet())
  if (shot === undefined) return read
  ownTree(shot)
  snapshots.set(read.value, shot)
  return read
}

export function isReadBody(value: unknown): value is JsonValue {
  return readSnapshot(value) !== undefined
}

export function readSnapshot(value: unknown): JsonValue | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const shot = snapshots.get(value)
  if (shot !== undefined) return shot
  if (owned.has(value)) return value as JsonValue
  return undefined
}

export function copyReadBody(value: unknown): JsonValue | undefined {
  const source = readSnapshot(value)
  if (source === undefined) return undefined
  const copied = copyNode(source, new WeakSet())
  if (copied === undefined) return undefined
  ownTree(copied)
  return copied
}

function ownTree(value: JsonValue): void {
  if (owned.has(value)) return
  owned.add(value)
  if (value.kind === 'array') {
    for (let index = 0; index < value.items.length; index += 1) {
      const item = value.items[index]
      if (item !== undefined) ownTree(item)
    }
    return
  }
  if (value.kind === 'object') {
    for (let index = 0; index < value.entries.length; index += 1) {
      const entry = value.entries[index]
      if (entry !== undefined) ownTree(entry.value)
    }
  }
}

function copyNode(value: unknown, seen: WeakSet<object>): JsonValue | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  if (seen.has(value)) return undefined
  seen.add(value)
  if (!('kind' in value)) return undefined
  if (value.kind === 'null') return Object.freeze({ kind: 'null' })
  if (value.kind === 'boolean') {
    if (!('value' in value) || typeof value.value !== 'boolean') return undefined
    return Object.freeze({ kind: 'boolean', value: value.value })
  }
  if (value.kind === 'string') {
    if (!('value' in value) || typeof value.value !== 'string') return undefined
    return Object.freeze({ kind: 'string', value: value.value })
  }
  if (value.kind === 'number') {
    if (!('lexeme' in value) || typeof value.lexeme !== 'string') return undefined
    return Object.freeze({ kind: 'number', lexeme: value.lexeme })
  }
  if (value.kind === 'array') {
    if (!('items' in value) || !Array.isArray(value.items)) return undefined
    const items: JsonValue[] = []
    for (let index = 0; index < value.items.length; index += 1) {
      const item = copyNode(value.items[index], seen)
      if (item === undefined) return undefined
      items.push(item)
    }
    return Object.freeze({ kind: 'array', items: Object.freeze(items) })
  }
  if (value.kind === 'object') {
    if (!('entries' in value) || !Array.isArray(value.entries)) return undefined
    const entries: { key: string; value: JsonValue }[] = []
    for (let index = 0; index < value.entries.length; index += 1) {
      const entry = value.entries[index]
      if (typeof entry !== 'object' || entry === null || !('key' in entry) || typeof entry.key !== 'string') return undefined
      if (!('value' in entry)) return undefined
      const copied = copyNode(entry.value, seen)
      if (copied === undefined) return undefined
      entries.push(Object.freeze({ key: entry.key, value: copied }))
    }
    return Object.freeze({ kind: 'object', entries: Object.freeze(entries) })
  }
  return undefined
}
