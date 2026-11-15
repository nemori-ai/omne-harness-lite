import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  decodeToolOperationId,
  type ToolCallId,
  type ToolFailure,
  type ToolOperationId,
} from '@omne-harness/tool-contract'
import { invalid, type CallInput } from './boundary.ts'
import type { QueueReconciliation, ToolLedgerQueues } from './construction.ts'
import type { Decision, Snapshot } from './ledger-decider.ts'
import {
  decideQueueRelease,
  isEarlier,
  queueKeyOf,
  releaseBasisOf,
  type QueueSnapshot,
} from './ledger-start.ts'
import type { LedgerDomain, QueueEntryRecord } from './ledger-store.ts'

type QueueDomain = Extract<LedgerDomain, { kind: 'queue' }>

export type QueueMaintenance<P> = Readonly<{
  authorize(input: unknown): Promise<Outcome<CallInput<P>, ToolFailure>>
  read(domain: LedgerDomain): Promise<Outcome<Snapshot, ToolFailure>>
  readQueue(domain: QueueDomain): Promise<Outcome<QueueSnapshot, ToolFailure>>
  transactQueue<T>(
    domain: QueueDomain,
    decide: (snapshot: QueueSnapshot) => Decision<T>,
    unknown: Outcome<T, ToolFailure>,
  ): Promise<Outcome<T, ToolFailure>>
  park(
    checked: CallInput<P>,
    operation: ToolOperationId,
  ): Promise<Outcome<Readonly<{ parked: boolean }>, ToolFailure>>
  release(
    checked: CallInput<P>,
    operation: ToolOperationId,
  ): Promise<Outcome<Readonly<{ released: boolean }>, ToolFailure>>
}>

const NOTHING: QueueReconciliation = { released: [], redrive: [] }

const RELEASE_UNKNOWN: Outcome<never, ToolFailure> = fail({
  kind: 'unavailable',
  dependency: 'ledger-store',
  diagnostic: 'the release commit of the queue reconcile has an unknown outcome',
})

function inTheWay(queue: QueueSnapshot, call: ToolCallId): QueueEntryRecord[] {
  const mine = queue.entries.get(call)
  return [...queue.entries.values()].filter(
    other =>
      other.call !== call &&
      (other.stage === 'held' || mine === undefined || isEarlier(other.ordinal, mine.ordinal)),
  )
}

async function survey<P>(
  ops: QueueMaintenance<P>,
  tenant: CallInput<P>['tenant'],
  peers: readonly QueueEntryRecord[],
): Promise<Outcome<Readonly<{ releases: ToolCallId[]; redrive: ToolCallId[] }>, ToolFailure>> {
  const releases: ToolCallId[] = []
  const redrive: ToolCallId[] = []
  for (const peer of peers) {
    const owned = await ops.read({ kind: 'call', tenant, call: peer.call })
    if ('failure' in owned) return owned
    if (owned.ok.call === null) continue
    if (releaseBasisOf(owned.ok) !== null) releases.push(peer.call)
    if (
      owned.ok.tasks.some(
        task =>
          task.kind === 'queue' ||
          (task.kind === 'suspend' && owned.ok.call?.state.phase === 'suspended'),
      )
    )
      redrive.push(peer.call)
  }
  return succeed({ releases, redrive })
}

export function createQueueReconciler<P>(ops: QueueMaintenance<P>): ToolLedgerQueues<P> {
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
    park: async input => {
      const checked = await ops.authorize(input)
      if ('failure' in checked) return checked
      const operation = decodeToolOperationId(Reflect.get(input as object, 'operation'))
      if ('failure' in operation) return invalid('operation', operation.failure.reason)
      return ops.park(checked.ok, operation.ok)
    },
    release: async input => {
      const checked = await ops.authorize(input)
      if ('failure' in checked) return checked
      const operation = decodeToolOperationId(Reflect.get(input as object, 'operation'))
      if ('failure' in operation) return invalid('operation', operation.failure.reason)
      return ops.release(checked.ok, operation.ok)
    },
  }
}
