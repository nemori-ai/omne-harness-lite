// The records the host keeps for one call, and their end (SPEC, 记录生灭表). The ledger's sweep
// asks the host to let go of them before it drops the call domain. The host answers `held` while
// an acquisition of the call still carries a duty; then nothing is removed, and the sweep asks
// again one grace later. The acquisition domain goes last, under the revision the judgement read.
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  INITIAL_REVISION as INITIAL,
  type CallRemoval,
  type LedgerDomain,
  type ToolLedgerStore,
} from '@omne-harness/tool'
import type { ToolFailure, ToolRevision } from '@omne-harness/tool-contract'
import { callAcquisitions } from './environment-state.ts'
import { callHostDomain, type HostAggregate } from './host-domains.ts'

/** The per-call aggregates that carry no duty of their own once the call is quiet. */
const PLAIN: readonly HostAggregate[] = ['start', 'source', 'delivery', 'control']

type Dropped = Outcome<'dropped' | 'changed', ToolFailure>

const unavailable = (diagnostic: string): Outcome<never, ToolFailure> =>
  fail({ kind: 'unavailable', dependency: 'ledger-store', diagnostic })

export function createLocalCallRecords(store: ToolLedgerStore): CallRemoval['hostRecords'] {
  const drop = async (domain: LedgerDomain, expected: ToolRevision): Promise<Dropped> => {
    if (expected === INITIAL) return succeed('dropped')
    const committed = await store.commit({
      domain,
      expected,
      revision: INITIAL,
      writes: [{ kind: 'drop' }],
    })
    switch (committed.kind) {
      case 'committed':
        return succeed('dropped')
      case 'conflict':
        return succeed('changed')
      case 'rejected':
        return fail({ kind: 'invalid', field: 'storage', reason: committed.reason })
      default:
        return unavailable(committed.diagnostic)
    }
  }
  return async (tenant, call) => {
    const acquisitions = await callAcquisitions(store, tenant, call)
    if ('failure' in acquisitions) return acquisitions
    if (acquisitions.ok.held) return succeed('held')
    for (const aggregate of PLAIN) {
      const domain = callHostDomain(tenant, aggregate, call)
      const read = await store.read(domain)
      if (read.kind !== 'complete') return unavailable(read.diagnostic)
      const dropped = await drop(domain, read.revision)
      if ('failure' in dropped) return dropped
      if (dropped.ok === 'changed') return succeed('held')
    }
    const last = await drop(callHostDomain(tenant, 'environment', call), acquisitions.ok.revision)
    if ('failure' in last) return last
    return succeed(last.ok === 'changed' ? 'held' : 'removed')
  }
}
