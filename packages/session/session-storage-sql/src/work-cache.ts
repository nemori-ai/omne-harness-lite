// The work cache (SPEC RT-04): the decoded `session.work` answer of each session, kept in the
// process and checked against the store on every read. The store stays the authority. Every read
// first reads the version of the session (`session.work-version`: the Session tail and the Agent
// publication count); a cached answer is used only when that version
// equals the version it was read at. Both counts only grow, and the snapshot row and the Agent
// index rows change only in the transaction that moves them, so an equal version means that no
// commit came between the two reads. Any other answer reads the whole snapshot again. The cache
// decides no access: each caller asks its access and resolves the tenant domain before it reads.
import { randomUUID } from 'node:crypto'
import type { WorkSnapshot } from '@omne-harness/session-contract'
import type { DomainRef, JsonValue, SqlStorage } from '@omne-harness/sql-contract'
import { decodeValue } from './codec.ts'
import { PROTOCOL } from './worker/schema.ts'

/** The sessions the cache keeps by default; past it the least recently used session goes. */
export const WORK_CACHE_SESSIONS = 256
/** The stored snapshot text the cache keeps by default, summed over its sessions. */
export const WORK_CACHE_BYTES = 64 * 1024 * 1024

export const WORK_HANDLER = 'session.work'
export const WORK_VERSION_HANDLER = 'session.work-version'

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
    get size() {
      return entries.size
    },
    get bytes() {
      return used
    },
  }
}

const caches = new WeakMap<SqlStorage, WorkCache>()

/**
 * The one cache of a storage object: the ports, the delegated views, the binding source and the
 * Journal provider that read through the same storage share it. The bounds of the first caller
 * that reaches the storage hold for every later one.
 */
export function workCacheOf(storage: SqlStorage, bounds?: WorkCacheBounds): WorkCache {
  let cache = caches.get(storage)
  if (cache === undefined) {
    cache = createWorkCache(bounds)
    caches.set(storage, cache)
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
): Promise<Readonly<{ output: Record }> | Readonly<{ unavailable: string }>> {
  try {
    const result = await reach.storage.read({
      domain: reach.domain,
      handler,
      protocol: PROTOCOL,
      requestKey: randomUUID(),
      input: { tenant: reach.tenant, session: reach.session },
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
      const version = { tail, published }
      if (held !== undefined) {
        const order = compare(version, held.version)
        if (order === 0) return { kind: 'state', snapshot: held.snapshot }
        if (order < 0) {
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
