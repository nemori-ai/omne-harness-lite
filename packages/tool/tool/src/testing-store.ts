// The `./testing` entry: a non-durable ledger store for tests (G6). It declares
// `durability: 'none'` and must not be assembled into production. It evaluates the revision
// condition and the read-set assertions of a commit together, as a durable provider does inside
// one transaction. Fault injection lets a test make one read fail, or one commit answer unknown
// (applied, dropped, or held to land later), unavailable or conflict.

import type { ToolRevision } from '@omne-harness/tool-contract'
import type { ToolInstant } from '@omne-harness/tool-contract/provider'
import { INITIAL_REVISION } from './evidence.ts'
import {
  recordKey,
  type DueEntry,
  type LedgerCommit,
  type LedgerCommitInput,
  type LedgerDomain,
  type LedgerDueRead,
  type LedgerRecord,
  type TenantId,
  type ToolLedgerStore,
} from './ledger-store.ts'

export type MemoryReadFault = 'unavailable'
export type MemoryCommitFault =
  /** The writes take effect, but the answer is `unknown`. */
  | 'unknown-applied'
  /** Nothing is written, and the answer is `unknown`. */
  | 'unknown-dropped'
  /**
   * Nothing is written now, and the answer is `unknown`. The commit stays in flight until
   * `landDelayed`, which applies it only if the domain revision is still its `expected`.
   */
  | 'unknown-delayed'
  | 'unavailable'
  /** Nothing is written, and the answer is `conflict`, as if another writer had committed. */
  | 'conflict'
  /** The store throws after it applied the writes, as a crashed provider would. */
  | 'throw-applied'

/** What happened to one held commit when it landed. */
export type MemoryLanding = Readonly<{ kind: 'committed' }> | Readonly<{ kind: 'conflict' }>

export interface MemoryToolLedgerStore extends ToolLedgerStore {
  readonly durability: 'none'
  /** The next reads consume these faults in order; a read without a fault succeeds. */
  injectRead(...faults: readonly MemoryReadFault[]): void
  /** The next commits consume these faults in order; a commit without a fault is ordinary. */
  injectCommit(...faults: readonly MemoryCommitFault[]): void
  /**
   * Lands every commit held by `unknown-delayed`, in the order they were made. Each one checks
   * its expected revision when it lands, as a real store evaluates the condition then.
   */
  landDelayed(): readonly MemoryLanding[]
  /** How many commits were attempted, faults included. */
  readonly commits: number
  /** How many reads were attempted, faults included. */
  readonly reads: number
}

type Domain = {
  revision: ToolRevision
  records: Map<string, LedgerRecord>
  /** The due index entries this domain scheduled, by key. */
  due: Map<string, ToolInstant>
}

const tenantKey = (tenant: TenantId): string =>
  JSON.stringify([tenant.organization.text, tenant.account.text])

/** The key of a domain: the JSON of its parts, so no identity text can collide with another. */
function domainKey(domain: LedgerDomain): string {
  const tenant = [domain.tenant.organization.text, domain.tenant.account.text]
  return JSON.stringify([domain.kind, ...tenant, domain.kind === 'call' ? domain.call : domain.key])
}

/** A deep copy that keeps no reference to the caller's value, as a real store would. */
function copy<T>(value: T): T {
  return structuredClone(value)
}

export function createMemoryToolLedgerStore(): MemoryToolLedgerStore {
  const domains = new Map<string, Domain>()
  /** The ledger domain of each key of `domains`, for the due read. */
  const addresses = new Map<string, LedgerDomain>()
  const readFaults: MemoryReadFault[] = []
  const commitFaults: MemoryCommitFault[] = []
  const held: LedgerCommitInput[] = []
  let commits = 0
  let reads = 0

  const domainOf = (domain: LedgerDomain): Domain => {
    const key = domainKey(domain)
    const existing = domains.get(key)
    if (existing !== undefined) return existing
    const created: Domain = { revision: INITIAL_REVISION, records: new Map(), due: new Map() }
    domains.set(key, created)
    addresses.set(key, copy(domain))
    return created
  }

  const apply = (target: Domain, input: LedgerCommitInput): void => {
    const records = new Map(target.records)
    const due = new Map(target.due)
    for (const write of input.writes) {
      switch (write.kind) {
        case 'drop':
          records.clear()
          due.clear()
          break
        case 'put':
          records.set(recordKey(write.record), copy(write.record))
          break
        case 'delete':
          records.delete(write.key)
          break
        case 'schedule':
          due.set(write.key, write.dueAt)
          break
        case 'unschedule':
          due.delete(write.key)
          break
        default: {
          const exhaustive: never = write
          return exhaustive
        }
      }
    }
    target.records = records
    target.due = due
    target.revision = input.revision
  }

  const dueOf = (tenant: TenantId, now: ToolInstant, limit: number): LedgerDueRead => {
    const entries: DueEntry[] = []
    for (const [key, domain] of domains) {
      const address = addresses.get(key)
      if (address === undefined || tenantKey(address.tenant) !== tenantKey(tenant)) continue
      for (const [entryKey, dueAt] of domain.due)
        if (dueAt <= now) entries.push({ domain: copy(address), key: entryKey, dueAt })
    }
    entries.sort((a, b) =>
      a.dueAt < b.dueAt ? -1 : a.dueAt > b.dueAt ? 1 : a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
    )
    return { kind: 'complete', entries: entries.slice(0, limit) }
  }

  /** Whether every assertion names a domain of the written domain's tenant. */
  const sameTenant = (input: LedgerCommitInput): boolean => {
    const tenant = JSON.stringify([
      input.domain.tenant.organization.text,
      input.domain.tenant.account.text,
    ])
    return (input.asserts ?? []).every(
      assertion =>
        JSON.stringify([
          assertion.domain.tenant.organization.text,
          assertion.domain.tenant.account.text,
        ]) === tenant,
    )
  }

  /** A commit with `drop` holds nothing else and leaves the domain at the initial revision. */
  const wellFormedDrop = (input: LedgerCommitInput): boolean =>
    !input.writes.some(write => write.kind === 'drop') ||
    (input.writes.length === 1 && input.revision === INITIAL_REVISION)

  /** The condition of a commit: the written domain at `expected` and every assertion holding. */
  const holds = (input: LedgerCommitInput): boolean =>
    domainOf(input.domain).revision === input.expected &&
    (input.asserts ?? []).every(
      assertion => domainOf(assertion.domain).revision === assertion.revision,
    )

  const commit = (input: LedgerCommitInput): LedgerCommit => {
    const fault = commitFaults.shift()
    if (fault === 'unavailable') return { kind: 'unavailable', diagnostic: 'injected' }
    if (!sameTenant(input))
      return { kind: 'rejected', reason: 'an assertion names a domain of another tenant' }
    if (!wellFormedDrop(input))
      return { kind: 'rejected', reason: 'a drop is the only write and names the initial revision' }
    const target = domainOf(input.domain)
    if (fault === 'conflict') return { kind: 'conflict', current: target.revision }
    if (fault === 'unknown-delayed') {
      held.push(copy(input))
      return { kind: 'unknown', diagnostic: 'injected: delayed' }
    }
    if (!holds(input)) return { kind: 'conflict', current: target.revision }
    if (fault === 'unknown-dropped') return { kind: 'unknown', diagnostic: 'injected: dropped' }
    apply(target, input)
    if (fault === 'unknown-applied') return { kind: 'unknown', diagnostic: 'injected: applied' }
    if (fault === 'throw-applied') throw new Error('injected: the store crashed after the write')
    return { kind: 'committed' }
  }

  const land = (input: LedgerCommitInput): MemoryLanding => {
    if (!holds(input)) return { kind: 'conflict' }
    apply(domainOf(input.domain), input)
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
    landDelayed: () => held.splice(0).map(land),
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
    readRecord: (domain, key) => {
      reads += 1
      if (readFaults.shift() === 'unavailable')
        return Promise.resolve({ kind: 'unavailable', diagnostic: 'injected' })
      const target = domainOf(domain)
      return Promise.resolve({
        kind: 'complete',
        revision: target.revision,
        record: copy(target.records.get(key) ?? null),
      })
    },
    commit: input => {
      commits += 1
      return Promise.resolve(commit(input))
    },
    due: (tenant, now, limit) => {
      reads += 1
      if (readFaults.shift() === 'unavailable')
        return Promise.resolve({ kind: 'unavailable', diagnostic: 'injected' })
      return Promise.resolve(dueOf(tenant, now, limit))
    },
  }
}
