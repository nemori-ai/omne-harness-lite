import type { Access, HistorySequence } from './refs.js'
import { compareHistorySequence, decodeHistorySequence } from './refs.js'
import { canonical } from './internal.js'
import type { AssemblyFailure, AssemblyUnknown, HistoryCursor, HistoryEvidence } from './values.js'
import type { HistoryRow, HistorySource } from './ports.js'
/** Page budget of one history read; the row byte count only bounds the page (H5). */
export const HISTORY_PAGE_BYTES = 65536
export type HistoryRead =
  | Readonly<{ kind: 'history'; rows: readonly HistoryRow[]; evidence: HistoryEvidence }>
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
function validPage(
  rows: readonly HistoryRow[],
  after: HistorySequence | null,
  evidence: HistoryEvidence,
): boolean {
  let previous = after
  for (const row of rows) {
    if ('failure' in decodeHistorySequence(row.seq) || !withinUpper(row.seq, evidence)) return false
    const expected = previous === null ? '0' : (BigInt(previous) + 1n).toString()
    if (row.seq !== expected) return false
    if (row.message.role !== 'assistant' && row.sourceCall !== undefined) return false
    previous = row.seq
  }
  return true
}
/**
 * Reads every page of one fixed history evidence (H1). An epoch change is returned to the caller,
 * which re-reads the whole history group; pages of two epochs are never joined (H2).
 */
export async function readHistory<P>(
  access: Access<P>,
  evidence: HistoryEvidence,
  source: HistorySource<P>,
): Promise<HistoryRead> {
  let cursor: HistoryCursor | null = null
  const rows: HistoryRow[] = []
  while (true) {
    const result = await source.read({ access, evidence, cursor, budgetBytes: HISTORY_PAGE_BYTES })
    switch (result.kind) {
      case 'page': {
        const after = cursor?.after ?? null
        if (!validPage(result.page.rows, after, evidence))
          return { kind: 'invalid', field: 'history.page', reason: 'unsupported-format' }
        rows.push(...result.page.rows)
        const next = result.page.next
        if (next === null) {
          const last = rows.at(-1)
          const complete =
            evidence.upper.kind === 'empty'
              ? last === undefined
              : last !== undefined && last.seq === evidence.upper.seq
          return complete
            ? { kind: 'history', rows, evidence }
            : { kind: 'invalid', field: 'history.page', reason: 'unsupported-format' }
        }
        if (
          !sameEvidence(next.evidence, evidence) ||
          result.page.rows.length === 0 ||
          next.after !== rows.at(-1)?.seq
        )
          return { kind: 'invalid', field: 'history.cursor', reason: 'cursor-invalidated' }
        cursor = next
        break
      }
      case 'epoch-changed':
        return result
      case 'denied':
        return {
          kind: 'denied',
          action: 'read-history',
          diagnostic: 'History source refused access',
        }
      case 'invalid':
        return { kind: 'invalid', field: `history.${result.field}`, reason: result.reason }
      case 'unavailable':
        return { kind: 'unavailable', owner: 'history-source', diagnostic: result.diagnostic }
      case 'unknown':
        return { kind: 'unknown', source: 'read', diagnostic: 'History source outcome unknown' }
    }
  }
}
