// The sweep over the due index (BodyLifecycle `DeleteBytes` then `Reclaim`). For each due body
// the store deletes the bytes first, idempotently; only then does the ledger commit `reclaimed`
// and unschedule the entry in one write. A sweeper that stops between the two steps leaves the
// due entry in place, so the rerun deletes again and reaches the same end state.
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { Reply, ToolFailure } from '@omne-harness/tool-contract'
import {
  decodeToolBodyId,
  type ToolBodyRef,
  type ToolInstant,
} from '@omne-harness/tool-contract/provider'
import type { ToolLedgerPorts } from './construction.ts'
import { put, type Decision, type Snapshot } from './ledger-decider.ts'
import type {
  DueEntry,
  LedgerDomain,
  LedgerWrite,
  TenantId,
  ToolLedgerStore,
} from './ledger-store.ts'

export type ToolLedgerSweep = Readonly<{
  /** Reclaims at most `limit` bodies due at `now` on the sweeper's clock; answers how many. */
  sweep(tenant: TenantId, now: ToolInstant, limit: number): Reply<Readonly<{ reclaimed: number }>>
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

export function createLedgerSweep<P>(ports: SweepPorts<P>): ToolLedgerSweep {
  return {
    sweep: async (tenant, now, limit) => {
      const bodies = ports.bodies
      if (bodies === undefined) return unavailable('body-store', 'body custody is not connected')
      const due = await ports.due(tenant, now, limit)
      if (due.kind !== 'complete') return unavailable('ledger-store', due.diagnostic)
      let reclaimed = 0
      for (const entry of due.entries) {
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
      return succeed({ reclaimed })
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
