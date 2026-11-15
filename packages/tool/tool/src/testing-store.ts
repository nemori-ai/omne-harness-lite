import type { ToolRevision } from '@omne-harness/tool-contract'
import type { ToolInstant } from '@omne-harness/tool-contract/provider'
import { INITIAL_REVISION } from './evidence.ts'
import {
  recordKey,
  type DueEntry,
  type LedgerCommit,
  type LedgerCommitInput,
  type LedgerDomain,
  type LedgerPendingScan,
  type LedgerPendingScanInput,
  type LedgerDueRead,
  type LedgerRecord,
  type PendingCall,
  type TenantId,
  type ToolLedgerStore,
} from './ledger-store.ts'

export type MemoryReadFault = 'unavailable'
export type MemoryCommitFault =
  | 'unknown-applied'
  | 'unknown-dropped'
  | 'unknown-delayed'
  | 'unavailable'
  | 'conflict'
  | 'throw-applied'

export type MemoryLanding = Readonly<{ kind: 'committed' }> | Readonly<{ kind: 'conflict' }>

export interface MemoryToolLedgerStore extends ToolLedgerStore {
  readonly durability: 'none'
  injectRead(...faults: readonly MemoryReadFault[]): void
  injectCommit(...faults: readonly MemoryCommitFault[]): void
  landDelayed(): readonly MemoryLanding[]
  readonly commits: number
  readonly reads: number
  scanPending(input: LedgerPendingScanInput): Promise<LedgerPendingScan>
}

type Domain = {
  revision: ToolRevision
  records: Map<string, LedgerRecord>
  due: Map<string, ToolInstant>
}

const tenantKey = (tenant: TenantId): string =>
  JSON.stringify([tenant.organization.text, tenant.account.text])

function domainKey(domain: LedgerDomain): string {
  const tenant = [domain.tenant.organization.text, domain.tenant.account.text]
  return JSON.stringify([domain.kind, ...tenant, domain.kind === 'call' ? domain.call : domain.key])
}

function tenantOrder(tenant: TenantId): string {
  return JSON.stringify([tenant.organization.text, tenant.account.text])
}

function pendingOrder(entry: PendingCall): string {
  return JSON.stringify([tenantOrder(entry.tenant), entry.call])
}

function copy<T>(value: T): T {
  return structuredClone(value)
}

export function createMemoryToolLedgerStore(): MemoryToolLedgerStore {
  const domains = new Map<string, Domain>()
  const addresses = new Map<string, LedgerDomain>()
  const pending = new Map<string, PendingCall>()
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
    const { domain } = input
    if (domain.kind !== 'call' || input.pending === undefined) return
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

  const wellFormedDrop = (input: LedgerCommitInput): boolean =>
    !input.writes.some(write => write.kind === 'drop') ||
    (input.writes.length === 1 && input.revision === INITIAL_REVISION)

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
    scanPending: input => Promise.resolve(scanPending(input)),
  }
}
