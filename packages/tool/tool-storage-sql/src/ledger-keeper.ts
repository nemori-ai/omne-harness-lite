// The snapshot keeper of the SQL ledger store (model `SnapshotCache`). One keeper serves every
// ledger store over the same `SqlStorage`: every commit of this process goes through it, so the
// snapshot it keeps of a domain is the content of the store, and a read answers from it without
// a round trip. A commit of another process is seen at most `SNAPSHOT_MAX_AGE_MS` later, or at
// the next refused commit. The answer "absent" is never given from a snapshot alone.
//
// Three parts, each with one reason to change:
//   1. The decisions: total functions from a snapshot and a question to a plan. No I/O. Each
//      result is one action of the model.
//   2. `Crossings`: whether a commit of a domain crossed a read of it.
//   3. `keeping`: the store port over the raw store. It does what the plans say.
import {
  recordKey,
  type LedgerCommit,
  type LedgerCommitInput,
  type LedgerDomain,
  type LedgerRead,
  type LedgerRecord,
  type LedgerRecordRead,
  type LedgerWrite,
  type ToolLedgerStore,
} from '@omne-harness/tool'

/** How long a snapshot answers reads before the store confirms its revision again. */
export const SNAPSHOT_MAX_AGE_MS = 1_000

/** The domains whose snapshot one keeper holds; the least recently used one leaves first. */
const KEPT_DOMAINS = 512

type Complete = Extract<LedgerRead, { kind: 'complete' }>
type Revision = Complete['revision']

/** The records of one domain at one revision, in key order, and when the store confirmed them. */
export type Snapshot = Readonly<{
  revision: Revision
  records: ReadonlyMap<string, LedgerRecord>
  confirmedAt: number
}>

// ---- 1. Decisions -----------------------------------------------------------------------------

/** A kept record is shared by every later snapshot of its domain: nothing may change it. */
function frozen<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  for (const member of Object.values(value)) frozen(member)
  return Object.freeze(value)
}

/** The record as the store holds it: what a read gives back for it. The keeper's own copy. */
const stored = (record: LedgerRecord): LedgerRecord =>
  frozen(JSON.parse(JSON.stringify(record)) as LedgerRecord)

/** A copy for one reader: a reader may change what a read gave it (store contract, G1). */
const handed = (record: LedgerRecord): LedgerRecord => structuredClone(record)

const inKeyOrder = (records: Iterable<readonly [string, LedgerRecord]>) =>
  new Map([...records].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)))

export function snapshotOf(read: Complete, at: number): Snapshot {
  return {
    revision: read.revision,
    records: inKeyOrder(read.records.map(record => [recordKey(record), stored(record)])),
    confirmedAt: at,
  }
}

const aged = (held: Snapshot, at: number): boolean => at - held.confirmedAt > SNAPSHOT_MAX_AGE_MS

/** What a whole read of a domain does. */
export type ReadPlan =
  /** Model `PureRead` within the age: the snapshot is the answer. */
  | Readonly<{ kind: 'answer'; read: Complete }>
  /** Model `PureRead` past the age: the store confirms the revision by a read of `probe`. */
  | Readonly<{ kind: 'confirm'; held: Snapshot; probe: string }>
  /** Model `FullRead`: no snapshot, or the snapshot says "no records". */
  | Readonly<{ kind: 'whole' }>

export function planRead(held: Snapshot | undefined, at: number): ReadPlan {
  const [probe] = held?.records.keys() ?? []
  if (held === undefined || probe === undefined) return { kind: 'whole' }
  if (aged(held, at)) return { kind: 'confirm', held, probe }
  return {
    kind: 'answer',
    read: {
      kind: 'complete',
      revision: held.revision,
      records: [...held.records.values()].map(handed),
    },
  }
}

/** What a read of one record does. */
export type RecordPlan =
  | Readonly<{ kind: 'answer'; read: Extract<LedgerRecordRead, { kind: 'complete' }> }>
  /** The snapshot says "absent" or is past its age: the store answers and judges the snapshot. */
  | Readonly<{ kind: 'ask' }>
  /** No snapshot: the whole domain is read, so the reads after this one make no round trip. */
  | Readonly<{ kind: 'whole' }>

export function planRecord(held: Snapshot | undefined, key: string, at: number): RecordPlan {
  if (held === undefined) return { kind: 'whole' }
  const record = held.records.get(key)
  if (record === undefined || aged(held, at)) return { kind: 'ask' }
  return {
    kind: 'answer',
    read: { kind: 'complete', revision: held.revision, record: handed(record) },
  }
}

/** The snapshot after the store answered a read of one record at `revision`: confirmed, or none. */
export function judged(held: Snapshot, revision: Revision, at: number): Snapshot | null {
  return revision === held.revision ? { ...held, confirmedAt: at } : null
}

/** The records after `writes`, or null when the writes drop the domain. Due entries are not records. */
function applied(
  records: ReadonlyMap<string, LedgerRecord>,
  writes: readonly LedgerWrite[],
): ReadonlyMap<string, LedgerRecord> | null {
  const next = new Map(records)
  let added = false
  for (const write of writes) {
    if (write.kind === 'drop') return null
    if (write.kind === 'put') {
      const key = recordKey(write.record)
      added ||= !next.has(key)
      next.set(key, stored(write.record))
    } else if (write.kind === 'delete') next.delete(write.key)
  }
  return added ? inKeyOrder(next) : next
}

/**
 * The snapshot of the written domain after the store answered a commit; null is "none".
 * `committed` is model `Committed`: the snapshot at the expected revision advances by the writes,
 * any other snapshot goes. `conflict` is model `Conflict`: a snapshot at the refused revision is
 * stale; a snapshot at another revision was advanced by another commit of this keeper and stays.
 * `unknown` is model `Unknown`. `unavailable` and `rejected` wrote nothing.
 */
export function afterCommit(
  held: Snapshot | undefined,
  input: LedgerCommitInput,
  answer: LedgerCommit,
  at: number,
): Snapshot | null {
  switch (answer.kind) {
    case 'committed': {
      const records = held?.revision === input.expected ? applied(held.records, input.writes) : null
      return records === null ? null : { revision: input.revision, records, confirmedAt: at }
    }
    case 'conflict':
      return held === undefined || held.revision === input.expected ? null : held
    case 'unknown':
      return null
    case 'unavailable':
    case 'rejected':
      return held ?? null
    default: {
      const exhaustive: never = answer
      return exhaustive
    }
  }
}

/** Whether a refused commit refutes the snapshot of a domain it asserted at `revision`. */
export function refuted(held: Snapshot | undefined, revision: Revision): boolean {
  return held?.revision === revision
}

// ---- 2. Crossings -----------------------------------------------------------------------------

/**
 * Whether a commit of a domain was in flight at any moment of a read of it. The store answers a
 * read with the content before such a commit, and the answer can arrive after the commit: it
 * must not become the snapshot (model `FullRead` has no commit in flight).
 */
class Crossings {
  readonly #busy = new Map<string, number>()
  /** The order number of the last start or end of a commit, by domain. */
  readonly #moved = new Map<string, number>()
  #order = 0
  /** No domain that left `#moved` moved after this order number. */
  #floor = 0

  /** The moment a read begins. */
  mark(): number {
    return this.#order
  }

  crossed(domain: string, mark: number): boolean {
    return this.#busy.has(domain) || (this.#moved.get(domain) ?? this.#floor) > mark
  }

  async during<T>(domain: string, commit: () => Promise<T>): Promise<T> {
    this.#move(domain)
    this.#busy.set(domain, (this.#busy.get(domain) ?? 0) + 1)
    try {
      return await commit()
    } finally {
      const left = (this.#busy.get(domain) ?? 1) - 1
      if (left === 0) this.#busy.delete(domain)
      else this.#busy.set(domain, left)
      this.#move(domain)
    }
  }

  #move(domain: string): void {
    this.#order += 1
    this.#moved.delete(domain)
    this.#moved.set(domain, this.#order)
    if (this.#moved.size <= KEPT_DOMAINS) return
    const [oldest, order] = this.#moved.entries().next().value as [string, number]
    this.#moved.delete(oldest)
    this.#floor = Math.max(this.#floor, order)
  }
}

// ---- 3. The port ------------------------------------------------------------------------------

/** The snapshots and crossings that every ledger store over one storage shares. */
export class LedgerKeeper {
  readonly crossings = new Crossings()
  readonly #kept = new Map<string, Snapshot>()

  get(domain: string): Snapshot | undefined {
    return this.#kept.get(domain)
  }

  /** `null` forgets the domain. */
  set(domain: string, snapshot: Snapshot | null): void {
    this.#kept.delete(domain)
    if (snapshot === null) return
    this.#kept.set(domain, snapshot)
    if (this.#kept.size <= KEPT_DOMAINS) return
    const oldest = this.#kept.keys().next().value
    if (oldest !== undefined) this.#kept.delete(oldest)
  }
}

type Raw = Pick<ToolLedgerStore, 'read' | 'readRecord' | 'commit'>

/** `raw` with its reads answered by `keeper`. `now` is a monotonic clock in milliseconds. */
export function keeping(keeper: LedgerKeeper, raw: Raw, now: () => number): Raw {
  const keyOf = (domain: LedgerDomain): string => JSON.stringify(domain)

  const whole = async (domain: LedgerDomain, key: string): Promise<LedgerRead> => {
    const mark = keeper.crossings.mark()
    const answer = await raw.read(domain)
    if (answer.kind === 'complete' && !keeper.crossings.crossed(key, mark))
      keeper.set(key, snapshotOf(answer, now()))
    return answer
  }

  /** Asks the store for one record. The revision of the answer confirms or refutes `held`. */
  const ask = async (
    domain: LedgerDomain,
    key: string,
    record: string,
  ): Promise<LedgerRecordRead> => {
    const mark = keeper.crossings.mark()
    const answer = await raw.readRecord(domain, record)
    const held = keeper.get(key)
    if (answer.kind === 'complete' && held !== undefined && !keeper.crossings.crossed(key, mark))
      keeper.set(key, judged(held, answer.revision, now()))
    return answer
  }

  const read = async (domain: LedgerDomain): Promise<LedgerRead> => {
    const key = keyOf(domain)
    const plan = planRead(keeper.get(key), now())
    if (plan.kind === 'answer') return plan.read
    if (plan.kind === 'whole') return whole(domain, key)
    const probe = await ask(domain, key, plan.probe)
    if (probe.kind !== 'complete') return probe
    const next = planRead(keeper.get(key), now())
    return next.kind === 'answer' ? next.read : whole(domain, key)
  }

  const readRecord = async (domain: LedgerDomain, record: string): Promise<LedgerRecordRead> => {
    const key = keyOf(domain)
    const plan = planRecord(keeper.get(key), record, now())
    if (plan.kind === 'answer') return plan.read
    if (plan.kind === 'ask') return ask(domain, key, record)
    const answer = await whole(domain, key)
    if (answer.kind !== 'complete') return answer
    const found = answer.records.find(candidate => recordKey(candidate) === record) ?? null
    return { kind: 'complete', revision: answer.revision, record: found }
  }

  const commit = async (input: LedgerCommitInput): Promise<LedgerCommit> => {
    const key = keyOf(input.domain)
    let answer: LedgerCommit
    try {
      answer = await keeper.crossings.during(key, () => raw.commit(input))
    } catch (error) {
      keeper.set(key, null)
      throw error
    }
    keeper.set(key, afterCommit(keeper.get(key), input, answer, now()))
    if (answer.kind === 'conflict')
      for (const assertion of input.asserts ?? []) {
        const asserted = keyOf(assertion.domain)
        if (refuted(keeper.get(asserted), assertion.revision)) keeper.set(asserted, null)
      }
    return answer
  }

  return { read, readRecord, commit }
}
