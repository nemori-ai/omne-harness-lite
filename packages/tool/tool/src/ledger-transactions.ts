import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { Reply, ToolFailure, ToolOperationId } from '@omne-harness/tool-contract'
import { invalid } from './boundary.ts'
import { nextRevision } from './evidence.ts'
import { snapshotOf, type Decision, type Mint, type Snapshot } from './ledger-decider.ts'
import { excluded, excludedSince, withExclusionsRemoved } from './ledger-exclusion.ts'
import {
  CALL_RECORD_KEY,
  recordKey,
  type LedgerAssertion,
  type LedgerCommit,
  type LedgerDomain,
  type LedgerRecord,
  type LedgerWrite,
  type ToolLedgerStore,
} from './ledger-store.ts'

export type Decide<T> = (snapshot: Snapshot, mint: Mint) => Decision<T> | Promise<Decision<T>>

function unavailable(dependency: string, diagnostic: string): Outcome<never, ToolFailure> {
  return fail({ kind: 'unavailable', dependency, diagnostic })
}

function thrown(dependency: string): string {
  return `${dependency} threw an exception; its message is not reported`
}

/**
 * The reply of one commit answer, or null after a revision conflict: the caller re-reads and
 * decides again. Only a conflict is retried. An unavailable store is temporary and the caller
 * resends the same operation; a rejected commit can never be accepted, so it is the definite
 * failure `invalid` (`field: storage`) at once, and it spends no attempt (SPEC 11).
 */
export function answerOf<T>(
  committed: LedgerCommit,
  value: T,
  unknown: Outcome<T, ToolFailure>,
): Outcome<T, ToolFailure> | null {
  switch (committed.kind) {
    case 'committed':
      return succeed(value)
    case 'conflict':
      return null
    case 'unknown':
      return unknown
    case 'unavailable':
      return unavailable('ledger-store', committed.diagnostic)
    case 'rejected':
      return invalid('storage', committed.reason)
    default: {
      const exhaustive: never = committed
      return exhaustive
    }
  }
}

/** The domains whose snapshot one ledger keeps; the least recently used one leaves first. */
const KEPT_DOMAINS = 64

/** The records of one domain at one revision, by key. */
type Kept = Readonly<{ revision: Snapshot['revision']; records: ReadonlyMap<string, LedgerRecord> }>

/** Freezes a record and everything in it: a kept record is shared by every later snapshot. */
function frozen<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  for (const member of Object.values(value)) frozen(member)
  return Object.freeze(value)
}

/** The record as the store holds it: what a read gives back for it. */
const stored = (record: LedgerRecord): LedgerRecord =>
  frozen(JSON.parse(JSON.stringify(record)) as LedgerRecord)

/** The records after `writes`, or null when the writes drop the domain. Due entries are not records. */
function applied(
  records: ReadonlyMap<string, LedgerRecord>,
  writes: readonly LedgerWrite[],
): Map<string, LedgerRecord> | null {
  const next = new Map(records)
  for (const write of writes) {
    if (write.kind === 'drop') return null
    if (write.kind === 'put') next.set(recordKey(write.record), stored(write.record))
    else if (write.kind === 'delete') next.delete(write.key)
  }
  return next
}

/**
 * The transactions of a ledger over a store with conditional commits (model `SnapshotCache`). The
 * ledger keeps the snapshot of the last whole read or commit of a domain. A write is decided on
 * it without a read: the store applies the write only at the revision of the snapshot, so a
 * snapshot another writer made stale costs one refused commit and one whole read. A pure read asks
 * the store for the revision of the domain, and reads the whole domain only when it moved.
 */
export function createLedgerTransactions(
  store: Pick<ToolLedgerStore, 'read' | 'readRecord' | 'commit'>,
  attempts: number,
) {
  const kept = new Map<string, Kept>()
  const keyOf = (domain: LedgerDomain): string => JSON.stringify(domain)
  const forget = (domain: LedgerDomain): void => void kept.delete(keyOf(domain))
  const keep = (domain: LedgerDomain, value: Kept): void => {
    const key = keyOf(domain)
    kept.delete(key)
    kept.set(key, value)
    if (kept.size > KEPT_DOMAINS) {
      const oldest = kept.keys().next().value
      if (oldest !== undefined) kept.delete(oldest)
    }
  }
  const snapshotFrom = (domain: LedgerDomain, value: Kept): Snapshot =>
    snapshotOf(domain, {
      kind: 'complete',
      revision: value.revision,
      records: [...value.records.values()],
    })

  const readDomain = async (
    domain: LedgerDomain,
  ): Promise<
    Outcome<Extract<Awaited<ReturnType<typeof store.read>>, { kind: 'complete' }>, ToolFailure>
  > => {
    let result: Awaited<ReturnType<typeof store.read>>
    try {
      result = await store.read(domain)
    } catch {
      return unavailable('ledger-store', thrown('ledger-store'))
    }
    if (result.kind === 'unavailable') {
      forget(domain)
      return unavailable('ledger-store', result.diagnostic)
    }
    keep(domain, {
      revision: result.revision,
      records: new Map(result.records.map(record => [recordKey(record), frozen(record)])),
    })
    return succeed(result)
  }

  /** Model `FullRead`: the whole domain, which becomes the kept snapshot. */
  const whole = async (domain: LedgerDomain): Promise<Outcome<Snapshot, ToolFailure>> => {
    const result = await readDomain(domain)
    return 'failure' in result ? result : succeed(snapshotOf(domain, result.ok))
  }

  /** Whether the store still has the domain at `revision`: one read of the revision. */
  const current = async (
    domain: LedgerDomain,
    revision: Snapshot['revision'],
  ): Promise<Outcome<boolean, ToolFailure>> => {
    let answer: Awaited<ReturnType<typeof store.readRecord>>
    try {
      answer = await store.readRecord(domain, CALL_RECORD_KEY)
    } catch {
      return unavailable('ledger-store', thrown('ledger-store'))
    }
    if (answer.kind === 'unavailable') return unavailable('ledger-store', answer.diagnostic)
    return succeed(answer.revision === revision)
  }

  /** Model `PureRead`: the kept snapshot when the store still has its revision. */
  const read = async (domain: LedgerDomain): Promise<Outcome<Snapshot, ToolFailure>> => {
    const known = kept.get(keyOf(domain))
    if (known === undefined) return whole(domain)
    const fresh = await current(domain, known.revision)
    if ('failure' in fresh) return fresh
    return fresh.ok ? succeed(snapshotFrom(domain, known)) : whole(domain)
  }

  const commit = async (
    domain: LedgerDomain,
    expected: Snapshot['revision'],
    revision: Snapshot['revision'],
    writes: readonly LedgerWrite[],
    asserts: readonly LedgerAssertion[] = [],
  ): Promise<Awaited<ReturnType<typeof store.commit>>> => {
    let committed: Awaited<ReturnType<typeof store.commit>>
    try {
      committed = await store.commit({ domain, expected, revision, writes, asserts })
    } catch {
      committed = { kind: 'unknown', diagnostic: thrown('ledger-store') }
    }
    const known = kept.get(keyOf(domain))
    // Model `Conflict`: a snapshot at the refused revision is stale. A snapshot another commit of
    // this ledger advanced meanwhile is newer than the refused one and stays.
    if (committed.kind === 'conflict' && known?.revision !== expected) return committed
    // Model `Committed`: the snapshot advances by the writes the store applied at its revision.
    // Every other answer, and a commit on a revision the ledger holds no snapshot of, drops it.
    const next =
      committed.kind === 'committed' && known?.revision === expected
        ? applied(known.records, writes)
        : null
    if (next === null) forget(domain)
    else keep(domain, { revision, records: next })
    return committed
  }

  const transact = async <T>(
    domain: LedgerDomain,
    operation: ToolOperationId | null,
    decide: Decide<T>,
    unknown: Outcome<T, ToolFailure>,
    since: Snapshot['revision'] | null = null,
  ): Reply<T> => {
    let firstRead = since
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      // Model `Send`: decided on the kept snapshot. After a refused commit there is none.
      const known = kept.get(keyOf(domain))
      const snapshot =
        known === undefined ? await whole(domain) : succeed(snapshotFrom(domain, known))
      if ('failure' in snapshot) return snapshot
      // The first read of a command on a kept snapshot is the revision of that snapshot. It is
      // not later than the revision of the store, so a fence is never missed; a fence another
      // writer wrote since then stops the command once with the retryable answer.
      firstRead ??= snapshot.ok.revision
      if (operation !== null && excludedSince(snapshot.ok, operation, firstRead))
        return excluded(operation)
      const revision = nextRevision(snapshot.ok.revision)
      const decision = await decide(snapshot.ok, { revision })
      if (decision.kind === 'reply') {
        // An answer without a commit is a pure read: nothing else checks the snapshot it was
        // decided on. On a kept snapshot the store confirms the revision first.
        if (known === undefined) return decision.outcome
        const fresh = await current(domain, snapshot.ok.revision)
        if ('failure' in fresh) return fresh
        if (fresh.ok) return decision.outcome
        forget(domain)
        continue
      }
      const operations = new Set(operation === null ? [] : [operation])
      for (const write of decision.writes) {
        if (write.kind === 'put' && write.record.kind === 'operation')
          operations.add(write.record.operation.operation)
      }
      for (const identity of operations) {
        if (excludedSince(snapshot.ok, identity, firstRead)) return excluded(identity)
      }
      const writes = withExclusionsRemoved(decision.writes, operations)
      const committed = await commit(domain, snapshot.ok.revision, revision, writes)
      const answer = answerOf(committed, decision.value, unknown)
      if (answer !== null) return answer
    }
    return unavailable('ledger-store', `${attempts} revision conflicts in a row`)
  }

  return { readDomain, read, commit, transact }
}
