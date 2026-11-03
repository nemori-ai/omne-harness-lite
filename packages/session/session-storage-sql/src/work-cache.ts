// The work cache (SPEC RT-04): the decoded `session.work` answer of each session, kept in the
// process and checked against the store on every read. The store stays the authority. Every read
// first reads the version of the session (`session.work-version`: the Session tail and the Agent
// publication count); a cached answer is used only when that version
// equals the version it was read at. Both counts only grow, and the snapshot row and the Agent
// index rows change only in the transaction that moves them, so an equal version means that no
// commit came between the two reads. Any other answer reads the whole snapshot again. The cache
// decides no access: each caller asks its access and resolves the tenant domain before it reads.
//
// A commit of this process does not make the next read whole (C-TOPOLOGY §2.9): the commit path
// folds its batch onto the held snapshot with the same pure `reduce` the participant ran, and a
// publication of the Agent records replaces only the index of the held snapshot. Neither decides
// that an answer is valid: what they register carries a version that the store answered, and every
// read still checks the version first.
import { randomUUID } from 'node:crypto'
import {
  reduce,
  type HistoryEntry,
  type SessionHistoryIndex,
  type SessionHistoryReads,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import type { DomainRef, JsonValue, SqlStorage } from '@omne-harness/sql-contract'
import { decodeValue, encodeValue } from './codec.ts'
import { PROTOCOL } from './worker/schema.ts'

/** The sessions the cache keeps by default; past it the least recently used session goes. */
export const WORK_CACHE_SESSIONS = 256
/** The stored snapshot text the cache keeps by default, summed over its sessions. */
export const WORK_CACHE_BYTES = 64 * 1024 * 1024

export const WORK_HANDLER = 'session.work'
export const WORK_VERSION_HANDLER = 'session.work-version'
const WORK_INDEX_HANDLER = 'session.work-index'
const WORK_READS_HANDLER = 'session.work-reads'
const HISTORY_HANDLER = 'session.history'

/** The bounds of one cache. `sessions: 0` or `bytes: 0` keeps nothing. */
export type WorkCacheBounds = Readonly<{ sessions?: number; bytes?: number }>

/** What a `session.work` answer depends on in the store. Decimal texts of counts that only grow. */
export type WorkVersion = Readonly<{ tail: string; published: string }>

type Entry = Readonly<{ version: WorkVersion; bytes: number; snapshot: WorkSnapshot }>

export type WorkCache = Readonly<{
  /** The entry of `key`, now the most recently used one. */
  get(key: string): Entry | undefined
  /** Keeps `entry` unless it is older than the entry it would replace; then applies the bounds. */
  set(key: string, entry: Entry): void
  delete(key: string): void
  /**
   * The whole reads in flight, by key and version: a read that finds one for the version it read
   * waits for it instead of reading the snapshot again (single-flight).
   */
  readonly flights: Map<string, Promise<WorkRead>>
  /**
   * The folds in flight, by key and the version they fold to: a read that finds the store at that
   * version waits for the fold and answers its entry instead of reading the snapshot whole.
   */
  readonly folds: Map<string, Promise<void>>
  readonly size: number
  readonly bytes: number
}>

/**
 * The key of one session: the transaction domain, the tenant text and the session. A `SessionId`
 * is unique only inside its tenant, so two tenants never share an entry.
 */
export function workKey(domain: string, tenant: string, session: string): string {
  return JSON.stringify([domain, tenant, session])
}

const count = (text: string): bigint => BigInt(text)

/** -1, 0 or 1 as `left` is older than, equal to or newer than `right`, by the tail first. */
function compare(left: WorkVersion, right: WorkVersion): number {
  const tail = count(left.tail) - count(right.tail)
  if (tail !== 0n) return tail < 0n ? -1 : 1
  const published = count(left.published) - count(right.published)
  return published === 0n ? 0 : published < 0n ? -1 : 1
}

function sameVersion(left: WorkVersion, right: WorkVersion): boolean {
  return left.tail === right.tail && left.published === right.published
}

/** Either count below the one it was read at: both only grow, so the store went back. */
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
  // A Map iterates in insertion order, so its first key is the least recently used one.
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
      // A slower read of an older version does not replace the answer of a newer one.
      if (held !== undefined && compare(entry.version, held.version) < 0) return
      drop(key)
      if (sessions === 0 || entry.bytes > budget) return
      entries.set(key, entry)
      used += entry.bytes
      for (const oldest of entries.keys()) {
        if (entries.size <= sessions && used <= budget) break
        drop(oldest)
      }
    },
    delete: drop,
    flights: new Map(),
    folds: new Map(),
    get size() {
      return entries.size
    },
    get bytes() {
      return used
    },
  }
}

const caches = new WeakMap<object, WorkCache>()

/**
 * The symbol under which a Cordis service proxy answers the object it wraps (`symbols.original` of
 * `@deepseek-ai/cordis`, a registered symbol). A plain object answers undefined.
 */
const CORDIS_ORIGINAL = Symbol.for('cordis.original')
/** How many proxy layers `storeOf` looks through. */
const PROXY_DEPTH = 8

/**
 * The identity of the database behind `storage`. Cordis hands each plugin context its own proxy
 * of one service object, so the proxies are unwrapped to that object first. Then the object's own
 * `read` function is the identity: a provider makes one `read` closure over its own database, and
 * a wrapper that copies the methods of a storage (an assembly that registers a port as a service)
 * copies that closure, so it reads the same database. A `read` that is not an own function (a
 * class method, shared by every instance) is no identity, and the object itself is used. Two
 * storages over different databases therefore never share an identity; two objects over one
 * database share it only when they share the provider's `read`.
 */
export function storeOf(storage: SqlStorage): object {
  let target: object = storage
  for (let depth = 0; depth < PROXY_DEPTH; depth += 1) {
    const inner: unknown = (target as { readonly [key: symbol]: unknown })[CORDIS_ORIGINAL]
    if (typeof inner !== 'object' || inner === null || inner === target) break
    target = inner
  }
  const read: unknown = Object.getOwnPropertyDescriptor(target, 'read')?.value
  return typeof read === 'function' ? read : target
}

/**
 * The one cache of a database: the ports, the delegated views, the binding source and the Journal
 * provider that read it through any storage object of the same identity (`storeOf`) share it. The
 * bounds of the first caller that reaches the database hold for every later one.
 */
export function workCacheOf(storage: SqlStorage, bounds?: WorkCacheBounds): WorkCache {
  const store = storeOf(storage)
  let cache = caches.get(store)
  if (cache === undefined) {
    cache = createWorkCache(bounds)
    caches.set(store, cache)
  }
  return cache
}

/** The answer of a work read, before a caller maps it to its own failures. */
export type WorkRead =
  | Readonly<{ kind: 'state'; snapshot: WorkSnapshot }>
  /** No session of this tenant has the name. */
  | Readonly<{ kind: 'absent' }>
  /** The snapshot row does not cover the tail yet. */
  | Readonly<{ kind: 'behind' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export type WorkReach = Readonly<{
  storage: SqlStorage
  domain: DomainRef
  /** The tenant text the domain was resolved for. */
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
    return typeof output === 'object' && output !== null && !Array.isArray(output)
      ? { output: output as Record }
      : { unavailable: `read ${handler}: not a record` }
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

/**
 * The `session.work` answer of one session, through the cache of the storage. The answered snapshot
 * is deeply frozen: every reader of a cached answer gets the same object, so a reader that writes
 * to it throws instead of changing what the next reader sees.
 */
export async function readCachedWork(reach: WorkReach): Promise<WorkRead> {
  const cache = workCacheOf(reach.storage, reach.bounds)
  const key = workKey(reach.domain.transactionDomain, reach.tenant, reach.session)
  // Taken before the version read: its version can then be no newer than the version read, so a
  // version below it means the store went back, never a commit that came in between.
  const held = cache.get(key)
  const versionRead = await readOne(reach, WORK_VERSION_HANDLER)
  let version: WorkVersion | null = null
  if ('output' in versionRead) {
    const current = versionRead.output
    if (current['kind'] === 'absent') {
      cache.delete(key)
      return { kind: 'absent' }
    }
    const tail = textOf(current['tail'])
    const published = textOf(current['published'])
    // The snapshot row is replaced only in the transaction that moves the tail, and an entry is
    // kept only from a whole read that found it covering its tail: an equal tail is covered still.
    if (current['kind'] === 'version' && tail !== null && published !== null) {
      version = { tail, published }
      if (held !== undefined) {
        if (sameVersion(version, held.version)) return { kind: 'state', snapshot: held.snapshot }
        if (movedBack(version, held.version)) {
          cache.delete(key)
          return {
            kind: 'unavailable',
            diagnostic: `the session log moved backwards from tail ${held.version.tail} published ${held.version.published} to tail ${tail} published ${published}`,
          }
        }
      }
    }
  }
  // No entry, another version, or a version read that failed or did not parse: read it whole.
  // Concurrent readers of one key that read one version share that whole read; a reader whose
  // version read failed reads alone.
  if (version === null) return readWhole(reach, cache, key)
  const flight = `${key}|${version.tail}|${version.published}`
  const folded = await afterFold(cache, key, flight, version)
  if (folded !== undefined) return { kind: 'state', snapshot: folded }
  const running = cache.flights.get(flight)
  if (running !== undefined) return running
  const started = readWhole(reach, cache, key).finally(() => cache.flights.delete(flight))
  cache.flights.set(flight, started)
  return started
}

/**
 * When a commit or publication of this process is folding to the version read, the snapshot it
 * registered at that version, once it ends; otherwise undefined.
 */
async function afterFold(
  cache: WorkCache,
  key: string,
  flight: string,
  version: WorkVersion,
): Promise<WorkSnapshot | undefined> {
  const folding = cache.folds.get(flight)
  if (folding === undefined) return undefined
  await folding
  const done = cache.get(key)
  return done !== undefined && sameVersion(done.version, version) ? done.snapshot : undefined
}

/** One whole read: the answer replaces the entry of `key`, and a failure drops it. */
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
  if (tail !== null && published !== null && typeof bytes === 'number')
    cache.set(key, { version: { tail, published }, bytes, snapshot })
  else cache.delete(key)
  return { kind: 'state', snapshot }
}

/**
 * The cached `session.work` read for a caller that already holds the domain of the tenant and
 * decided its own access (the Journal provider, the session binding source). It answers as
 * `decodeSessionWork` does, plus `unavailable`.
 */
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

// ---------------------------------------------------------------------------------------------
// Folding the commits and publications of this process (C-TOPOLOGY §2.9)

/**
 * What a published Session batch tells the cache: the version and stored text length of the new
 * snapshot, the positions of the batch, and the input range and focus of the history read the
 * participant reduced it on (`basis`). `indexed` is false for a batch reduced on the stored snapshot
 * alone (no index, no reads); an indexed batch without `basis` had one over the bound of the reply,
 * and is not folded.
 */
export type WorkFold = Readonly<{
  tail: string
  published: string
  bytes: number
  first: string
  last: string
  indexed: boolean
  basis?: JsonValue
}>

/** How the folds and index replacements of this process ended, for measurement. */
export type WorkFoldCounts = {
  /** A commit folded and registered. */
  folded: number
  /** A publication replaced the index of a held snapshot. */
  indexed: number
  /** No held snapshot at the version before, a basis over the bound, or a read of this version in flight. */
  skipped: number
  /** `reduce` quarantined the batch on the held snapshot. */
  quarantined: number
  /** The store moved on, or a read the fold needs failed or answered something else. */
  stale: number
  /** Of `folded` and `indexed`: registered at a publication count that moved on meanwhile. */
  republished: number
}

const counts: WorkFoldCounts = {
  folded: 0,
  indexed: 0,
  skipped: 0,
  quarantined: 0,
  stale: 0,
  republished: 0,
}

/** A copy of the counts of this process. */
export function workFoldCounts(): WorkFoldCounts {
  return { ...counts }
}

/** The page size of the batch read of a fold; a page holds at least one entry whatever its size. */
const FOLD_PAGE_BYTES = 4 * 1024 * 1024

/** A held snapshot without its index: what the stored snapshot row holds. */
function unindexed(snapshot: WorkSnapshot): WorkSnapshot {
  const { historyIndex: _index, ...rest } = snapshot
  return rest
}

/**
 * The fields of a snapshot that its history index reads (`workIndexOf`), for `session.work-index`:
 * tenant, session, revision, pending inputs, and the execution and read-through of the current Run
 * and of the earlier ones.
 */
function indexInput(snapshot: WorkSnapshot): JsonValue {
  const reference = (execution: Readonly<{ execution: string; readThrough: string }>) => ({
    execution: execution.execution,
    readThrough: execution.readThrough,
  })
  const { run } = snapshot
  return encodeValue({
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
  })
}

type Indexed = Readonly<{ version: WorkVersion; snapshot: WorkSnapshot }>

/**
 * The snapshot at the tail of `version` with the index the store answers there, and the version it
 * answered: the publication count may have moved past the one asked, since the snapshot row moves
 * only with the tail (P-4). Null when the tail moved, or a read failed.
 */
async function withIndex(
  reach: WorkReach,
  version: WorkVersion,
  snapshot: WorkSnapshot,
): Promise<Indexed | null> {
  const read = await readOne(reach, WORK_INDEX_HANDLER, {
    tail: version.tail,
    published: version.published,
    snapshot: indexInput(snapshot),
  })
  if (!('output' in read)) return null
  const out = read.output
  // Over the row bound the whole read answers without an index too, at the version asked.
  if (out['kind'] === 'too-many') return { version, snapshot }
  const published = textOf(out['published'])
  if (out['kind'] !== 'index' || published === null) return null
  if (published !== version.published) counts.republished += 1
  return {
    version: { tail: version.tail, published },
    snapshot: {
      ...snapshot,
      historyIndex: decodeValue(out['index'] as JsonValue) as SessionHistoryIndex,
    },
  }
}

/** The entries of the batch at positions `first` to `last`, all of revision `tail`; null otherwise. */
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
    const page = decodeValue(read.output['entries'] as JsonValue) as HistoryEntry[]
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

/**
 * The history index and reads the participant reduced the batch on, reproduced by
 * `session.work-reads` at the position before the batch and the same publication count (H2).
 */
async function decisionBasis(
  reach: WorkReach,
  held: WorkSnapshot,
  fold: WorkFold,
): Promise<Readonly<{ index: SessionHistoryIndex; reads: SessionHistoryReads }> | null> {
  const decided = fold.basis as Readonly<{ scope: JsonValue; focus: JsonValue }>
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

/** The snapshot `fold` makes of `held`, at the fold's version; null when it cannot be proved. */
async function folded(
  reach: WorkReach,
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
  const reduced = reduce(previous, { revision: fold.tail, entries } as never, reads)
  if (reduced.kind === 'quarantined') {
    counts.quarantined += 1
    return null
  }
  const version = { tail: fold.tail, published: fold.published }
  const indexed = await withIndex(reach, version, unindexed(reduced.snapshot))
  if (indexed === null) counts.stale += 1
  return indexed
}

/**
 * How the publication count of a fold relates to the held one: `same` for a commit of the port, and
 * `next` for a joint commit of the Journal provider, whose `execution-record` participant runs
 * before the `session` participant in the same transaction and adds one to the count, so the count
 * the Session participant read and reports is the held one plus one.
 */
export type FoldPublished = 'same' | 'next'

/** True when `before` is the version just below the fold: one tail lower, the count as `published` says. */
const follows = (before: WorkVersion, fold: WorkFold, published: FoldPublished): boolean =>
  count(before.tail) + 1n === count(fold.tail) &&
  count(before.published) + (published === 'next' ? 1n : 0n) === count(fold.published)

/**
 * Folds one committed batch of this process into the cache (C-TOPOLOGY §2.9). The commit path
 * calls it with the work of a fresh committed reply only, never a recall. It folds only onto a held
 * snapshot one tail below with the same publication count; anything else, a quarantine, or a tail
 * that moved on registers nothing, and the next read reads whole as before. A publication count
 * that moved on meanwhile is registered with the index read at it (P-4). It never throws.
 */
export async function foldCommitted(
  reach: WorkReach,
  fold: WorkFold,
  published: FoldPublished = 'same',
): Promise<void> {
  try {
    const cache = workCacheOf(reach.storage, reach.bounds)
    const key = workKey(reach.domain.transactionDomain, reach.tenant, reach.session)
    const held = cache.get(key)
    const flight = `${key}|${fold.tail}|${fold.published}`
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
    const running = folded(reach, held.snapshot, fold).then(indexed => {
      if (indexed === null) return
      cache.set(key, {
        version: indexed.version,
        bytes: fold.bytes,
        snapshot: frozen(indexed.snapshot),
      })
      counts.folded += 1
    })
    cache.folds.set(flight, running)
    try {
      await running
    } finally {
      cache.folds.delete(flight)
    }
  } catch {
    counts.stale += 1
  }
}

/**
 * Replaces the index of the held snapshot after a publication of the Agent records of this process
 * moved the publication count to `published` (C-TOPOLOGY §2.9.2): the snapshot row moves only with
 * the tail, so the held snapshot stays; its index is read again at the held tail and the new count.
 * Nothing is registered when no snapshot is held, or the store is at another tail; a count that
 * moved past `published` meanwhile is registered with the index read at it. It never throws.
 */
export async function refreshWorkIndex(reach: WorkReach, published: string): Promise<void> {
  try {
    const cache = workCacheOf(reach.storage, reach.bounds)
    const key = workKey(reach.domain.transactionDomain, reach.tenant, reach.session)
    const held = cache.get(key)
    if (held === undefined || count(published) <= count(held.version.published)) {
      counts.skipped += 1
      return
    }
    const version = { tail: held.version.tail, published }
    const flight = `${key}|${version.tail}|${version.published}`
    if (cache.flights.has(flight) || cache.folds.has(flight)) {
      counts.skipped += 1
      return
    }
    const running = withIndex(reach, version, unindexed(held.snapshot)).then(indexed => {
      if (indexed === null) {
        counts.stale += 1
        return
      }
      cache.set(key, {
        version: indexed.version,
        bytes: held.bytes,
        snapshot: frozen(indexed.snapshot),
      })
      counts.indexed += 1
    })
    cache.folds.set(flight, running)
    try {
      await running
    } finally {
      cache.folds.delete(flight)
    }
  } catch {
    counts.stale += 1
  }
}

/**
 * For a writer that already holds the domain of the tenant (the Journal provider), after its
 * publication committed with the count `published`. With the work of a Session participation in
 * the same fresh commit, the batch is folded (`foldCommitted`, the count one past the held one);
 * without it, the index of the held snapshot is replaced (`refreshWorkIndex`).
 */
export function registerSessionWorkIndex(
  storage: SqlStorage,
  domain: DomainRef,
  tenantText: string,
  session: string,
  published: string,
  work?: WorkFold,
): Promise<void> {
  const reach = { storage, domain, tenant: tenantText, session }
  return work === undefined
    ? refreshWorkIndex(reach, published)
    : foldCommitted(reach, work, 'next')
}
