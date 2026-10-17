// The `./testing` entry: a non-durable ledger store for tests (G6). It declares
// `durability: 'none'` and must not be assembled into production. Fault injection lets a test
// make one read fail or one commit answer unknown (applied or dropped) or unavailable.
import type { ContentBlock } from '@omne-harness/content-block'
import type { ToolRevision } from '@omne-harness/tool-contract'
import { tenantKey } from './boundary.ts'
import { INITIAL_REVISION } from './evidence.ts'
import {
  recordKey,
  type LedgerCommit,
  type LedgerCommitInput,
  type LedgerDomain,
  type LedgerRecord,
  type ToolLedgerStore,
} from './ledger-store.ts'

export type MemoryReadFault = 'unavailable'
export type MemoryCommitFault =
  /** The writes take effect, but the answer is `unknown`. */
  | 'unknown-applied'
  /** Nothing is written, and the answer is `unknown`. */
  | 'unknown-dropped'
  | 'unavailable'
  /** The store throws after it applied the writes, as a crashed provider would. */
  | 'throw-applied'

export interface MemoryToolLedgerStore<B extends ContentBlock> extends ToolLedgerStore<B> {
  readonly durability: 'none'
  /** The next reads consume these faults in order; a read without a fault succeeds. */
  injectRead(...faults: readonly MemoryReadFault[]): void
  /** The next commits consume these faults in order; a commit without a fault is ordinary. */
  injectCommit(...faults: readonly MemoryCommitFault[]): void
  /** How many commits were attempted, faults included. */
  readonly commits: number
  /** How many reads were attempted, faults included. */
  readonly reads: number
}

type Domain<B extends ContentBlock> = {
  revision: ToolRevision
  readonly records: Map<string, LedgerRecord<B>>
}

function domainKey(domain: LedgerDomain): string {
  const tenant = tenantKey(domain.tenant)
  return domain.kind === 'call' ? `call:${tenant}/${domain.call}` : `queue:${tenant}/${domain.key}`
}

/** A deep copy that keeps no reference to the caller's value, as a real store would. */
function copy<T>(value: T): T {
  return structuredClone(value)
}

export function createMemoryToolLedgerStore<B extends ContentBlock>(): MemoryToolLedgerStore<B> {
  const domains = new Map<string, Domain<B>>()
  const readFaults: MemoryReadFault[] = []
  const commitFaults: MemoryCommitFault[] = []
  let commits = 0
  let reads = 0

  const domainOf = (domain: LedgerDomain): Domain<B> => {
    const key = domainKey(domain)
    const existing = domains.get(key)
    if (existing !== undefined) return existing
    const created: Domain<B> = { revision: INITIAL_REVISION, records: new Map() }
    domains.set(key, created)
    return created
  }

  const apply = (target: Domain<B>, input: LedgerCommitInput<B>): void => {
    for (const write of input.writes) {
      if (write.kind === 'put') target.records.set(recordKey(write.record), copy(write.record))
      else target.records.delete(write.key)
    }
    target.revision = input.revision
  }

  const commit = (input: LedgerCommitInput<B>): LedgerCommit => {
    const fault = commitFaults.shift()
    if (fault === 'unavailable') return { kind: 'unavailable', diagnostic: 'injected' }
    const target = domainOf(input.domain)
    if (target.revision !== input.expected) return { kind: 'conflict', current: target.revision }
    if (fault === 'unknown-dropped') return { kind: 'unknown', diagnostic: 'injected: dropped' }
    apply(target, input)
    if (fault === 'unknown-applied') return { kind: 'unknown', diagnostic: 'injected: applied' }
    if (fault === 'throw-applied') throw new Error('injected: the store crashed after the write')
    return { kind: 'committed' }
  }

  return {
    durability: 'none',
    injectRead: (...faults) => {
      readFaults.push(...faults)
    },
    injectCommit: (...faults) => {
      commitFaults.push(...faults)
    },
    get commits() {
      return commits
    },
    get reads() {
      return reads
    },
    read: domain => {
      reads += 1
      if (readFaults.shift() === 'unavailable')
        return Promise.resolve({ kind: 'unavailable', diagnostic: 'injected' })
      const target = domainOf(domain)
      return Promise.resolve({
        kind: 'complete',
        revision: target.revision,
        records: copy([...target.records.values()]),
      })
    },
    commit: input => {
      commits += 1
      return Promise.resolve(commit(input))
    },
  }
}
