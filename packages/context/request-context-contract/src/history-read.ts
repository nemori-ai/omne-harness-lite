import type { Access, HistorySequence } from './refs.js'
import { compareHistorySequence, decodeHistorySequence } from './refs.js'
import { tenantEquals } from '@omne-harness/legal-identity'
import { canonical } from './internal.js'
import type { AssemblyFailure, AssemblyUnknown, HistoryCursor, HistoryEvidence } from './values.js'
import type { HistoryPage, HistoryReadResult, HistoryRow, HistorySource } from './ports.js'
/** Page budget of one history read; the row byte count only bounds the page (H5). */
export const HISTORY_PAGE_BYTES = 65536
/** How the rows of a read were obtained: all pages, the verified prefix itself, or the prefix plus a tail. */
export type HistoryReadMode = 'full' | 'same' | 'tail'
/** Rows of an earlier read under an earlier evidence of the same history, already verified. */
export type HistoryPrefix = Readonly<{ evidence: HistoryEvidence; rows: readonly HistoryRow[] }>
export type HistoryRead =
  | Readonly<{
      kind: 'history'
      rows: readonly HistoryRow[]
      evidence: HistoryEvidence
      mode: HistoryReadMode
      /** The rows read now; the rows before them are the prefix. */
      added: readonly HistoryRow[]
    }>
  | Readonly<{ kind: 'epoch-changed'; current: HistoryEvidence }>
  | AssemblyFailure
  | AssemblyUnknown
function sameEvidence(left: HistoryEvidence, right: HistoryEvidence): boolean {
  return canonical(left) === canonical(right)
}
/** Whether `seq` lies inside `[0, upper]` of the evidence. */
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
    // The first row continues the cursor; every later row continues the row before it.
    if (row.seq !== nextSequence(previous)) return false
    if (row.message.role !== 'assistant' && row.sourceCall !== undefined) return false
    previous = row.seq
  }
  return true
}
function lastSequence(rows: readonly HistoryRow[]): HistorySequence | null {
  return rows.at(-1)?.seq ?? null
}
/** The same history: one target and one epoch, whatever the upper bound. */
function sameHistory(left: HistoryEvidence, right: HistoryEvidence): boolean {
  return (
    left.epoch === right.epoch &&
    left.target.scope.ref === right.target.scope.ref &&
    tenantEquals(left.target.tenant, right.target.tenant)
  )
}
/** Whether the rows end exactly at the upper bound of the evidence they were read under. */
function endsAtUpper(rows: readonly HistoryRow[], evidence: HistoryEvidence): boolean {
  const last = rows.at(-1)
  return evidence.upper.kind === 'empty'
    ? last === undefined
    : last !== undefined && last.seq === evidence.upper.seq
}
/**
 * Where a read starts: the verified prefix itself under the same evidence, its end under a later
 * upper bound of the same target and epoch, and the beginning in every other case (H2).
 */
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
/** The failure of the history port, with the class and the fields the callers rely on. */
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
/** Adds one page to the rows and says whether another page follows (H1, H3). */
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
/**
 * Reads every page of one fixed history evidence (H1). With a verified prefix of the same history
 * only the rows after it are read; an unchanged evidence reads no page. An epoch change is returned
 * to the caller, which re-reads the whole history group; pages of two epochs are never joined (H2).
 */
export async function readHistory<P>(
  access: Access<P>,
  evidence: HistoryEvidence,
  source: HistorySource<P>,
  prefix?: HistoryPrefix,
): Promise<HistoryRead> {
  const from = start(evidence, prefix)
  if (from?.mode === 'same' && prefix !== undefined)
    return { kind: 'history', rows: prefix.rows, evidence, mode: 'same', added: [] }
  const held = from === null || prefix === undefined ? [] : prefix.rows
  let cursor: HistoryCursor | null =
    from === null || from.after === null ? null : { evidence, after: from.after }
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
        mode: from === null ? 'full' : 'tail',
        added: rows.slice(held.length),
      }
    else return step
  }
}
