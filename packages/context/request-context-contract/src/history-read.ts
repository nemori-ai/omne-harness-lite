import type { Access, HistorySequence } from './refs.js'
import { compareHistorySequence, decodeHistorySequence } from './refs.js'
import { tenantEquals } from '@omne-harness/legal-identity'
import { canonical } from './internal.js'
import type { AssemblyFailure, AssemblyUnknown, HistoryCursor, HistoryEvidence } from './values.js'
import type { HistoryPage, HistoryReadResult, HistoryRow, HistorySource } from './ports.js'
export const HISTORY_PAGE_BYTES = 65536
export type HistoryReadMode = 'full' | 'same' | 'tail'
export type HistoryPrefix = Readonly<{ evidence: HistoryEvidence; rows: readonly HistoryRow[] }>
export type HistoryRead =
  | Readonly<{
      kind: 'history'
      rows: readonly HistoryRow[]
      evidence: HistoryEvidence
      mode: HistoryReadMode
      added: readonly HistoryRow[]
    }>
  | Readonly<{ kind: 'epoch-changed'; current: HistoryEvidence }>
  | AssemblyFailure
  | AssemblyUnknown
function sameEvidence(left: HistoryEvidence, right: HistoryEvidence): boolean {
  return canonical(left) === canonical(right)
}
export function withinUpper(seq: HistorySequence, evidence: HistoryEvidence): boolean {
  return evidence.upper.kind === 'entry' && compareHistorySequence(seq, evidence.upper.seq) <= 0
}
function nextSequence(after: HistorySequence | null): string {
  return after === null ? '0' : (BigInt(after) + 1n).toString()
}
function validPage(
  rows: readonly HistoryRow[],
  after: HistorySequence | null,
  evidence: HistoryEvidence,
): boolean {
  let previous = after
  for (const row of rows) {
    if ('failure' in decodeHistorySequence(row.seq) || !withinUpper(row.seq, evidence)) return false
    if (row.seq !== nextSequence(previous)) return false
    if (row.message.role !== 'assistant' && row.sourceCall !== undefined) return false
    previous = row.seq
  }
  return true
}
function lastSequence(rows: readonly HistoryRow[]): HistorySequence | null {
  return rows.at(-1)?.seq ?? null
}
function sameHistory(left: HistoryEvidence, right: HistoryEvidence): boolean {
  return (
    left.epoch === right.epoch &&
    left.target.scope.ref === right.target.scope.ref &&
    tenantEquals(left.target.tenant, right.target.tenant)
  )
}
function endsAtUpper(rows: readonly HistoryRow[], evidence: HistoryEvidence): boolean {
  const last = rows.at(-1)
  return evidence.upper.kind === 'empty'
    ? last === undefined
    : last !== undefined && last.seq === evidence.upper.seq
}
function start(evidence: HistoryEvidence, prefix: HistoryPrefix | undefined) {
  if (prefix === undefined) return null
  const last = lastSequence(prefix.rows)
  const before = prefix.evidence
  if (!endsAtUpper(prefix.rows, before) || !sameHistory(before, evidence)) return null
  if (sameEvidence(before, evidence)) return { mode: 'same' as const, after: last }
  if (evidence.upper.kind !== 'entry') return null
  const later =
    before.upper.kind === 'empty' ||
    compareHistorySequence(evidence.upper.seq, before.upper.seq) > 0
  return later ? { mode: 'tail' as const, after: last } : null
}
type Refusal = Exclude<HistoryReadResult, { kind: 'page' | 'epoch-changed' }>
function refusalOf(result: Refusal): AssemblyFailure | AssemblyUnknown {
  switch (result.kind) {
    case 'denied':
      return { kind: 'denied', action: 'read-history', diagnostic: 'History source refused access' }
    case 'invalid':
      return { kind: 'invalid', field: `history.${result.field}`, reason: result.reason }
    case 'unavailable':
      return { kind: 'unavailable', owner: 'history-source', diagnostic: result.diagnostic }
    case 'unknown':
      return { kind: 'unknown', source: 'read', diagnostic: 'History source outcome unknown' }
  }
}
const badPage = { kind: 'invalid', field: 'history.page', reason: 'unsupported-format' } as const
type Step = Readonly<{ kind: 'more'; cursor: HistoryCursor }> | Readonly<{ kind: 'done' }>
function takePage(
  page: HistoryPage,
  cursor: HistoryCursor | null,
  evidence: HistoryEvidence,
  rows: HistoryRow[],
): Step | AssemblyFailure {
  if (!validPage(page.rows, cursor?.after ?? null, evidence)) return badPage
  rows.push(...page.rows)
  const next = page.next
  if (next === null) return endsAtUpper(rows, evidence) ? { kind: 'done' } : badPage
  const broken =
    !sameEvidence(next.evidence, evidence) ||
    page.rows.length === 0 ||
    next.after !== rows.at(-1)?.seq
  return broken
    ? { kind: 'invalid', field: 'history.cursor', reason: 'cursor-invalidated' }
    : { kind: 'more', cursor: next }
}
function resumeOf(
  evidence: HistoryEvidence,
  from: ReturnType<typeof start>,
  prefix: HistoryPrefix | undefined,
) {
  const held = from === null || prefix === undefined ? [] : prefix.rows
  const cursor: HistoryCursor | null =
    from === null || from.after === null ? null : { evidence, after: from.after }
  const mode = from === null ? ('full' as const) : ('tail' as const)
  return { held, cursor, mode }
}
export async function readHistory<P>(
  access: Access<P>,
  evidence: HistoryEvidence,
  source: HistorySource<P>,
  prefix?: HistoryPrefix,
): Promise<HistoryRead> {
  const from = start(evidence, prefix)
  if (from?.mode === 'same' && prefix !== undefined)
    return { kind: 'history', rows: prefix.rows, evidence, mode: 'same', added: [] }
  const resume = resumeOf(evidence, from, prefix)
  const held = resume.held
  let cursor = resume.cursor
  const rows: HistoryRow[] = [...held]
  while (true) {
    const result = await source.read({ access, evidence, cursor, budgetBytes: HISTORY_PAGE_BYTES })
    if (result.kind === 'epoch-changed') return result
    if (result.kind !== 'page') return refusalOf(result)
    const step = takePage(result.page, cursor, evidence, rows)
    if (step.kind === 'more') cursor = step.cursor
    else if (step.kind === 'done')
      return {
        kind: 'history',
        rows,
        evidence,
        mode: resume.mode,
        added: rows.slice(held.length),
      }
    else return step
  }
}
