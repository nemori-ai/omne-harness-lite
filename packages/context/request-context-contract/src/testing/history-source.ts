import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import {
  parseRecordEntryRef,
  type CompactionContext,
  type CompactionMessage,
  type CoveredEntry,
  type Message,
  type MessagePart,
  type RecordEntryRef,
} from '@omne-harness/message'
import type { Access, EpochId, HistorySequence } from '../refs.js'
import { compareHistorySequence, decodeEpochId, decodeHistorySequence } from '../refs.js'
import type {
  HistorySource,
  HistoryRow,
  HistoryReadResult,
  CompactionContextResult,
} from '../ports.js'
import type { HistoryEvidence, HistoryUpper, SourcedMessage } from '../values.js'
import { canonical, digest } from '../internal.js'
/** A fixture row: a history row without its chained digest, which the double computes. */
export type HistoryFixtureRow = Readonly<{
  seq: HistorySequence
  entry: RecordEntryRef
  bytes: string
}> &
  SourcedMessage
type FixtureRow = HistoryFixtureRow
export type HistoryFixture = Readonly<{
  scope: ScopeRef
  epochs: readonly Readonly<{
    epoch: EpochId
    rows: readonly FixtureRow[]
    entries: readonly CoveredEntry[]
    open: readonly RecordEntryRef[]
  }>[]
  tenant: TenantId
}>
export interface MemoryHistorySource<P> extends HistorySource<P> {
  readonly durability: 'none'
  /** The evidence of the active epoch up to its last row. */
  evidence(): HistoryEvidence
  commitCompaction(record: CompactionMessage): EpochId
  denyTenant(tenant: TenantId): void
  fail(diagnostic: string): void
  readCount(): number
}
function sequence(index: number): HistorySequence {
  const value = decodeHistorySequence(String(index))
  if ('failure' in value) throw new Error('Invalid fixture sequence')
  return value.ok
}
function upperOf(rows: readonly FixtureRow[]): HistoryUpper {
  const last = rows.at(-1)
  return last === undefined ? { kind: 'empty' } : { kind: 'entry', seq: last.seq }
}
const ANSWERABLE = ['tool_call', 'tool_call_unparsed']
function callIds(message: Message | null, kinds: readonly string[]): string[] {
  if (message === null) return []
  const blocks: readonly MessagePart[] = message.blocks
  return blocks.flatMap(part =>
    kinds.includes(part.kind) && 'callId' in part ? [String(part.callId)] : [],
  )
}
/** Non-durable history double. Never install it as a production history owner. */
export function createMemoryHistorySource<P>(fixture: HistoryFixture): MemoryHistorySource<P> {
  let active = 0,
    calls = 0
  let failed: string | null = null
  const denied: TenantId[] = []
  const epochs = [...fixture.epochs]
  // The original log: every entry in the order it was first seen, compaction records included.
  const log: CoveredEntry[] = []
  const remember = (entries: readonly CoveredEntry[]) => {
    for (const entry of entries) if (!log.some(x => x.ref === entry.ref)) log.push(entry)
  }
  for (const epoch of epochs) remember(epoch.entries)
  const target = () => ({ tenant: fixture.tenant, scope: fixture.scope })
  function current(): HistoryEvidence | null {
    const epoch = epochs[active]
    return epoch === undefined
      ? null
      : { target: target(), epoch: epoch.epoch, upper: upperOf(epoch.rows) }
  }
  function eligibility(
    e: HistoryEvidence,
    access: Access<P> | undefined,
  ): Exclude<HistoryReadResult, { kind: 'page' }> | null {
    if (access === null || access === undefined)
      return { kind: 'invalid', field: 'access', reason: 'missing-access' }
    if (e?.target?.scope?.ref !== fixture.scope.ref)
      return { kind: 'invalid', field: 'evidence.target', reason: 'missing-scope' }
    if (
      !tenantEquals(access.tenant, fixture.tenant) ||
      !tenantEquals(e.target.tenant, fixture.tenant) ||
      denied.some(t => tenantEquals(t, access.tenant))
    )
      return { kind: 'denied' }
    if (failed !== null) return { kind: 'unavailable', diagnostic: failed }
    const now = current()
    if (now === null) return { kind: 'unavailable', diagnostic: 'No history epoch' }
    if (e.epoch !== now.epoch) {
      return epochs.some(x => x.epoch === e.epoch)
        ? { kind: 'epoch-changed', current: now }
        : { kind: 'invalid', field: 'evidence.epoch', reason: 'unknown-epoch' }
    }
    if (
      e.upper.kind === 'entry' &&
      (now.upper.kind === 'empty' || compareHistorySequence(e.upper.seq, now.upper.seq) > 0)
    )
      return { kind: 'invalid', field: 'evidence.upper', reason: 'upper-out-of-range' }
    return null
  }
  function windowOf(
    entries: readonly CoveredEntry[],
    coverTo: RecordEntryRef,
  ): CompactionContext | null {
    const end = entries.findIndex(x => x.ref === coverTo)
    const origin = log[0]?.ref
    if (end < 0 || origin === undefined) return null
    const record = [...entries].reverse().find(x => x.message?.role === 'compaction')
    const positions = new Map(log.map((x, i) => [x.ref, i] as const))
    const pairings = entries.flatMap(entry => {
      if (entry.message?.role !== 'tool') return []
      const callId = callIds(entry.message, ['tool_result'])[0]
      const at = positions.get(entry.ref) ?? log.length
      const call = log
        .slice(0, at)
        .reverse()
        .find(x => callId !== undefined && callIds(x.message, ANSWERABLE).includes(callId))
      return [{ result: entry.ref, call: call?.ref ?? null }]
    })
    return {
      origin,
      base:
        record === undefined
          ? { kind: 'initial' }
          : { kind: 'previous', record: record.ref, pairings },
      covered: entries.slice(0, end + 1),
      after: entries.slice(end + 1),
      open: epochs[active]?.open ?? [],
    }
  }
  return {
    durability: 'none',
    readCount: () => calls,
    evidence() {
      const now = current()
      if (now === null) throw new Error('No epoch')
      return now
    },
    denyTenant: t => {
      denied.push(t)
    },
    fail: d => {
      failed = d
    },
    commitCompaction(record) {
      const epoch = epochs[active]
      if (epoch === undefined) throw new Error('No epoch')
      const next = epochs[active + 1]
      if (next !== undefined) {
        active++
        return next.epoch
      }
      const id = decodeEpochId(`epoch_${digest(record)}`)
      if ('failure' in id) throw new Error('Invalid derived epoch')
      const retained = epoch.rows.filter(r => record.retained.includes(r.entry))
      const end = epoch.entries.findIndex(entry => entry.ref === record.covers.to)
      const after = epoch.entries.slice(end + 1)
      const afterRefs = new Set(after.map(entry => entry.ref))
      const occupied = new Set<string>(log.map(entry => entry.ref))
      const base = `compaction:${record.id}`
      let raw = base
      let suffix = 0
      while (occupied.has(raw)) raw = `${base}:${++suffix}`
      const newEntry = parseRecordEntryRef(raw)
      if (newEntry === null) throw new Error('Invalid derived compaction entry')
      remember([{ ref: newEntry, message: record }])
      epochs.push({
        epoch: id.ok,
        rows: [
          ...retained,
          {
            seq: sequence(retained.length),
            entry: newEntry,
            message: record,
            bytes: String(Buffer.byteLength(JSON.stringify(record))),
          },
          ...epoch.rows.filter(row => afterRefs.has(row.entry)),
        ].map((r, seq) => ({ ...r, seq: sequence(seq) })),
        entries: [
          ...epoch.entries.filter(entry => record.retained.includes(entry.ref)),
          { ref: newEntry, message: record },
          ...after,
        ],
        open: epoch.open,
      })
      active++
      return id.ok
    },
    async read({ access, evidence: e, cursor, budgetBytes }) {
      calls++
      const rejection = eligibility(e, access)
      if (rejection !== null) return rejection
      if (cursor !== null && canonical(cursor.evidence) !== canonical(e))
        return { kind: 'invalid', field: 'cursor', reason: 'cursor-invalidated' }
      if (!Number.isSafeInteger(budgetBytes) || budgetBytes <= 0)
        return { kind: 'invalid', field: 'budgetBytes', reason: 'unsupported-format' }
      const epoch = epochs[active]
      if (epoch === undefined) return { kind: 'unavailable', diagnostic: 'No epoch' }
      let previous = ''
      const rows: HistoryRow[] = epoch.rows.map(r => {
        previous = digest({ previous, row: r })
        return { ...r, prefixDigest: previous } as HistoryRow
      })
      const upper = e.upper
      const available = rows.filter(
        r =>
          upper.kind === 'entry' &&
          compareHistorySequence(r.seq, upper.seq) <= 0 &&
          (cursor === null || compareHistorySequence(r.seq, cursor.after) > 0),
      )
      const page: HistoryRow[] = []
      let used = 0n
      for (const row of available) {
        if (used + BigInt(row.bytes) > BigInt(budgetBytes) && page.length) break
        page.push(row)
        used += BigInt(row.bytes)
      }
      const last = page.at(-1)
      return {
        kind: 'page',
        page: {
          rows: page,
          next:
            page.length < available.length && last !== undefined
              ? { evidence: e, after: last.seq }
              : null,
        },
      }
    },
    async compactionContext({ access, evidence: e, coverTo }): Promise<CompactionContextResult> {
      const rejection = eligibility(e, access)
      if (rejection !== null) return rejection
      const epoch = epochs[active]
      if (epoch === undefined) return { kind: 'unavailable', diagnostic: 'No epoch' }
      const window = windowOf(epoch.entries, coverTo)
      if (window === null) return { kind: 'invalid', field: 'coverTo', reason: 'unknown-epoch' }
      return { kind: 'context', evidence: e, value: window }
    },
  }
}
