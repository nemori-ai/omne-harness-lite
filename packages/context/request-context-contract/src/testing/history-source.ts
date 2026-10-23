import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import {
  parseRecordEntryRef,
  type CompactionMessage,
  type CoveredEntry,
  type RecordEntryRef,
} from '@omne-harness/message'
import type { Access, EpochId } from '../refs.js'
import type {
  HistorySource,
  HistoryRow,
  HistoryReadResult,
  CompactionContextResult,
} from '../ports.js'
import type { HistoryEvidence } from '../values.js'
import { decodeEpochId } from '../refs.js'
import { digest } from '../internal.js'
export type HistoryFixture = Readonly<{
  scope: ScopeRef
  epochs: readonly Readonly<{
    epoch: EpochId
    rows: readonly Omit<HistoryRow, 'prefixDigest'>[]
    entries: readonly CoveredEntry[]
    open: readonly RecordEntryRef[]
  }>[]
  tenant: TenantId
}>
export interface MemoryHistorySource<P> extends HistorySource<P> {
  readonly durability: 'none'
  commitCompaction(record: CompactionMessage): EpochId
  denyTenant(tenant: TenantId): void
  fail(diagnostic: string): void
  readCount(): number
}
/** Non-durable history double. Never install it as a production history owner. */
export function createMemoryHistorySource<P>(fixture: HistoryFixture): MemoryHistorySource<P> {
  let active = 0,
    calls = 0
  let failed: string | null = null
  const denied: TenantId[] = []
  let epochs = [...fixture.epochs]
  function eligibility(
    e: HistoryEvidence,
    access: Access<P> | null,
  ): Exclude<HistoryReadResult, { kind: 'page' }> | null {
    if (e.scope?.ref !== fixture.scope.ref) return { kind: 'invalid', reason: 'missing-scope' }
    if (access === null || access === undefined)
      return { kind: 'invalid', reason: 'missing-access' }
    if (
      !tenantEquals(access.tenant, fixture.tenant) ||
      denied.some(t => tenantEquals(t, access.tenant))
    )
      return { kind: 'denied' }
    if (failed !== null) return { kind: 'unavailable', diagnostic: failed }
    const current = epochs[active]
    if (current === undefined) return { kind: 'unavailable', diagnostic: 'No history epoch' }
    if (e.epoch !== current.epoch)
      return {
        kind: 'epoch-changed',
        current: {
          scope: fixture.scope,
          epoch: current.epoch,
          upper: current.rows.at(-1)?.seq ?? -1,
        },
      }
    if (e.upper > (current.rows.at(-1)?.seq ?? -1))
      return { kind: 'invalid', reason: 'upper-out-of-range' }
    return null
  }
  return {
    durability: 'none',
    readCount: () => calls,
    denyTenant: t => {
      denied.push(t)
    },
    fail: d => {
      failed = d
    },
    commitCompaction(record) {
      const current = epochs[active]
      if (current === undefined) throw new Error('No epoch')
      const next = epochs[active + 1]
      if (next !== undefined) {
        active++
        return next.epoch
      }
      const id = decodeEpochId(`epoch_${digest(record)}`)
      if ('failure' in id) throw new Error('Invalid derived epoch')
      const retained = current.rows.filter(r => record.retained.includes(r.entry))
      const end = current.entries.findIndex(entry => entry.ref === record.covers.to)
      const after = current.entries.slice(end + 1)
      const afterRefs = new Set(after.map(entry => entry.ref))
      const occupied = new Set<string>([
        ...current.rows.map(row => row.entry),
        ...current.entries.map(entry => entry.ref),
      ])
      const base = `compaction:${record.id}`
      let raw = base
      let suffix = 0
      while (occupied.has(raw)) raw = `${base}:${++suffix}`
      const newEntry = parseRecordEntryRef(raw)
      if (newEntry === null) throw new Error('Invalid derived compaction entry')
      epochs.push({
        epoch: id.ok,
        rows: [
          ...retained,
          {
            seq: retained.length,
            entry: newEntry,
            message: record,
            bytes: String(Buffer.byteLength(JSON.stringify(record))),
          },
          ...current.rows.filter(row => afterRefs.has(row.entry)),
        ].map((r, seq) => ({ ...r, seq })),
        entries: [
          ...current.entries.filter(entry => record.retained.includes(entry.ref)),
          { ref: newEntry, message: record },
          ...after,
        ],
        open: current.open,
      })
      active++
      return id.ok
    },
    async read(e, access, after, budgetBytes) {
      calls++
      const rejection = eligibility(e, access)
      if (rejection !== null) return rejection
      if (!Number.isSafeInteger(budgetBytes) || budgetBytes <= 0)
        return { kind: 'invalid', reason: 'upper-out-of-range' }
      const epoch = epochs[active]
      if (epoch === undefined) return { kind: 'unavailable', diagnostic: 'No epoch' }
      let previous = ''
      const rows = epoch.rows.map(r => {
        previous = digest({ previous, row: r })
        return { ...r, prefixDigest: previous }
      })
      const available = rows.filter(r => r.seq > (after ?? -1) && r.seq <= e.upper)
      const page: HistoryRow[] = []
      let used = 0n
      for (const row of available) {
        if (used + BigInt(row.bytes) > BigInt(budgetBytes)) {
          if (page.length) break
          return { kind: 'unavailable', diagnostic: 'Single row exceeds the requested byte budget' }
        }
        page.push(row)
        used += BigInt(row.bytes)
      }
      return {
        kind: 'page',
        page: {
          rows: page,
          next: page.length < available.length ? (page.at(-1)?.seq ?? null) : null,
        },
      }
    },
    async compactionContext(e, access, coverTo): Promise<CompactionContextResult> {
      const rejection = eligibility(e, access)
      if (rejection !== null) {
        if (rejection.kind === 'invalid')
          return {
            kind: 'invalid',
            reason: rejection.reason === 'upper-out-of-range' ? 'unknown-epoch' : rejection.reason,
          }
        return rejection
      }
      const epoch = epochs[active]
      if (epoch === undefined) return { kind: 'unavailable', diagnostic: 'No epoch' }
      const end = epoch.entries.findIndex(x => x.ref === coverTo)
      if (end < 0) return { kind: 'invalid', reason: 'unknown-epoch' }
      return {
        kind: 'context',
        epoch: e.epoch,
        value: {
          covered: epoch.entries.slice(0, end + 1),
          after: epoch.entries.slice(end + 1).flatMap(x => (x.message === null ? [] : [x.message])),
          open: epoch.open,
        },
      }
    },
  }
}
