import { randomUUID } from 'node:crypto'
import {
  batchCallKeys,
  reduce,
  type HistoryEntry,
  type SessionCall,
  type SessionHistoryIndex,
  type SessionHistoryReads,
  type SettledCallLookup,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import { type DomainRef, type JsonValue, type SqlStorage } from '@omne-harness/sql-contract'
import { decodeValue, encodeValue } from './codec.ts'
import { readEntryTexts, StoredEntryMalformed } from './entry-codec.ts'
import type { HistoryBasis, WorkIndexInput } from './worker/history-index.ts'
import { PROTOCOL } from './worker/schema.ts'

export const WORK_CACHE_SESSIONS = 256
export const WORK_CACHE_BYTES = 64 * 1024 * 1024

export const WORK_HANDLER = 'session.work'
export const WORK_VERSION_HANDLER = 'session.work-version'
const WORK_INDEX_HANDLER = 'session.work-index'
const WORK_READS_HANDLER = 'session.work-reads'
const WORK_INDEX_READS = 64
const INDEX_UNFINISHED = 'the index of the session rows is still being read'
const HISTORY_HANDLER = 'session.history'
const CALLS_LEFT_HANDLER = 'session.calls-left'

export type WorkCacheBounds = Readonly<{ sessions?: number; bytes?: number }>

export type WorkVersion = Readonly<{ tail: string; published: string }>

type Entry = Readonly<{ version: WorkVersion; bytes: number; snapshot: WorkSnapshot }>

export type WorkCache = Readonly<{
  get(key: string): Entry | undefined
  set(key: string, entry: Entry): boolean
  delete(key: string): void
  readonly flights: Map<string, Promise<WorkRead>>
  readonly folds: Map<string, Promise<void>>
  readonly counts: WorkFoldCounts
  readonly size: number
  readonly bytes: number
}>

export function workKey(domain: string, tenant: string, session: string): string {
  return JSON.stringify([domain, tenant, session])
}

function flightKey(key: string, version: Readonly<{ tail: string; published: string }>): string {
  return `${key}|${version.tail}|${version.published}`
}

const count = (text: string): bigint => BigInt(text)

function compare(left: WorkVersion, right: WorkVersion): number {
  const tail = count(left.tail) - count(right.tail)
  if (tail !== 0n) return tail < 0n ? -1 : 1
  const published = count(left.published) - count(right.published)
  return published === 0n ? 0 : published < 0n ? -1 : 1
}

function sameVersion(left: WorkVersion, right: WorkVersion): boolean {
  return left.tail === right.tail && left.published === right.published
}

function movedBack(now: WorkVersion, before: WorkVersion): boolean {
  return count(now.tail) < count(before.tail) || count(now.published) < count(before.published)
}

function bound(value: number | undefined, fallback: number, name: string): number {
  const given = value ?? fallback
  if (!Number.isSafeInteger(given) || given < 0)
    throw new RangeError(`workCache.${name} must be a whole number >= 0, got ${String(given)}`)
  return given
}

export function createWorkCache(bounds: WorkCacheBounds = {}): WorkCache {
  const sessions = bound(bounds.sessions, WORK_CACHE_SESSIONS, 'sessions')
  const budget = bound(bounds.bytes, WORK_CACHE_BYTES, 'bytes')
  const entries = new Map<string, Entry>()
  let used = 0
  const drop = (key: string): void => {
    const entry = entries.get(key)
    if (entry === undefined) return
    entries.delete(key)
    used -= entry.bytes
  }
  return {
    get(key) {
      const entry = entries.get(key)
      if (entry === undefined) return undefined
      entries.delete(key)
      entries.set(key, entry)
      return entry
    },
    set(key, entry) {
      const held = entries.get(key)
      if (held !== undefined && compare(entry.version, held.version) < 0) return false
      drop(key)
      if (sessions === 0 || entry.bytes > budget) return false
      entries.set(key, entry)
      used += entry.bytes
      for (const oldest of entries.keys()) {
        if (entries.size <= sessions && used <= budget) break
        drop(oldest)
      }
      return true
    },
    delete: drop,
    flights: new Map(),
    folds: new Map(),
    counts: { folded: 0, indexed: 0, skipped: 0, quarantined: 0, stale: 0, republished: 0 },
    get size() {
      return entries.size
    },
    get bytes() {
      return used
    },
  }
}

const caches = new WeakMap<object, WorkCache>()

export function workCacheOf(storage: SqlStorage, bounds?: WorkCacheBounds): WorkCache {
  const store = storage.database
  let cache = caches.get(store)
  if (cache === undefined) {
    cache = createWorkCache(bounds)
    caches.set(store, cache)
  }
  return cache
}

export type WorkRead =
  | Readonly<{ kind: 'state'; snapshot: WorkSnapshot }>
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'behind' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export type WorkReach = Readonly<{
  storage: SqlStorage
  domain: DomainRef
  tenant: string
  session: string
  bounds?: WorkCacheBounds
}>

type Record = Readonly<{ [key: string]: JsonValue }>

async function readOne(
  reach: WorkReach,
  handler: string,
  input: Readonly<{ [key: string]: JsonValue }> = {},
): Promise<Readonly<{ output: Record }> | Readonly<{ unavailable: string }>> {
  try {
    const result = await reach.storage.read({
      domain: reach.domain,
      handler,
      protocol: PROTOCOL,
      requestKey: randomUUID(),
      input: { ...input, tenant: reach.tenant, session: reach.session },
    })
    if (result.kind !== 'read')
      return {
        unavailable: `read ${handler}: ${result.kind === 'cancelled' ? 'cancelled' : result.reason}`,
      }
    const output = result.output
    if (typeof output !== 'object' || output === null || Array.isArray(output))
      return { unavailable: `read ${handler}: not a record` }
    const record = output as Record
    return record['kind'] === 'malformed'
      ? { unavailable: `read ${handler}: ${String(record['diagnostic'])}` }
      : { output: record }
  } catch (error) {
    return {
      unavailable: `read ${handler} threw: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

const textOf = (value: JsonValue | undefined): string | null =>
  typeof value === 'string' ? value : null

function frozen<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const member of Object.values(value)) frozen(member)
  return value
}

export async function readCachedWork(reach: WorkReach): Promise<WorkRead> {
  const cache = workCacheOf(reach.storage, reach.bounds)
  const key = workKey(reach.domain.transactionDomain, reach.tenant, reach.session)
  // Taken before the version read, so its version is no newer than the one read: a lower version then means the store went back, never a commit in between.
  const held = cache.get(key)
  const version = await readVersionOf(reach)
  if (version === 'absent') {
    cache.delete(key)
    return { kind: 'absent' }
  }
  if (version !== null && held !== undefined) {
    if (sameVersion(version, held.version)) return { kind: 'state', snapshot: held.snapshot }
    if (movedBack(version, held.version)) {
      cache.delete(key)
      return {
        kind: 'unavailable',
        diagnostic: `the session log moved backwards from tail ${held.version.tail} published ${held.version.published} to tail ${version.tail} published ${version.published}`,
      }
    }
  }
  if (version === null) return readWhole(reach, cache, key)
  const flight = flightKey(key, version)
  const folded = await afterFold(cache, key, flight, version)
  if (folded !== undefined) return { kind: 'state', snapshot: folded }
  const running = cache.flights.get(flight)
  if (running !== undefined) return running
  const started = readWhole(reach, cache, key).finally(() => cache.flights.delete(flight))
  cache.flights.set(flight, started)
  return started
}

async function readVersionOf(reach: WorkReach): Promise<WorkVersion | 'absent' | null> {
  const read = await readOne(reach, WORK_VERSION_HANDLER)
  if (!('output' in read)) return null
  const current = read.output
  if (current['kind'] === 'absent') return 'absent'
  const tail = textOf(current['tail'])
  const published = textOf(current['published'])
  return current['kind'] === 'version' && tail !== null && published !== null
    ? { tail, published }
    : null
}

async function afterFold(
  cache: WorkCache,
  key: string,
  flight: string,
  version: WorkVersion,
): Promise<WorkSnapshot | undefined> {
  const folding = cache.folds.get(flight)
  if (folding === undefined) return undefined
  await folding.catch(() => undefined)
  const done = cache.get(key)
  return done !== undefined && sameVersion(done.version, version) ? done.snapshot : undefined
}

async function readWhole(reach: WorkReach, cache: WorkCache, key: string): Promise<WorkRead> {
  const wholeRead = await readOne(reach, WORK_HANDLER)
  if (!('output' in wholeRead)) {
    cache.delete(key)
    return { kind: 'unavailable', diagnostic: wholeRead.unavailable }
  }
  const whole = wholeRead.output
  if (whole['kind'] !== 'state') {
    cache.delete(key)
    if (whole['kind'] === 'absent') return { kind: 'absent' }
    if (whole['kind'] === 'behind') return { kind: 'behind' }
    return { kind: 'unavailable', diagnostic: `read ${WORK_HANDLER}: an unknown answer` }
  }
  let snapshot: WorkSnapshot
  try {
    snapshot = frozen(decodeValue(whole['snapshot'] as JsonValue) as WorkSnapshot)
  } catch (error) {
    cache.delete(key)
    return {
      kind: 'unavailable',
      diagnostic: `read ${WORK_HANDLER}: the snapshot does not decode: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
  const tail = textOf(whole['tail'])
  const published = textOf(whole['published'])
  const bytes = whole['bytes']
  if (tail === null || published === null || typeof bytes !== 'number') {
    cache.delete(key)
    return { kind: 'state', snapshot }
  }
  if (snapshot.historyIndex !== undefined) {
    cache.set(key, { version: { tail, published }, bytes, snapshot })
    return { kind: 'state', snapshot }
  }
  const indexed = await withIndex(reach, { tail, published }, snapshot)
  if (indexed === null) {
    cache.delete(key)
    return { kind: 'unavailable', diagnostic: `read ${WORK_HANDLER}: ${INDEX_UNFINISHED}` }
  }
  const complete = frozen(indexed.snapshot)
  cache.set(key, { version: indexed.version, bytes, snapshot: complete })
  return { kind: 'state', snapshot: complete }
}

export function readCachedSessionWork(
  storage: SqlStorage,
  domain: DomainRef,
  tenantText: string,
  session: string,
  options: Readonly<{ workCache?: WorkCacheBounds }> = {},
): Promise<WorkRead> {
  return readCachedWork({
    storage,
    domain,
    tenant: tenantText,
    session,
    ...(options.workCache === undefined ? {} : { bounds: options.workCache }),
  })
}

export type WorkFold = Readonly<{
  tail: string
  published: string
  bytes: number
  first: string
  last: string
  indexed: boolean
  basis?: JsonValue
}>

export type WorkFoldCounts = {
  folded: number
  indexed: number
  skipped: number
  quarantined: number
  stale: number
  republished: number
}

export function workFoldCounts(storage: SqlStorage): WorkFoldCounts {
  const cache = caches.get(storage.database)
  return cache === undefined
    ? { folded: 0, indexed: 0, skipped: 0, quarantined: 0, stale: 0, republished: 0 }
    : { ...cache.counts }
}

const FOLD_PAGE_BYTES = 4 * 1024 * 1024

function unindexed(snapshot: WorkSnapshot): WorkSnapshot {
  const { historyIndex: _index, ...rest } = snapshot
  return rest
}

function indexInput(snapshot: WorkSnapshot): JsonValue {
  const reference = (execution: Readonly<{ execution: string; readThrough: string }>) => ({
    execution: execution.execution,
    readThrough: execution.readThrough,
  })
  const { run } = snapshot
  const input: WorkIndexInput = {
    tenant: snapshot.tenant,
    session: snapshot.session,
    revision: snapshot.revision,
    pending: snapshot.pending,
    run:
      run.kind === 'active'
        ? { kind: run.kind, run: run.run, execution: reference(run.execution) }
        : { kind: run.kind },
    executions: (snapshot.executions ?? []).map(item => ({
      run: item.run,
      execution: reference(item.execution),
    })),
  }
  return encodeValue(input)
}

type Indexed = Readonly<{ version: WorkVersion; snapshot: WorkSnapshot }>

async function withIndex(
  reach: WorkReach,
  version: WorkVersion,
  snapshot: WorkSnapshot,
): Promise<Indexed | null> {
  const input = { tail: version.tail, published: version.published, snapshot: indexInput(snapshot) }
  for (let reads = 0; reads < WORK_INDEX_READS; reads += 1) {
    const read = await readOne(reach, WORK_INDEX_HANDLER, input)
    if (!('output' in read)) return null
    const out = read.output
    const published = textOf(out['published'])
    if (published === null) return null
    if (out['kind'] === 'too-many') continue
    if (out['kind'] !== 'index') return null
    return {
      version: { tail: version.tail, published },
      snapshot: {
        ...snapshot,
        historyIndex: decodeValue(out['index'] as JsonValue) as SessionHistoryIndex,
      },
    }
  }
  return null
}

async function batchEntries(reach: WorkReach, fold: WorkFold): Promise<HistoryEntry[] | null> {
  const first = BigInt(fold.first)
  const last = BigInt(fold.last)
  const entries: HistoryEntry[] = []
  let input: Readonly<{ [key: string]: JsonValue }> = {
    mode: 'begin',
    kinds: [],
    direction: 'forward',
    from: first > 1n ? String(first - 1n) : null,
    edge: null,
    upper: null,
    pageBytes: FOLD_PAGE_BYTES,
  }
  for (;;) {
    const read = await readOne(reach, HISTORY_HANDLER, input)
    if (!('output' in read) || read.output['kind'] !== 'page') return null
    let page: HistoryEntry[]
    try {
      page = readEntryTexts(read.output['entries'])
    } catch (error) {
      if (!(error instanceof StoredEntryMalformed)) throw error
      return null
    }
    for (const entry of page) {
      if (BigInt(entry.id) > last) break
      entries.push(entry)
    }
    const next = read.output['next'] as Readonly<{ edge: string; upper: string }> | null
    if (entries.length > Number(last - first) || next === null) break
    input = { ...input, mode: 'next', edge: next.edge, upper: next.upper }
  }
  const whole =
    entries.length === Number(last - first) + 1 &&
    entries.every(
      (entry, at) => entry.id === String(first + BigInt(at)) && entry.revision === fold.tail,
    )
  return whole ? entries : null
}

async function decisionBasis(
  reach: WorkReach,
  held: WorkSnapshot,
  fold: WorkFold,
): Promise<Readonly<{ index: SessionHistoryIndex; reads: SessionHistoryReads }> | null> {
  const decided = fold.basis as { readonly [member in keyof HistoryBasis]: JsonValue }
  const read = await readOne(reach, WORK_READS_HANDLER, {
    revision: held.revision,
    published: fold.published,
    upto: String(BigInt(fold.first) - 1n),
    inputs: decided.scope,
    focus: decided.focus,
    snapshot: indexInput(held),
  })
  if (!('output' in read) || read.output['kind'] !== 'basis') return null
  return decodeValue(read.output['basis'] as JsonValue) as Readonly<{
    index: SessionHistoryIndex
    reads: SessionHistoryReads
  }>
}

// The calls the batch names that the held snapshot does not hold, as the store had them before the batch.
async function callsLeftFor(
  reach: WorkReach,
  held: WorkSnapshot,
  fold: WorkFold,
  entries: readonly HistoryEntry[],
): Promise<SettledCallLookup | null> {
  const keys = batchCallKeys(held, { revision: fold.tail, entries } as never)
  // A batch that does not decode names nothing here: the reduction says what is wrong with it.
  if (keys === null || keys.consumptions.length + keys.producers.length === 0) return () => []
  const read = await readOne(reach, CALLS_LEFT_HANDLER, {
    keys: encodeValue(keys),
    through: String(BigInt(fold.tail) - 1n),
  })
  if (!('output' in read) || read.output['kind'] !== 'calls') return null
  const calls = decodeValue(read.output['calls'] as JsonValue) as readonly SessionCall[]
  return () => calls
}

async function folded(
  reach: WorkReach,
  counts: WorkFoldCounts,
  held: WorkSnapshot,
  fold: WorkFold,
): Promise<Indexed | null> {
  const entries = await batchEntries(reach, fold)
  if (entries === null) {
    counts.stale += 1
    return null
  }
  let previous = unindexed(held)
  let reads: SessionHistoryReads | undefined
  if (fold.indexed) {
    const basis = await decisionBasis(reach, held, fold)
    if (basis === null) {
      counts.stale += 1
      return null
    }
    previous = { ...previous, historyIndex: basis.index }
    reads = basis.reads
  }
  const left = await callsLeftFor(reach, held, fold, entries)
  if (left === null) {
    counts.stale += 1
    return null
  }
  const reduced = reduce(previous, { revision: fold.tail, entries } as never, reads, left)
  if (reduced.kind === 'quarantined') {
    counts.quarantined += 1
    return null
  }
  const version = { tail: fold.tail, published: fold.published }
  const indexed = await withIndex(reach, version, unindexed(reduced.snapshot))
  if (indexed === null) counts.stale += 1
  return indexed
}

export type FoldPublished = 'same' | 'next'

function settled(counts: WorkFoldCounts): void {
  counts.stale += 1
}

type Registration = Readonly<{ indexed: Indexed; bytes: number; asked: string }>

async function runFlight(
  cache: WorkCache,
  key: string,
  flight: string,
  counter: 'folded' | 'indexed',
  produce: () => Promise<Registration | null>,
): Promise<void> {
  const { counts } = cache
  const running = produce()
    .then(made => {
      if (made === null) return
      const kept = cache.set(key, {
        version: made.indexed.version,
        bytes: made.bytes,
        snapshot: frozen(made.indexed.snapshot),
      })
      if (!kept) return
      counts[counter] += 1
      if (made.indexed.version.published !== made.asked) counts.republished += 1
    })
    .catch(() => settled(counts))
  cache.folds.set(flight, running)
  try {
    await running
  } finally {
    cache.folds.delete(flight)
  }
}

const follows = (before: WorkVersion, fold: WorkFold, published: FoldPublished): boolean =>
  count(before.tail) + 1n === count(fold.tail) &&
  count(before.published) + (published === 'next' ? 1n : 0n) === count(fold.published)

export async function foldCommitted(
  reach: WorkReach,
  fold: WorkFold,
  published: FoldPublished = 'same',
): Promise<void> {
  let cache: WorkCache | undefined
  try {
    cache = workCacheOf(reach.storage, reach.bounds)
    const { counts } = cache
    const key = workKey(reach.domain.transactionDomain, reach.tenant, reach.session)
    const held = cache.get(key)
    const flight = flightKey(key, fold)
    if (
      held === undefined ||
      !follows(held.version, fold, published) ||
      (fold.indexed && fold.basis === undefined) ||
      cache.flights.has(flight) ||
      cache.folds.has(flight)
    ) {
      counts.skipped += 1
      return
    }
    await runFlight(cache, key, flight, 'folded', async () => {
      const indexed = await folded(reach, counts, held.snapshot, fold)
      return indexed === null ? null : { indexed, bytes: fold.bytes, asked: fold.published }
    })
  } catch {
    if (cache !== undefined) cache.counts.stale += 1
  }
}

export async function refreshWorkIndex(reach: WorkReach, published: string): Promise<void> {
  let cache: WorkCache | undefined
  try {
    cache = workCacheOf(reach.storage, reach.bounds)
    const { counts } = cache
    const key = workKey(reach.domain.transactionDomain, reach.tenant, reach.session)
    const held = cache.get(key)
    if (held === undefined || count(published) <= count(held.version.published)) {
      counts.skipped += 1
      return
    }
    const version = { tail: held.version.tail, published }
    const flight = flightKey(key, version)
    if (cache.flights.has(flight) || cache.folds.has(flight)) {
      counts.skipped += 1
      return
    }
    await runFlight(cache, key, flight, 'indexed', async () => {
      const indexed = await withIndex(reach, version, unindexed(held.snapshot))
      if (indexed !== null) return { indexed, bytes: held.bytes, asked: published }
      counts.stale += 1
      return null
    })
  } catch {
    if (cache !== undefined) cache.counts.stale += 1
  }
}
