// The `./testing` entry: a non-durable ledger store for tests (G6). It declares
// `durability: 'none'` and must not be assembled into production. Fault injection lets a test
// make one read fail, or one commit answer unknown (applied, dropped, or held to land later),
// unavailable or conflict.
import type { ContentBlock } from '@omne-harness/content-block'
import type { ToolRevision } from '@omne-harness/tool-contract'
import { INITIAL_REVISION } from './evidence.ts'
import {
  recordKey,
  type LedgerCommit,
  type LedgerCommitInput,
  type LedgerDomain,
  type LedgerPendingScan,
  type LedgerPendingScanInput,
  type LedgerRecord,
  type PendingCall,
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

export interface MemoryToolLedgerStore<B extends ContentBlock> extends ToolLedgerStore<B> {
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
  scanPending(input: LedgerPendingScanInput): Promise<LedgerPendingScan>
}

type Domain<B extends ContentBlock> = {
  revision: ToolRevision
  records: Map<string, LedgerRecord<B>>
}

/** The key of a domain: the JSON of its parts, so no identity text can collide with another. */
function domainKey(domain: LedgerDomain): string {
  const tenant = [domain.tenant.organization.text, domain.tenant.account.text]
  return JSON.stringify([domain.kind, ...tenant, domain.kind === 'call' ? domain.call : domain.key])
}

/** 租户在本记录仓全序里的键：组织与账号文本的 JSON。 */
function tenantOrder(tenant: TenantId): string {
  return JSON.stringify([tenant.organization.text, tenant.account.text])
}

/** 待办标记的全序键：先租户，再调用。 */
function pendingOrder(entry: PendingCall): string {
  return JSON.stringify([tenantOrder(entry.tenant), entry.call])
}

/** A deep copy that keeps no reference to the caller's value, as a real store would. */
function copy<T>(value: T): T {
  return structuredClone(value)
}

export function createMemoryToolLedgerStore<B extends ContentBlock>(): MemoryToolLedgerStore<B> {
  const domains = new Map<string, Domain<B>>()
  // 待办标记：全序键到调用。与调用域的记录在同一次 `apply` 里改变。
  const pending = new Map<string, PendingCall>()
  const readFaults: MemoryReadFault[] = []
  const commitFaults: MemoryCommitFault[] = []
  const held: LedgerCommitInput<B>[] = []
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
    const records = new Map(target.records)
    for (const write of input.writes) {
      if (write.kind === 'put') records.set(recordKey(write.record), copy(write.record))
      else records.delete(write.key)
    }
    target.records = records
    target.revision = input.revision
    const { domain } = input
    if (domain.kind !== 'call' || input.pending === undefined) return
    // 租户身份是 legal-identity 签发的不可变值，副本会失去签发身份，所以保留原引用。
    const entry: PendingCall = { tenant: domain.tenant, call: domain.call }
    if (input.pending) pending.set(pendingOrder(entry), entry)
    else pending.delete(pendingOrder(entry))
  }

  const scanPending = (input: LedgerPendingScanInput): LedgerPendingScan => {
    const tenant = input.tenant === null ? null : tenantOrder(input.tenant)
    const after = input.after === null ? null : pendingOrder(input.after)
    const listed = [...pending.entries()]
      .filter(
        ([key, entry]) =>
          (after === null || key > after) &&
          (tenant === null || tenantOrder(entry.tenant) === tenant),
      )
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return {
      kind: 'page',
      calls: listed.slice(0, input.limit).map(([, entry]) => ({ ...entry })),
      more: listed.length > input.limit,
    }
  }

  const commit = (input: LedgerCommitInput<B>): LedgerCommit => {
    const fault = commitFaults.shift()
    if (fault === 'unavailable') return { kind: 'unavailable', diagnostic: 'injected' }
    const target = domainOf(input.domain)
    if (fault === 'conflict') return { kind: 'conflict', current: target.revision }
    if (fault === 'unknown-delayed') {
      held.push(copy(input))
      return { kind: 'unknown', diagnostic: 'injected: delayed' }
    }
    if (target.revision !== input.expected) return { kind: 'conflict', current: target.revision }
    if (fault === 'unknown-dropped') return { kind: 'unknown', diagnostic: 'injected: dropped' }
    apply(target, input)
    if (fault === 'unknown-applied') return { kind: 'unknown', diagnostic: 'injected: applied' }
    if (fault === 'throw-applied') throw new Error('injected: the store crashed after the write')
    return { kind: 'committed' }
  }

  const land = (input: LedgerCommitInput<B>): MemoryLanding => {
    const target = domainOf(input.domain)
    if (target.revision !== input.expected) return { kind: 'conflict' }
    apply(target, input)
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
    commit: input => {
      commits += 1
      return Promise.resolve(commit(input))
    },
    scanPending: input => Promise.resolve(scanPending(input)),
  }
}
