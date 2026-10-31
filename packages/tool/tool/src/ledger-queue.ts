// The queue maintenance entry of the ledger (SPEC 22): the reconcile that a waiting call asks for
// its FIFO key. A queue entry repeats a fact that its call domain owns (the call's stage), and the
// queue domain cannot read that domain, so an entry can outlive the step that should have moved
// or removed it. The reconcile reads the call domains of the entries that stand in the waiter's
// way and repairs only what the call domain proves: an entry whose call holds a release basis is
// deleted with its tombstone, and a call that still owes the queue domain a step is reported so
// that the driver runs it. It never changes the stage of another call's entry, and it reads the
// call domains plainly: a fenced read would write an exclusion record and exclude the in-flight
// redo of the call's owner.
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolCallId, ToolFailure } from '@omne-harness/tool-contract'
import { invalid, type CallInput } from './boundary.ts'
import type { QueueReconciliation, ToolLedgerQueues } from './construction.ts'
import type { Decision, Snapshot } from './ledger-decider.ts'
import {
  decideQueueRelease,
  isEarlier,
  queueKeyOf,
  releaseBasisOf,
  type QueueSnapshot,
  type Release,
} from './ledger-start.ts'
import type { LedgerDomain, QueueEntryRecord } from './ledger-store.ts'

type QueueDomain = Extract<LedgerDomain, { kind: 'queue' }>

/** What the ledger gives the reconcile: its own authorization, reads and queue transaction. */
export type QueueMaintenance<P, B extends ContentBlock> = Readonly<{
  /** The boundary and the qualification of a `recover` entry. */
  authorize(input: unknown): Promise<Outcome<CallInput<P>, ToolFailure>>
  read(domain: LedgerDomain): Promise<Outcome<Snapshot<B>, ToolFailure>>
  readQueue(domain: QueueDomain): Promise<Outcome<QueueSnapshot, ToolFailure>>
  transactQueue<T>(
    domain: QueueDomain,
    decide: (snapshot: QueueSnapshot) => Decision<T, B>,
    unknown: Outcome<T, ToolFailure>,
  ): Promise<Outcome<T, ToolFailure>>
}>

const NOTHING: QueueReconciliation = { released: [], redrive: [] }

/** A release commit whose outcome is unknown: nothing is claimed, the waiter asks again later. */
const RELEASE_UNKNOWN: Outcome<never, ToolFailure> = fail({
  kind: 'unavailable',
  dependency: 'ledger-store',
  diagnostic: 'the release commit of the queue reconcile has an unknown outcome',
})

/** The entries that can stand in the waiter's way: earlier than its own, or holding a slot. */
function inTheWay(queue: QueueSnapshot, call: ToolCallId): QueueEntryRecord[] {
  const mine = queue.entries.get(call)
  return [...queue.entries.values()].filter(
    other =>
      other.call !== call &&
      (other.stage === 'held' || mine === undefined || isEarlier(other.ordinal, mine.ordinal)),
  )
}

/**
 * What the call domains of `peers` prove, read plainly: the calls that hold a release basis, and
 * the calls that still owe the queue domain a step (an open `queue` task).
 */
async function survey<P, B extends ContentBlock>(
  ops: QueueMaintenance<P, B>,
  tenant: CallInput<P>['tenant'],
  peers: readonly QueueEntryRecord[],
): Promise<Outcome<Readonly<{ releases: Release[]; redrive: ToolCallId[] }>, ToolFailure>> {
  const releases: Release[] = []
  const redrive: ToolCallId[] = []
  for (const peer of peers) {
    const owned = await ops.read({ kind: 'call', tenant, call: peer.call })
    if ('failure' in owned) return owned
    if (owned.ok.call === null) continue
    const basis = releaseBasisOf(owned.ok)
    if (basis !== null) releases.push({ call: peer.call, basis })
    if (owned.ok.tasks.some(task => task.kind === 'queue')) redrive.push(peer.call)
  }
  return succeed({ releases, redrive })
}

export function createQueueReconciler<P, B extends ContentBlock>(
  ops: QueueMaintenance<P, B>,
): ToolLedgerQueues<P> {
  return {
    reconcile: async input => {
      const checked = await ops.authorize(input)
      if ('failure' in checked) return checked
      const { tenant, call } = checked.ok
      const own = await ops.read({ kind: 'call', tenant, call })
      if ('failure' in own) return own
      if (own.ok.call === null) return invalid('call', 'unknown-call')
      const { request } = own.ok.call
      if (request.availability.kind !== 'available') return succeed(NOTHING)
      const domain: QueueDomain = { kind: 'queue', tenant, key: queueKeyOf(request) }
      const queue = await ops.readQueue(domain)
      if ('failure' in queue) return queue
      const surveyed = await survey(ops, tenant, inTheWay(queue.ok, call))
      if ('failure' in surveyed) return surveyed
      const { releases, redrive } = surveyed.ok
      if (releases.length === 0) return succeed({ released: [], redrive })
      const done = await ops.transactQueue(
        domain,
        snapshot => decideQueueRelease(snapshot, releases),
        RELEASE_UNKNOWN,
      )
      return 'failure' in done ? done : succeed({ released: done.ok, redrive })
    },
  }
}
