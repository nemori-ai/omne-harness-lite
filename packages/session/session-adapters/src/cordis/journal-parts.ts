// The durable state of one session's Agent records in parts (K-8). Every record lives in the part
// of the execution it belongs to: `o:<execution>` holds the operation records of the execution,
// `x:<execution>` the rest of its records and notes, and `s` the records that name no execution.
// A publication writes only the parts it changed, so a write does not grow with the number of
// executions of the session, and a reader of one execution reads one part.
//
// A part is an object of members; a member is a list of `[order, key, value]` in the encoded form
// of `journal-state.ts`. The order keeps the insertion order of the member's map across parts, so a
// copy rebuilt from the parts iterates its maps as the copy that wrote them did.
//
// What changed is told by identity: the Journal core replaces a record it changes (its draft copy)
// and never changes a published one in place. The parts of the writing execution are written on
// every publication of that execution in any case.
import type { JsonValue } from '@omne-harness/sql-contract'
import { emptyReceivingState } from '../testing/journal-receiving.ts'
import {
  decodeState,
  encodeState,
  type DurableJournalState,
  type InterpretationNotes,
} from './journal-state.ts'

/** The part of the records that name no execution. */
export const SESSION_PART = 's'
/** The part of the records of one execution, without its operation records. */
export const recordsPart = (execution: string): string => `x:${execution}`
/** The part of the operation records of one execution. */
export const operationsPart = (execution: string): string => `o:${execution}`

type Entries = ReadonlyMap<unknown, unknown>

/** One member of the durable state: how to read it, and the execution a record of it belongs to. */
type Member = Readonly<{
  name: string
  read(state: DurableJournalState): Entries
  owner(key: unknown, value: unknown): unknown
  operations?: true
}>

const RECEIVING = Object.keys(emptyReceivingState()) as (keyof DurableJournalState['receiving'])[]

const field = (value: unknown, name: string): unknown =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[name] : undefined
const prefix = (key: unknown): unknown =>
  typeof key === 'string' && key.includes('\0') ? key.slice(0, key.indexOf('\0')) : undefined
const jsonAt = (key: unknown, index: number): unknown => {
  if (typeof key !== 'string') return undefined
  try {
    const parsed = JSON.parse(key) as unknown
    return Array.isArray(parsed) ? parsed[index] : undefined
  } catch {
    return undefined
  }
}

/** The joint facts are a list: a member keyed by position. */
const listEntries = (list: readonly unknown[]): Entries =>
  new Map(list.map((item, at) => [at, item]))

const MEMBERS: readonly Member[] = [
  { name: 'executions', read: s => s.executions, owner: (_k, v) => field(v, 'id') },
  {
    name: 'operations',
    read: s => s.operations,
    owner: k => jsonAt(k, 1),
    operations: true,
  },
  {
    name: 'jointFacts',
    read: s => listEntries(s.jointFacts),
    owner: (_k, v) => field(v, 'execution'),
  },
  { name: 'authorities', read: s => s.authorities, owner: (_k, v) => field(v, 'execution') },
  { name: 'eventReceipts', read: s => s.eventReceipts, owner: prefix },
  { name: 'pendingEvents', read: s => s.pendingEvents, owner: prefix },
  { name: 'callOrigins', read: s => s.callOrigins, owner: prefix },
  { name: 'human', read: s => s.human, owner: prefix },
  { name: 'indexedEvents', read: s => s.indexedEvents, owner: k => k },
  { name: 'notes.heads', read: s => s.notes.heads, owner: k => k },
  { name: 'notes.consequences', read: s => s.notes.consequences, owner: k => jsonAt(k, 0) },
  { name: 'notes.controls', read: s => s.notes.controls, owner: k => jsonAt(k, 0) },
  ...RECEIVING.map((name): Member => ({
    name: `receiving.${name}`,
    read: s => s.receiving[name] as Entries,
    owner: (_k, v) => {
      if (name === 'consumerExecutions') return v
      if (name === 'pendingBindings') return field(Array.isArray(v) ? v[0] : undefined, 'execution')
      return field(v, 'execution')
    },
  })),
]

/** Where one record is: its part and its order in the member. */
type Place = Readonly<{ part: string; order: number; key: unknown }>

/**
 * Where every stored record is, by member and key text, and the records of each part. It mirrors
 * the stored parts exactly: it changes only when a publication that wrote them committed.
 */
export type PartLayout = Readonly<{
  places: Map<string, Place>
  parts: Map<string, Set<string>>
  next: Map<string, number>
}>

const emptyLayout = (): PartLayout => ({ places: new Map(), parts: new Map(), next: new Map() })

const keyText = (key: unknown): string =>
  typeof key === 'string' ? key : `\0${JSON.stringify(encodeState(key))}`
const idOf = (member: string, key: unknown): string => `${member}\0${keyText(key)}`
const memberOf = (id: string): string => id.slice(0, id.indexOf('\0'))

function partOf(member: Member, key: unknown, value: unknown, writer: string | null): string {
  const owner = member.owner(key, value)
  const execution = typeof owner === 'string' && owner !== '' ? owner : writer
  if (execution === null) return SESSION_PART
  return member.operations ? operationsPart(execution) : recordsPart(execution)
}

/** The parts one publication writes, and the layout once it committed. */
export type PartPlan = Readonly<{
  parts: readonly Readonly<{ part: string; state: JsonValue | null }>[]
  commit(): void
}>

/**
 * The parts that changed between the stored state and the next one, encoded. `writer` is the
 * execution of the write: a new record that names no execution goes to its part, and its own parts
 * are written whatever changed. It throws as `encodeState` throws on a value that is not data.
 */
export function planParts(
  layout: PartLayout,
  stored: DurableJournalState,
  next: DurableJournalState,
  writer: string | null,
): PartPlan {
  const staged = new Map<string, Place | null>()
  const dirty = new Set<string>()
  if (writer !== null) {
    for (const part of [recordsPart(writer), operationsPart(writer)])
      if (layout.parts.has(part)) dirty.add(part)
  }
  const counters = new Map(layout.next)
  const nextOrder = (member: string): number => {
    const order = counters.get(member) ?? 0
    counters.set(member, order + 1)
    return order
  }
  const values = new Map<string, Entries>()
  for (const member of MEMBERS) {
    const after = member.read(next)
    const before = member.read(stored)
    values.set(member.name, after)
    let last = -1
    for (const [key, value] of after) {
      const id = idOf(member.name, key)
      const place = layout.places.get(id)
      if (place === undefined) {
        const part = partOf(member, key, value, writer)
        const order = nextOrder(member.name)
        staged.set(id, { part, order, key })
        dirty.add(part)
        last = order
        continue
      }
      if (before.get(key) !== value) dirty.add(place.part)
      if (place.order < last) {
        // The record moved to the end of its map (deleted and set again): it takes a new order.
        const order = nextOrder(member.name)
        staged.set(id, { ...place, order })
        dirty.add(place.part)
        last = order
        continue
      }
      last = place.order
    }
    for (const key of before.keys()) {
      if (after.has(key)) continue
      const id = idOf(member.name, key)
      const place = layout.places.get(id)
      if (place === undefined) continue
      staged.set(id, null)
      dirty.add(place.part)
    }
  }
  const membersOf = (part: string): string[] => {
    const ids = new Set(layout.parts.get(part) ?? [])
    for (const [id, place] of staged) {
      if (place === null || place.part !== part) ids.delete(id)
      else ids.add(id)
    }
    // A staged record that left this part: only a deletion leaves one (a record never changes part).
    return [...ids]
  }
  const parts = [...dirty].sort().map(part => {
    const ids = membersOf(part)
    if (ids.length === 0) return { part, state: null }
    const body: Record<string, JsonValue[]> = {}
    for (const id of ids) {
      const place = staged.get(id) ?? layout.places.get(id)
      if (place === undefined || place === null) continue
      const name = memberOf(id)
      const value = values.get(name)?.get(place.key)
      ;(body[name] ??= []).push([place.order, encodeState(place.key), encodeState(value)])
    }
    for (const list of Object.values(body))
      list.sort((a, b) => ((a as number[])[0] ?? 0) - ((b as number[])[0] ?? 0))
    return { part, state: body as JsonValue }
  })
  return {
    parts,
    commit() {
      for (const [id, place] of staged) {
        const prior = layout.places.get(id)
        if (prior !== undefined) layout.parts.get(prior.part)?.delete(id)
        if (place === null) {
          layout.places.delete(id)
          continue
        }
        layout.places.set(id, place)
        let set = layout.parts.get(place.part)
        if (set === undefined) layout.parts.set(place.part, (set = new Set()))
        set.add(id)
      }
      for (const [part, set] of layout.parts) if (set.size === 0) layout.parts.delete(part)
      for (const [name, order] of counters) layout.next.set(name, order)
    },
  }
}

/**
 * The stored state rebuilt from its parts, with the layout that mirrors them. `empty`: there was
 * no part, and `state` is the empty state.
 */
export type RebuiltParts = Readonly<{
  state: DurableJournalState
  empty: boolean
  layout: PartLayout
}>

type Entry = Readonly<{ name: string; part: string; order: number; key: unknown; value: unknown }>

/** The entries of stored parts, decoded. It throws a TypeError on a part this provider did not write. */
function decodeParts(parts: readonly Readonly<{ part: string; state: JsonValue }>[]): Entry[] {
  const known = new Set(MEMBERS.map(member => member.name))
  const entries: Entry[] = []
  for (const { part, state } of parts) {
    if (typeof state !== 'object' || state === null || Array.isArray(state))
      throw new TypeError(`the part ${part} is not an object of members`)
    for (const [name, list] of Object.entries(state)) {
      if (!known.has(name)) throw new TypeError(`the part ${part} holds an unknown member ${name}`)
      if (!Array.isArray(list)) throw new TypeError(`the member ${name} of ${part} is not a list`)
      for (const item of list) {
        if (!Array.isArray(item) || item.length !== 3 || typeof item[0] !== 'number')
          throw new TypeError(`an entry of ${name} in ${part} is malformed`)
        entries.push({
          name,
          part,
          order: item[0],
          key: decodeState(item[1] ?? null),
          value: decodeState(item[2] ?? null),
        })
      }
    }
  }
  return entries
}

/** The state and the layout of a set of entries, each map in the order of its entries' orders. */
function assemble(entries: readonly Entry[], empty: boolean): RebuiltParts {
  const layout = emptyLayout()
  const gathered = new Map<string, Entry[]>()
  for (const entry of entries) {
    const id = idOf(entry.name, entry.key)
    if (layout.places.has(id)) throw new TypeError(`the record ${id} is in two parts`)
    layout.places.set(id, { part: entry.part, order: entry.order, key: entry.key })
    let set = layout.parts.get(entry.part)
    if (set === undefined) layout.parts.set(entry.part, (set = new Set()))
    set.add(id)
    layout.next.set(entry.name, Math.max(layout.next.get(entry.name) ?? 0, entry.order + 1))
    let list = gathered.get(entry.name)
    if (list === undefined) gathered.set(entry.name, (list = []))
    list.push(entry)
  }
  const mapOf = (name: string): Map<unknown, unknown> =>
    new Map(
      (gathered.get(name) ?? [])
        .sort((a, b) => a.order - b.order)
        .map(entry => [entry.key, entry.value]),
    )
  const receiving = Object.fromEntries(
    RECEIVING.map(name => [name, mapOf(`receiving.${name}`)]),
  ) as unknown as DurableJournalState['receiving']
  const notes: InterpretationNotes = {
    heads: mapOf('notes.heads') as InterpretationNotes['heads'],
    consequences: mapOf('notes.consequences') as InterpretationNotes['consequences'],
    controls: mapOf('notes.controls') as InterpretationNotes['controls'],
  }
  const state = {
    executions: mapOf('executions'),
    operations: mapOf('operations'),
    jointFacts: [...mapOf('jointFacts').values()],
    authorities: mapOf('authorities'),
    receiving,
    eventReceipts: mapOf('eventReceipts'),
    pendingEvents: mapOf('pendingEvents'),
    callOrigins: mapOf('callOrigins'),
    human: mapOf('human'),
    indexedEvents: mapOf('indexedEvents'),
    notes,
  } as unknown as DurableJournalState
  return { state, empty, layout }
}

/**
 * Rebuilds the durable state from its parts. A member a part does not know, or an entry that is
 * not `[order, key, value]`, is a part this provider did not write: it throws a TypeError.
 */
export function rebuildParts(
  parts: readonly Readonly<{ part: string; state: JsonValue }>[],
): RebuiltParts {
  return assemble(decodeParts(parts), parts.length === 0)
}

/**
 * The stored state after the parts written since it: `changed` replaces the parts it names (a null
 * state drops the part) and the records of the other parts stay as they are, undecoded. It throws
 * as `rebuildParts` throws.
 */
export function mergeParts(
  base: Readonly<{ state: DurableJournalState; layout: PartLayout }>,
  changed: readonly Readonly<{ part: string; state: JsonValue | null }>[],
): RebuiltParts {
  const names = new Set(changed.map(item => item.part))
  const members = new Map(MEMBERS.map(member => [member.name, member.read(base.state)]))
  const kept: Entry[] = []
  for (const [id, place] of base.layout.places) {
    if (names.has(place.part)) continue
    const name = memberOf(id)
    kept.push({
      name,
      part: place.part,
      order: place.order,
      key: place.key,
      value: members.get(name)?.get(place.key),
    })
  }
  const written = changed.filter(
    (item): item is Readonly<{ part: string; state: JsonValue }> => item.state !== null,
  )
  const entries = [...kept, ...decodeParts(written)]
  return assemble(entries, entries.length === 0)
}
