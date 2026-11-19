import type { SessionId } from '@omne-harness/session-contract'
import type { FrozenCover, SearchCursor } from './cursor.ts'
import type { SearchHit } from './hit.ts'
import type { CandidateRow, CoverStamp, DocId } from './index-port.ts'
import type { Judged } from './log-port.ts'
import { candidatesAsk, pageFull, spentOut, type Run } from './search-run.ts'

// The index names candidates, newest first; each is read back from the log and matched there.
// The index decides nothing: a row the log does not bear out is dropped.

export type WalkEnd =
  | Readonly<{ kind: 'done' }>
  | Readonly<{ kind: 'stopped'; spent: boolean; before: DocId; last: SearchCursor['last'] }>
  | Readonly<{ kind: 'stale' }>
  | Readonly<{ kind: 'unavailable' }>

export type WalkStart = Readonly<{
  generation: number
  stamp: CoverStamp
  first: readonly CandidateRow[]
  frozen: readonly FrozenCover[]
  last: SearchCursor['last']
}>

// The time a row was appended with is the high part of its number; 0 says none was recorded.
function timeOf(doc: DocId): number | null {
  const at = Number(BigInt(doc) >> 20n)
  return at === 0 ? null : at
}

const keyOf = (session: SessionId, position: string): string => `${session}\u0000${position}`

export async function walkIndex(run: Run, start: WalkStart): Promise<WalkEnd> {
  const { deps, input } = run
  const { limits, tenant } = input
  const frozenAt = new Map(start.frozen.map(([session, through]) => [session, BigInt(through)]))
  let last = start.last
  let examined = 0
  if (last !== null) run.seen.add(keyOf(last.session, last.position))
  // Rows of one entry lie next to each other, so the page's set and `last` leave one hit each.
  const wanted = (row: CandidateRow): boolean =>
    run.inScope(row.session) && !run.seen.has(keyOf(row.session, row.position))
  const hitOf = (row: CandidateRow, judged: Judged): SearchHit | null => {
    // What lies past a frozen cover was the tail scan's to report.
    const cover = frozenAt.get(row.session)
    if (cover !== undefined && BigInt(judged.revision) > cover) return null
    if (judged.match === null) return null
    const { session, position } = row
    const { kind, snippet } = judged.match
    return { session, position, kind, at: timeOf(row.doc), snippet }
  }
  for (let rows = start.first; ;) {
    for (let from = 0; from < rows.length; from += limits.verifyBatch) {
      const batch = rows.slice(from, from + limits.verifyBatch)
      const asked = batch.filter(wanted)
      const read = await deps.log.judgeAt({ tenant, points: asked, spec: input.query.spec })
      if ('failure' in read) return { kind: 'unavailable' }
      const entries = new Map(asked.map((row, at) => [row.doc, read.ok[at]]))
      for (const row of batch) {
        examined += 1
        const stop = (spent: boolean): WalkEnd => ({
          kind: 'stopped',
          spent,
          before: row.doc,
          last,
        })
        const judged = wanted(row) ? entries.get(row.doc) : null
        const hit = judged ? hitOf(row, judged) : null
        if (hit !== null) {
          run.seen.add(keyOf(row.session, row.position))
          last = { session: row.session, position: row.position }
          run.hits.push(hit)
          if (pageFull(run)) return stop(false)
        }
        // Asked after a row, never before the first: a page always gets somewhere.
        if (examined >= limits.maxCandidates || spentOut(run)) return stop(true)
      }
    }
    const end = rows.at(-1)
    if (end === undefined || rows.length < limits.candidateBatch) return { kind: 'done' }
    const ask = candidatesAsk(input, start.generation, end.doc, start.stamp)
    const next = await deps.index.candidates(ask)
    if ('failure' in next)
      return { kind: next.failure === 'generation-gone' ? 'stale' : 'unavailable' }
    rows = next.ok.rows
  }
}
