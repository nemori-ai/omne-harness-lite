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
  sweep(
    tenant: TenantId,
    now: ToolInstant,
    limit: number,
  ): Reply<Readonly<{ reclaimed: number; removed: number }>>
}>

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

function decideReclaim(snapshot: Snapshot, entry: DueEntry): Decision<void> {
  const bodyId = entry.key.slice(BODY_KEY_PREFIX.length)
  const known = snapshot.bodies.get(bodyId)
  const writes: LedgerWrite[] = [{ kind: 'unschedule', key: entry.key }]
  if (known !== undefined && known.state.kind !== 'reclaimed')
    writes.unshift(put({ kind: 'body-entry', body: { ...known, state: { kind: 'reclaimed' } } }))
  return { kind: 'commit', value: undefined, writes }
}

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

function scheduledBody(entry: DueEntry): Outcome<ToolBodyRef, ToolFailure> {
  if (entry.domain.kind !== 'call' || !entry.key.startsWith(BODY_KEY_PREFIX))
    return unavailable('ledger-store', `the due index holds a non-body entry ${entry.key}`)
  const body = decodeToolBodyId(entry.key.slice(BODY_KEY_PREFIX.length))
  if ('failure' in body)
    return unavailable('ledger-store', `the due index holds an illegal body key ${entry.key}`)
  return succeed({ tenant: entry.domain.tenant, call: entry.domain.call, body: body.ok })
}

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
