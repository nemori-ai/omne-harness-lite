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
//
// One more part is not a list of members: `a` holds the request that the last main-purpose M0 of
// the session recorded (`AdoptedPart`, FIXED-FACTS F4). The publication of that M0 writes it, and
// only the next one replaces it. Its `record` is the opaque state of the preparing side; nothing
// here decodes it.
import type { AgentCheckpoint } from '@omne-harness/agent-contract'
import type { Adoption, DurableEvidence } from '@omne-harness/exchange-refs'
import type { JsonValue } from '@omne-harness/sql-contract'
import { canonical } from '../testing/canonical.ts'
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
/** The part of the request that the last main-purpose M0 of the session recorded. */
export const ADOPTED_PART = 'a'

/**
 * The request that the last main-purpose M0 of the session recorded, with its adoption order.
 * `order` is canonical decimal text from `1`, one more for each request written; it is not an
 * execution revision and not the publication count. `coverage` is the `adoptedContext` of the same
 * checkpoint. `reference`, `fixed`, `schema` and `record` are the checkpoint's `adoptedRequest`,
 * kept as given.
 */
export type AdoptedPart = Readonly<{
  order: string
  execution: string
  reference: string
  fixed: DurableEvidence
  coverage: DurableEvidence | null
  schema: Adoption
  record: JsonValue
}>

type AdoptedRequest = NonNullable<AgentCheckpoint['adoptedRequest']>

const ORDER = /^[1-9][0-9]*$/
const EVIDENCE_KEYS = ['owner', 'record', 'revision', 'digest']
const ADOPTION_KEYS = ['owner', 'name', 'revision', 'digest']
const isText = (value: unknown): value is string => typeof value === 'string'
const isObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** An object with exactly `names` as members, each one text. */
function texts(value: unknown, names: readonly string[]): boolean {
  return (
    isObject(value) &&
    Object.keys(value).length === names.length &&
    names.every(name => isText(value[name]))
  )
}

/** Each member of the stored `a` part, and what its value must be. */
const ADOPTED_MEMBERS: Readonly<Record<keyof AdoptedPart, (value: unknown) => boolean>> = {
  order: value => isText(value) && ORDER.test(value),
  execution: isText,
  reference: isText,
  fixed: value => texts(value, EVIDENCE_KEYS),
  coverage: value => value === null || texts(value, EVIDENCE_KEYS),
  schema: value => texts(value, ADOPTION_KEYS),
  record: value => value !== undefined,
}

/** The stored form of the `a` part: plain JSON, without the marks of `journal-state.ts`. */
export function encodeAdopted(adopted: AdoptedPart): JsonValue {
  return {
    order: adopted.order,
    execution: adopted.execution,
    reference: adopted.reference,
    fixed: { ...adopted.fixed },
    coverage: adopted.coverage === null ? null : { ...adopted.coverage },
    schema: { ...adopted.schema },
    record: adopted.record,
  }
}

/** The `a` part as stored. It throws a TypeError on a part that this provider did not write. */
export function decodeAdopted(state: JsonValue): AdoptedPart {
  if (!isObject(state)) throw new TypeError('the adopted part is not an object')
  const names = Object.keys(ADOPTED_MEMBERS) as (keyof AdoptedPart)[]
  if (Object.keys(state).length !== names.length)
    throw new TypeError('the adopted part does not hold its members')
  for (const name of names)
    if (!Object.hasOwn(state, name) || !ADOPTED_MEMBERS[name](state[name]))
      throw new TypeError(`the adopted ${name} is malformed`)
  const value = state as unknown as AdoptedPart
  return {
    order: value.order,
    execution: value.execution,
    reference: value.reference,
    fixed: value.fixed,
    coverage: value.coverage,
    schema: value.schema,
    record: value.record,
  }
}

/** What tells one recorded request from another: its invocation and its fixed basis. */
const requestKey = (request: AdoptedRequest): string =>
  canonical([request.reference, request.fixed])

/**
 * The `a` part that one publication writes, or null when it writes none. It writes one when the
 * checkpoint of an execution holds an `adoptedRequest` that its stored checkpoint did not hold: a
 * new main-purpose M0. A publication that leaves every `adoptedRequest` as stored writes none, also
 * when `current` is the request of another execution. The order is one more than that of
 * `current`.
 */
export function planAdopted(
  current: AdoptedPart | null,
  stored: DurableJournalState,
  next: DurableJournalState,
): AdoptedPart | null {
  let adopted: AdoptedPart | null = null
  for (const [key, execution] of next.executions) {
    const request = execution.checkpoint.adoptedRequest
    if (request === null || request === undefined) continue
    const prior = stored.executions.get(key)?.checkpoint.adoptedRequest
    if (prior !== null && prior !== undefined && requestKey(prior) === requestKey(request)) continue
    const last: AdoptedPart | null = adopted ?? current
    adopted = {
      order: (BigInt(last?.order ?? '0') + 1n).toString(),
      execution: execution.id,
      reference: request.reference,
      fixed: request.fixed,
      coverage: execution.checkpoint.adoptedContext ?? null,
      schema: request.schema,
      record: request.record,
    }
  }
  return adopted
}

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

/** What one planning of a publication has decided so far; nothing in `layout` changes before `commit`. */
type Staging = Readonly<{
  layout: PartLayout
  /** The new place of a record, or null for a record that goes. */
  staged: Map<string, Place | null>
  /** The parts to write. */
  dirty: Set<string>
  /** The next order of each member. */
  counters: Map<string, number>
  writer: string | null
}>

function nextOrder(staging: Staging, member: string): number {
  const order = staging.counters.get(member) ?? 0
  staging.counters.set(member, order + 1)
  return order
}

/** Stages the records of one member that are new, changed, moved to the end of the map, or gone. */
function stageMember(staging: Staging, member: Member, before: Entries, after: Entries): void {
  const { layout, staged, dirty, writer } = staging
  let last = -1
  for (const [key, value] of after) {
    const id = idOf(member.name, key)
    const place = layout.places.get(id)
    if (place === undefined) {
      const part = partOf(member, key, value, writer)
      const order = nextOrder(staging, member.name)
      staged.set(id, { part, order, key })
      dirty.add(part)
      last = order
      continue
    }
    if (before.get(key) !== value) dirty.add(place.part)
    if (place.order < last) {
      // The record moved to the end of its map (deleted and set again): it takes a new order.
      const order = nextOrder(staging, member.name)
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

/** The records of `part` once the staged places are applied. */
function membersOf({ layout, staged }: Staging, part: string): string[] {
  const ids = new Set(layout.parts.get(part) ?? [])
  for (const [id, place] of staged) {
    // A staged record that left this part: only a deletion leaves one (a record never changes part).
    if (place === null || place.part !== part) ids.delete(id)
    else ids.add(id)
  }
  return [...ids]
}

/** The dirty parts in name order, each encoded from the next values; null state: the part is empty. */
function encodeParts(staging: Staging, values: ReadonlyMap<string, Entries>) {
  return [...staging.dirty].sort().map(part => {
    const ids = membersOf(staging, part)
    if (ids.length === 0) return { part, state: null }
    const body: Record<string, JsonValue[]> = {}
    for (const id of ids) {
      const place = staging.staged.get(id) ?? staging.layout.places.get(id)
      if (place === undefined || place === null) continue
      const name = memberOf(id)
      const value = values.get(name)?.get(place.key)
      ;(body[name] ??= []).push([place.order, encodeState(place.key), encodeState(value)])
    }
    for (const list of Object.values(body))
      list.sort((a, b) => ((a as number[])[0] ?? 0) - ((b as number[])[0] ?? 0))
    return { part, state: body as JsonValue }
  })
}

/** Applies the staged places to the layout: the publication committed. */
function applyStaged({ layout, staged, counters }: Staging): void {
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
}

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
  const staging: Staging = {
    layout,
    staged: new Map(),
    dirty: new Set(),
    counters: new Map(layout.next),
    writer,
  }
  if (writer !== null)
    for (const part of [recordsPart(writer), operationsPart(writer)])
      if (layout.parts.has(part)) staging.dirty.add(part)
  const values = new Map<string, Entries>()
  for (const member of MEMBERS) {
    const after = member.read(next)
    values.set(member.name, after)
    stageMember(staging, member, member.read(stored), after)
  }
  return { parts: encodeParts(staging, values), commit: () => applyStaged(staging) }
}

/**
 * The stored state rebuilt from its parts, with the layout that mirrors them. `empty`: there was
 * no part, and `state` is the empty state.
 */
export type RebuiltParts = Readonly<{
  state: DurableJournalState
  empty: boolean
  layout: PartLayout
  /** The request of the `a` part; null when the session has none. */
  adopted: AdoptedPart | null
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

/** The decoded `a` part among stored parts; null when they do not hold it or drop it. */
function adoptedAmong(
  parts: readonly Readonly<{ part: string; state: JsonValue | null }>[],
): AdoptedPart | null {
  const found = parts.find(item => item.part === ADOPTED_PART)
  return found === undefined || found.state === null ? null : decodeAdopted(found.state)
}

/** The parts that are lists of members: every part but `a`. */
const memberParts = <T extends Readonly<{ part: string }>>(parts: readonly T[]): T[] =>
  parts.filter(item => item.part !== ADOPTED_PART)

/** The state and the layout of a set of entries, each map in the order of its entries' orders. */
function assemble(
  entries: readonly Entry[],
  empty: boolean,
  adopted: AdoptedPart | null,
): RebuiltParts {
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
  return { state, empty, layout, adopted }
}

/**
 * Rebuilds the durable state from its parts. A member a part does not know, or an entry that is
 * not `[order, key, value]`, is a part this provider did not write: it throws a TypeError.
 */
export function rebuildParts(
  parts: readonly Readonly<{ part: string; state: JsonValue }>[],
): RebuiltParts {
  return assemble(decodeParts(memberParts(parts)), parts.length === 0, adoptedAmong(parts))
}

/**
 * The stored state after the parts written since it: `changed` replaces the parts it names (a null
 * state drops the part) and the records of the other parts stay as they are, undecoded. It throws
 * as `rebuildParts` throws.
 */
export function mergeParts(
  base: Readonly<{ state: DurableJournalState; layout: PartLayout; adopted: AdoptedPart | null }>,
  changed: readonly Readonly<{ part: string; state: JsonValue | null }>[],
): RebuiltParts {
  const adopted = changed.some(item => item.part === ADOPTED_PART)
    ? adoptedAmong(changed)
    : base.adopted
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
  const written = memberParts(changed).filter(
    (item): item is Readonly<{ part: string; state: JsonValue }> => item.state !== null,
  )
  const entries = [...kept, ...decodeParts(written)]
  return assemble(entries, entries.length === 0, adopted)
}
