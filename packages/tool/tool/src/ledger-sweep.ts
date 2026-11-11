// The sweep over the due index (BodyLifecycle `DeleteBytes` then `Reclaim`). For each due body
// the store deletes the bytes first, idempotently; only then does the ledger commit `reclaimed`
// and unschedule the entry in one write. A sweeper that stops between the two steps leaves the
// due entry in place, so the rerun deletes again and reaches the same end state.
//
// A due call domain (CallLifecycle `Postpone`, `Sweep`) is dropped whole, after the bytes of its
// bodies left the store (their entries come first) and the host let go of the records it keeps. A
// domain that may not be dropped yet is scheduled again one grace later, and the sweep goes on:
// only a store that cannot answer stops the sweep.
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { Reply, ToolFailure } from '@omne-harness/tool-contract'
import {
  decodeToolBodyId,
  type ToolBodyRef,
  type ToolInstant,
} from '@omne-harness/tool-contract/provider'
import type { ToolCallId } from '@omne-harness/tool-contract'
import type { ToolLedgerPorts } from './construction.ts'
import { INITIAL_REVISION } from './evidence.ts'
import { instantAfter } from './ledger-body-writer.ts'
import { put, type Decision, type Snapshot } from './ledger-decider.ts'
import { createLedgerTransactions } from './ledger-transactions.ts'
import {
  CALL_DUE_KEY,
  type DueEntry,
  type LedgerDomain,
  type LedgerWrite,
  type TenantId,
  type ToolLedgerStore,
} from './ledger-store.ts'

export type ToolLedgerSweep = Readonly<{
  /**
   * Handles at most `limit` entries due at `now` on the sweeper's clock; answers how many bodies
   * it reclaimed and how many call domains it removed.
   */
  sweep(
    tenant: TenantId,
    now: ToolInstant,
    limit: number,
  ): Reply<Readonly<{ reclaimed: number; removed: number }>>
}>

/**
 * What the sweep needs to remove call domains. `graceMs` is G. `hostRecords` removes the records
 * the host keeps for one call. It answers `held` while another owner still refers to one of them;
 * the call domain then stays, because the host reads the call record when it changes its own.
 */
export type CallRemoval = Readonly<{
  graceMs: number
  hostRecords: (tenant: TenantId, call: ToolCallId) => Reply<'removed' | 'held'>
}>

type SweepTransaction = <T>(
  domain: LedgerDomain,
  operation: null,
  decide: (snapshot: Snapshot) => Promise<Decision<T>>,
  unknown: Outcome<T, ToolFailure>,
) => Reply<T>

export type SweepPorts<P> = Readonly<{
  bodies: ToolLedgerPorts<P>['bodies']
  due: ToolLedgerStore['due']
  transact: SweepTransaction
  read: ReturnType<typeof createLedgerTransactions>['read']
  commit: ReturnType<typeof createLedgerTransactions>['commit']
  removal: CallRemoval
}>

const unavailable = (dependency: string, diagnostic: string): Outcome<never, ToolFailure> =>
  fail({ kind: 'unavailable', dependency, diagnostic })

const BODY_KEY_PREFIX = 'body:'

/** Model `Reclaim`: the entry becomes `reclaimed` and leaves the due index in the same commit. */
function decideReclaim(snapshot: Snapshot, entry: DueEntry): Decision<void> {
  const bodyId = entry.key.slice(BODY_KEY_PREFIX.length)
  const known = snapshot.bodies.get(bodyId)
  const writes: LedgerWrite[] = [{ kind: 'unschedule', key: entry.key }]
  if (known !== undefined && known.state.kind !== 'reclaimed')
    writes.unshift(put({ kind: 'body-entry', body: { ...known, state: { kind: 'reclaimed' } } }))
  return { kind: 'commit', value: undefined, writes }
}

/**
 * A released call that nothing of the ledger will write again (CallLifecycle `~busy`). A blocked
 * `clock` task is not a duty: it records that the end of the execution has no clock marker, and
 * no driver step reads it. Every other task is a duty that keeps the domain.
 */
function quiet(snapshot: Snapshot): boolean {
  const state = snapshot.call?.state
  if (state === undefined) return true
  return (
    state.phase === 'settled' &&
    snapshot.tasks.every(task => task.kind === 'clock' && task.state === 'blocked') &&
    [state.delivery, ...state.supplements.map(item => item.delivery)].every(
      delivery => delivery?.kind === 'released',
    )
  )
}

export function createLedgerSweep<P>(ports: SweepPorts<P>): ToolLedgerSweep {
  type Removal = Outcome<'removed' | 'kept', ToolFailure>

  /** Model `Postpone`: the entry moves one grace on; the domain stays. */
  const postpone = async (entry: DueEntry, now: ToolInstant): Promise<Removal> => {
    const moved = await ports.transact(
      entry.domain,
      null,
      () =>
        Promise.resolve<Decision<void>>({
          kind: 'commit',
          value: undefined,
          writes: [
            {
              kind: 'schedule',
              key: CALL_DUE_KEY,
              dueAt: instantAfter(now, ports.removal.graceMs),
            },
          ],
        }),
      unavailable('ledger-store', 'the postpone commit outcome is unknown; rerun the sweep'),
    )
    return 'failure' in moved ? moved : succeed('kept')
  }

  /**
   * Model `Sweep` for one due call domain. The bytes of its bodies are gone when the sweep gets
   * here (model `DeleteBytes`): the instant of the call is not before the instant of any of its
   * bodies, `due` answers by instant and then by key, and a body key sorts before `CALL_DUE_KEY`.
   * So the entries of the bodies come first, and a body the store could not delete stops the
   * sweep before it reaches the call.
   */
  const removeCall = async (
    entry: DueEntry & { domain: Extract<LedgerDomain, { kind: 'call' }> },
    now: ToolInstant,
  ): Promise<Removal> => {
    const snapshot = await ports.read(entry.domain)
    if ('failure' in snapshot) return snapshot
    if (!quiet(snapshot.ok)) return postpone(entry, now)
    if (snapshot.ok.call !== null) {
      const host = await ports.removal.hostRecords(entry.domain.tenant, entry.domain.call)
      if ('failure' in host) return host
      if (host.ok === 'held') return postpone(entry, now)
    }
    const dropped = await ports.commit(entry.domain, snapshot.ok.revision, INITIAL_REVISION, [
      { kind: 'drop' },
    ])
    switch (dropped.kind) {
      case 'committed':
        return succeed('removed')
      // Another commit wrote the domain since the read: the entry is still due, or was moved.
      case 'conflict':
        return succeed('kept')
      case 'rejected':
        return fail({ kind: 'invalid', field: 'storage', reason: dropped.reason })
      default:
        return unavailable('ledger-store', dropped.diagnostic)
    }
  }

  return {
    sweep: async (tenant, now, limit) => {
      const bodies = ports.bodies
      if (bodies === undefined) return unavailable('body-store', 'body custody is not connected')
      const due = await ports.due(tenant, now, limit)
      if (due.kind !== 'complete') return unavailable('ledger-store', due.diagnostic)
      let reclaimed = 0
      let removed = 0
      for (const entry of due.entries) {
        if (entry.domain.kind === 'call' && entry.key === CALL_DUE_KEY) {
          const outcome = await removeCall({ ...entry, domain: entry.domain }, now)
          if ('failure' in outcome) return outcome
          if (outcome.ok === 'removed') removed += 1
          continue
        }
        const scheduled = scheduledBody(entry)
        if ('failure' in scheduled) return scheduled
        const deleted = await bodies.store.delete(scheduled.ok)
        if (deleted.kind !== 'deleted') return unavailable('body-store', deleted.diagnostic)
        const committed = await ports.transact(
          entry.domain,
          null,
          snapshot => Promise.resolve(decideReclaim(snapshot, entry)),
          unavailable('ledger-store', 'the reclaim commit outcome is unknown; rerun the sweep'),
        )
        if ('failure' in committed) return committed
        reclaimed += 1
      }
      return succeed({ reclaimed, removed })
    },
  }
}

/** A due entry is a body of a call domain; anything else in the index is a store defect. */
function scheduledBody(entry: DueEntry): Outcome<ToolBodyRef, ToolFailure> {
  if (entry.domain.kind !== 'call' || !entry.key.startsWith(BODY_KEY_PREFIX))
    return unavailable('ledger-store', `the due index holds a non-body entry ${entry.key}`)
  const body = decodeToolBodyId(entry.key.slice(BODY_KEY_PREFIX.length))
  if ('failure' in body)
    return unavailable('ledger-store', `the due index holds an illegal body key ${entry.key}`)
  return succeed({ tenant: entry.domain.tenant, call: entry.domain.call, body: body.ok })
}

/**
 * The sweep an application schedules without holding a whole ledger: the same `due` read, store
 * delete and reclaim commit as `ToolLedger.sweep`, over the store and body ports it is given.
 */
export function createToolSweep(
  store: ToolLedgerStore,
  bodies: ToolLedgerPorts<unknown>['bodies'],
  ledgerCommitAttempts: number,
  removal: CallRemoval,
): ToolLedgerSweep {
  const { transact, read, commit } = createLedgerTransactions(store, ledgerCommitAttempts)
  return createLedgerSweep({
    bodies,
    due: (tenant, now, limit) => store.due(tenant, now, limit),
    transact,
    read,
    commit,
    removal,
  })
}
