import { readJsonText, writeJsonText, type JsonLimits } from '@omne-harness/json-text'
import type { HistoryEntry } from '@omne-harness/session-contract'
import type { JsonValue as JsonTree } from '@omne-harness/json-text'
import type { JsonValue } from '@omne-harness/sql-contract'
import { decodeValue, encodeValue, plainOf } from './codec.ts'

const BODY = 'body'
const PAYLOAD = 'payload'

export class StoredEntryMalformed extends Error {
  override readonly name = 'StoredEntryMalformed'
}

const UNBOUNDED: JsonLimits = {
  maxBytes: Number.MAX_SAFE_INTEGER,
  maxDepth: Number.MAX_SAFE_INTEGER,
  maxItems: Number.MAX_SAFE_INTEGER,
  maxMembers: Number.MAX_SAFE_INTEGER,
  maxStringLength: Number.MAX_SAFE_INTEGER,
  maxNumberLength: Number.MAX_SAFE_INTEGER,
}

const rawJSON = (JSON as unknown as { rawJSON(text: string): unknown }).rawJSON

const isIndexKey = (key: string): boolean =>
  /^(?:0|[1-9][0-9]*)$/.test(key) && Number(key) < 4294967295

function malformedTree(what: string): TypeError {
  return new TypeError(`the payload is not a json-text tree: ${what}`)
}

function plainForText(node: unknown, state: { moved: boolean }): unknown {
  if (typeof node !== 'object' || node === null) throw malformedTree('a node is not an object')
  const tree = node as Record<string, unknown>
  switch (tree['kind']) {
    case 'null':
      return null
    case 'boolean':
    case 'string': {
      const value = tree['value']
      if (typeof value !== (tree['kind'] === 'string' ? 'string' : 'boolean'))
        throw malformedTree(`a ${String(tree['kind'])} value has the wrong type`)
      return value
    }
    case 'number': {
      const lexeme = tree['lexeme']
      if (typeof lexeme !== 'string') throw malformedTree('a number lexeme is not text')
      try {
        return rawJSON(lexeme)
      } catch {
        throw malformedTree('a number lexeme is not a JSON number')
      }
    }
    case 'array': {
      const items = tree['items']
      if (!Array.isArray(items)) throw malformedTree('items is not a list')
      return items.map(item => plainForText(item, state))
    }
    case 'object': {
      const entries = tree['entries']
      if (!Array.isArray(entries)) throw malformedTree('entries is not a list')
      const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>
      for (const entry of entries as unknown[]) {
        if (typeof entry !== 'object' || entry === null)
          throw malformedTree('an entry is not an object')
        const { key, value } = entry as { key?: unknown; value?: unknown }
        if (typeof key !== 'string') throw malformedTree('an entry key is not text')
        if (Object.hasOwn(out, key)) throw malformedTree(`the key ${JSON.stringify(key)} repeats`)
        if (isIndexKey(key)) state.moved = true
        out[key] = plainForText(value, state)
      }
      return out
    }
    default:
      throw malformedTree('a node has no known kind')
  }
}

function payloadText(payload: unknown): string {
  const state = { moved: false }
  const plain = plainForText(payload, state)
  return state.moved ? writeJsonText(payload as JsonTree) : JSON.stringify(plain)
}

export function writeEntryText(entry: HistoryEntry): string {
  const parts: string[] = []
  let body = false
  for (const [key, member] of Object.entries(entry)) {
    if (member === undefined) continue
    if (key === BODY) throw new TypeError(`an entry member named ${BODY} is reserved`)
    if (key === PAYLOAD) {
      parts.push(`"${BODY}":${payloadText(member)}`)
      body = true
    } else parts.push(`${JSON.stringify(key)}:${JSON.stringify(encodeValue(member))}`)
  }
  if (!body) throw new TypeError('an entry without a payload')
  return `{${parts.join(',')}}`
}

function treeOf(value: unknown): JsonTree {
  if (value === null) return { kind: 'null' }
  switch (typeof value) {
    case 'string':
      return { kind: 'string', value }
    case 'boolean':
      return { kind: 'boolean', value }
    case 'number':
      return { kind: 'number', lexeme: String(value) }
  }
  if (Array.isArray(value)) return { kind: 'array', items: value.map(treeOf) }
  return {
    kind: 'object',
    entries: Object.keys(value as object).map(key => ({
      key,
      value: treeOf((value as Record<string, unknown>)[key]),
    })),
  }
}

function readFast(text: string): Record<string, unknown> | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
  if (JSON.stringify(parsed) !== text) return undefined
  const members = parsed as Record<string, unknown>
  if (Object.hasOwn(members, BODY)) members[BODY] = treeOf(members[BODY])
  return members
}

function readExact(text: string, where: string): Record<string, unknown> {
  const read = readJsonText(text, UNBOUNDED)
  if (read.kind !== 'ok')
    throw new StoredEntryMalformed(`${where}: the text is not strict JSON (${read.kind})`)
  if (read.value.kind !== 'object')
    throw new StoredEntryMalformed(`${where}: the text is not a JSON object`)
  const members: Record<string, unknown> = Object.create(null) as Record<string, unknown>
  for (const { key, value } of read.value.entries)
    members[key] = key === BODY ? value : plainOf(value)
  return members
}

export function readEntryTexts(texts: unknown): HistoryEntry[] {
  if (!Array.isArray(texts))
    throw new StoredEntryMalformed('session.history: the page has no entry list')
  return texts.map(item => {
    if (typeof item !== 'string')
      throw new StoredEntryMalformed('session.history: an entry is not a text')
    return readEntryText(item)
  })
}

export function readEntryText(text: string, where = 'sl_entry'): HistoryEntry {
  if (text.isWellFormed() === false)
    throw new StoredEntryMalformed(`${where}: the text has a lone surrogate`)
  const members = readFast(text) ?? readExact(text, where)
  if (!Object.hasOwn(members, BODY))
    throw new StoredEntryMalformed(
      Object.hasOwn(members, PAYLOAD)
        ? `${where}: the row is in the retired value-tree encoding (payload as a tree); this store predates the plain-payload codec`
        : `${where}: the row has no ${BODY}`,
    )
  if (Object.hasOwn(members, PAYLOAD))
    throw new StoredEntryMalformed(`${where}: the row has both ${BODY} and ${PAYLOAD}`)
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(members)) {
    if (key === '__proto__')
      throw new StoredEntryMalformed(`${where}: the row has a member __proto__`)
    out[key === BODY ? PAYLOAD : key] =
      key === BODY ? members[key] : decodeValue(members[key] as JsonValue)
  }
  return out as HistoryEntry
}
