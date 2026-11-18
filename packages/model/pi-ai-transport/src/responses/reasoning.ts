import { readJsonText, writeJsonText, type JsonValue } from '@omne-harness/json-text'
import { lexeme, object, text } from '../chat-completions/json.ts'
import { PHASE, type ItemEntry } from './vocabulary.ts'

const COUNT = /^(0|[1-9][0-9]{0,8})$/

function entryJson(entry: ItemEntry): JsonValue {
  switch (entry.type) {
    case 'reasoning':
      return object({ item: entry.item, type: text('reasoning') })
    case 'message':
      return object({
        id: text(entry.id),
        parts: lexeme(String(entry.parts)),
        phase: entry.phase === null ? { kind: 'null' } : text(entry.phase),
        type: text('message'),
      })
    case 'function_call':
      return object({
        call_id: text(entry.callId),
        id: text(entry.id),
        type: text('function_call'),
      })
    default: {
      const _exhaustive: never = entry
      return _exhaustive
    }
  }
}

/** The payload of a reasoning state: the output items of one reply, in the order they came. */
export function sealItems(entries: readonly ItemEntry[]): string {
  return writeJsonText({ kind: 'array', items: entries.map(entryJson) })
}

type Members = ReadonlyMap<string, JsonValue>

function word(members: Members, key: string): string | null {
  const value = members.get(key)
  return value?.kind === 'string' && value.value !== '' ? value.value : null
}

function membersOf(value: JsonValue | undefined): Members | null {
  return value?.kind === 'object'
    ? new Map(value.entries.map(entry => [entry.key, entry.value]))
    : null
}

function reasoningOf(members: Members): ItemEntry | null {
  const item = members.get('item')
  const inner = membersOf(item)
  if (item?.kind !== 'object' || inner === null) return null
  return word(inner, 'type') === 'reasoning' && word(inner, 'id') !== null
    ? { type: 'reasoning', item }
    : null
}

function messageOf(members: Members): ItemEntry | null {
  const id = word(members, 'id')
  const parts = members.get('parts')
  const phase = members.get('phase')
  if (id === null || parts?.kind !== 'number' || !COUNT.test(parts.lexeme)) return null
  const shell = { type: 'message', id, parts: Number(parts.lexeme) } as const
  if (phase?.kind === 'null') return { ...shell, phase: null }
  return phase?.kind === 'string' && PHASE.test(phase.value)
    ? { ...shell, phase: phase.value }
    : null
}

function callOf(members: Members): ItemEntry | null {
  const id = word(members, 'id')
  const callId = word(members, 'call_id')
  return id === null || callId === null ? null : { type: 'function_call', id, callId }
}

const READERS: ReadonlyMap<string, (members: Members) => ItemEntry | null> = new Map([
  ['reasoning', reasoningOf],
  ['message', messageOf],
  ['function_call', callOf],
])

function entryOf(value: JsonValue): ItemEntry | null {
  const members = membersOf(value)
  const read = members === null ? undefined : READERS.get(word(members, 'type') ?? '')
  return members === null || read === undefined ? null : read(members)
}

/** The output items of a payload, or null when it is not one this engine sealed. */
export function readItems(payload: string): readonly ItemEntry[] | null {
  const bound = Math.max(1, payload.length)
  const read = readJsonText(payload, {
    maxBytes: bound * 4,
    maxDepth: 16,
    maxItems: bound,
    maxMembers: bound,
    maxStringLength: bound,
    maxNumberLength: bound,
  })
  if (read.kind !== 'ok' || read.value.kind !== 'array' || read.value.items.length === 0)
    return null
  const entries: ItemEntry[] = []
  for (const item of read.value.items) {
    const entry = entryOf(item)
    if (entry === null) return null
    entries.push(entry)
  }
  return entries
}
