// The work snapshot holds the open calls; a call that left is lent back to the batch that names it.
import type { SessionCallRecord } from './call-values.ts'
import type { ConsumptionId, DurableEvidence } from './identity.ts'
import { digestOf } from './operations.ts'
import type {
  CallBinding,
  Consumption,
  ProducedResult,
  ProducerRef,
  WorkSnapshot,
} from './values.ts'
import type { SessionCallEntryReferences } from './work-entry-values.ts'
import { unsettled } from './work-entry-state.ts'

type Draft = { -readonly [K in keyof WorkSnapshot]: WorkSnapshot[K] }

export type SessionCall = Readonly<{
  record: SessionCallRecord
  consumed: Consumption | null
  references: SessionCallEntryReferences | null
}>

/** What a fact wrote about a call that had left the snapshot. Each slot of a call is written once. */
export type SessionLateCallFact =
  | Readonly<{ consumption: ConsumptionId; slot: 'association'; record: SessionCallRecord }>
  | Readonly<{
      consumption: ConsumptionId
      slot: 'result'
      version: string
      result: ProducedResult
    }>
  | Readonly<{
      consumption: ConsumptionId
      slot: 'custody' | 'completion'
      version: string
      evidence: DurableEvidence
    }>
  | Readonly<{ consumption: ConsumptionId; slot: 'release'; version: string }>

export type SessionCallKeys = Readonly<{
  consumptions: readonly ConsumptionId[]
  producers: readonly ProducerRef[]
}>

/** Answers the calls that left the snapshot, among the ones named. A call it does not answer never was. */
export type SettledCallLookup = (keys: SessionCallKeys) => readonly SessionCall[]

const isProducer = (value: object): value is ProducerRef => {
  const { kind, call } = value as { kind?: unknown; call?: unknown }
  return (kind === 'model' || kind === 'tool') && typeof call === 'string'
}

export function callKeysIn(value: unknown): SessionCallKeys {
  const consumptions = new Set<ConsumptionId>()
  const producers = new Map<string, ProducerRef>()
  const walk = (item: unknown): void => {
    if (typeof item !== 'object' || item === null) return
    if (Array.isArray(item)) return item.forEach(walk)
    if (isProducer(item)) producers.set(digestOf({ kind: item.kind, call: item.call }), item)
    for (const [key, member] of Object.entries(item))
      if (key === 'consumption' && typeof member === 'string')
        consumptions.add(member as ConsumptionId)
      else walk(member)
  }
  walk(value)
  return { consumptions: [...consumptions], producers: [...producers.values()] }
}

const producerOf = (call: SessionCall): ProducerRef | null =>
  call.record.registration.kind === 'associated' ? call.record.registration.binding.producer : null

export function callOf(snapshot: WorkSnapshot, consumption: ConsumptionId): SessionCall | null {
  const record = snapshot.callRegistrations?.find(item => item.consumption === consumption)
  if (record === undefined) return null
  return {
    record,
    consumed: snapshot.consumptions.find(item => item.id === consumption) ?? null,
    references:
      snapshot.workEntryIndex?.calls.find(item => item.consumption === consumption) ?? null,
  }
}

type Named = Readonly<{ consumption: ConsumptionId; producer: string | null }>

function controlled(snapshot: WorkSnapshot, { consumption, producer }: Named): boolean {
  const names = (item: Readonly<{ consumption: ConsumptionId }>) => item.consumption === consumption
  return (
    snapshot.controls.some(
      control =>
        unsettled(control) &&
        ((producer !== null && control.pending.some(item => digestOf(item) === producer)) ||
          (control.pendingUnassociatedWaiting ?? []).some(names)),
    ) || (snapshot.workEntryIndex?.controls ?? []).some(control => control.selected.some(names))
  )
}

function referenced(snapshot: WorkSnapshot, call: SessionCall): boolean {
  const producer = producerOf(call)
  const named = {
    consumption: call.record.consumption,
    producer: producer === null ? null : digestOf(producer),
  }
  return (
    (snapshot.backgroundPlaceholders ?? []).includes(named.consumption) ||
    controlled(snapshot, named)
  )
}

const settledInBackground = (snapshot: WorkSnapshot, call: SessionCall): boolean =>
  (snapshot.backgroundCalls ?? []).some(
    item => item.consumption === call.record.consumption && item.settled !== undefined,
  )

/** The open rule: a call is open work while a control or the background refers to it, or it is still out. A call whose final delivery is in the log is no longer out. */
export function callOpen(snapshot: WorkSnapshot, call: SessionCall): boolean {
  if (referenced(snapshot, call)) return true
  if (call.consumed?.delivered !== undefined || settledInBackground(snapshot, call)) return false
  const active = snapshot.run.kind === 'active'
  if (call.record.registration.kind === 'tool-intent') return active
  const results = call.consumed?.results ?? []
  if (results.length === 0) return true
  return active && results.every(item => item.completion === null)
}

function put(draft: Draft, call: SessionCall): void {
  draft.callRegistrations = [...(draft.callRegistrations ?? []), call.record]
  if (call.consumed !== null) draft.consumptions = [...draft.consumptions, call.consumed]
  if (call.references !== null && draft.workEntryIndex !== undefined)
    draft.workEntryIndex = {
      ...draft.workEntryIndex,
      calls: [...draft.workEntryIndex.calls, call.references],
    }
}

function drop(draft: Draft, gone: ReadonlySet<ConsumptionId>): void {
  draft.callRegistrations = (draft.callRegistrations ?? []).filter(
    item => !gone.has(item.consumption),
  )
  draft.consumptions = draft.consumptions.filter(item => !gone.has(item.id))
  if (draft.workEntryIndex !== undefined)
    draft.workEntryIndex = {
      ...draft.workEntryIndex,
      calls: draft.workEntryIndex.calls.filter(item => !gone.has(item.consumption)),
    }
}

export function lendCalls(snapshot: WorkSnapshot, lent: readonly SessionCall[]): WorkSnapshot {
  const draft: Draft = { ...snapshot }
  for (const call of lent) put(draft, call)
  return draft
}

type Kept = Consumption['results'][number]

function versionFacts(
  consumption: ConsumptionId,
  was: Kept | undefined,
  now: Kept,
): SessionLateCallFact[] {
  const { version } = now.result
  const facts: SessionLateCallFact[] = []
  if (was === undefined) facts.push({ consumption, slot: 'result', version, result: now.result })
  for (const slot of ['custody', 'completion'] as const) {
    const evidence = now[slot]
    if (evidence !== null && (was?.[slot] ?? null) === null)
      facts.push({ consumption, slot, version, evidence })
  }
  if (now.release === 'confirmed' && was?.release !== 'confirmed')
    facts.push({ consumption, slot: 'release', version })
  return facts
}

function lateFacts(before: SessionCall, after: SessionCall): SessionLateCallFact[] {
  const { consumption } = before.record
  const association: SessionLateCallFact[] =
    digestOf(before.record) === digestOf(after.record)
      ? []
      : [{ consumption, slot: 'association', record: after.record }]
  const earlier = before.consumed?.results ?? []
  return [
    ...association,
    ...(after.consumed?.results ?? []).flatMap(now =>
      versionFacts(
        consumption,
        earlier.find(item => item.result.version === now.result.version),
        now,
      ),
    ),
  ]
}

export type CallSettlement = Readonly<{
  settled: readonly SessionCall[]
  late: readonly SessionLateCallFact[]
}>

/** After a batch: the lent calls go out again with what the batch wrote about them, and the calls the open rule no longer holds for leave. */
export function settleCalls(draft: Draft, lent: readonly SessionCall[]): CallSettlement {
  const late: SessionLateCallFact[] = []
  const gone = new Set<ConsumptionId>()
  for (const before of lent) {
    late.push(...lateFacts(before, callOf(draft, before.record.consumption) as SessionCall))
    gone.add(before.record.consumption)
  }
  const settled: SessionCall[] = []
  for (const record of draft.callRegistrations ?? []) {
    if (gone.has(record.consumption)) continue
    const call = callOf(draft, record.consumption) as SessionCall
    if (callOpen(draft, call)) continue
    settled.push(call)
    gone.add(record.consumption)
  }
  drop(draft, gone)
  return { settled, late }
}

type LateResultFact = Exclude<SessionLateCallFact, { slot: 'association' }>

function resultsWith(results: readonly Kept[], fact: LateResultFact): readonly Kept[] {
  if (fact.slot === 'result')
    return results.some(item => item.result.version === fact.version)
      ? results
      : [...results, { result: fact.result, custody: null, completion: null, release: 'pending' }]
  return results.map(item =>
    item.result.version !== fact.version
      ? item
      : fact.slot === 'release'
        ? { ...item, release: 'confirmed' }
        : { ...item, [fact.slot]: item[fact.slot] ?? fact.evidence },
  )
}

/** A settled call with the facts written about it since: what the snapshot would hold had it kept the call. */
export function callWithLate(call: SessionCall, late: readonly SessionLateCallFact[]): SessionCall {
  let { record, consumed } = call
  for (const fact of late) {
    if (fact.consumption !== call.record.consumption) continue
    if (fact.slot === 'association') {
      record = fact.record
      if (consumed === null && record.registration.kind === 'associated')
        consumed = { id: record.consumption, binding: record.registration.binding, results: [] }
    } else if (consumed !== null)
      consumed = { ...consumed, results: resultsWith(consumed.results, fact) }
  }
  return { record, consumed, references: call.references }
}

export function callNamed(call: SessionCall, keys: SessionCallKeys): boolean {
  if (keys.consumptions.includes(call.record.consumption)) return true
  const producer = producerOf(call)
  if (producer === null) return false
  const named = digestOf(producer)
  return keys.producers.some(item => digestOf({ kind: item.kind, call: item.call }) === named)
}

export function callKeysOutside(snapshot: WorkSnapshot, keys: SessionCallKeys): SessionCallKeys {
  const held = (snapshot.callRegistrations ?? []).map(record =>
    callOf(snapshot, record.consumption),
  )
  const answers = (key: SessionCallKeys): boolean =>
    held.some(call => call !== null && callNamed(call, key))
  return {
    consumptions: keys.consumptions.filter(id => !answers({ consumptions: [id], producers: [] })),
    producers: keys.producers.filter(item => !answers({ consumptions: [], producers: [item] })),
  }
}

export type SessionCallBinding = Readonly<{ consumption: ConsumptionId; binding: CallBinding }>

export function bindingOf(call: SessionCall): SessionCallBinding | null {
  const { registration, consumption } = call.record
  return registration.kind === 'associated' ? { consumption, binding: registration.binding } : null
}

export function boundCall(
  snapshot: WorkSnapshot,
  producer: ProducerRef,
): SessionCallBinding | null {
  const named = digestOf({ kind: producer.kind, call: producer.call })
  const found = snapshot.consumptions.find(item => digestOf(item.binding.producer) === named)
  return found === undefined ? null : { consumption: found.id, binding: found.binding }
}
