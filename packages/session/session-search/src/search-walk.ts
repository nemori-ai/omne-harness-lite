import type { SessionId } from '@omne-harness/session-contract'
import type { FrozenCover, SearchCursor } from './cursor.ts'
import { snippetOf } from './hit.ts'
import type { CandidateRow, Candidates, DocId } from './index-port.ts'
import { matchEntry } from './query.ts'
import { pageFull, spentOut, type Run } from './search-run.ts'

// The index names candidates, newest first; each is read back from the log and matched there.
// The index decides nothing: a row the log does not bear out is dropped.

export type WalkEnd =
  | Readonly<{ kind: 'done' }>
  | Readonly<{
      kind: 'stopped'
      why: 'full' | 'budget'
      before: DocId | null
      last: SearchCursor['last']
    }>
  | Readonly<{ kind: 'stale' }>
  | Readonly<{ kind: 'unavailable' }>

export type WalkStart = Readonly<{
  generation: number
  first: Candidates
  frozen: readonly FrozenCover[]
  before: DocId | null
  last: SearchCursor['last']
}>

const keyOf = (session: SessionId, position: string): string => `${session}\u0000${position}`

export async function walkIndex(run: Run, start: WalkStart): Promise<WalkEnd> {
  const { deps, input } = run
  const { limits, query, tenant } = input
  const frozenAt = new Map(start.frozen.map(([session, through]) => [session, BigInt(through)]))
  let { before, last } = start
  let examined = 0
  if (last !== null) run.seen.add(keyOf(last.session, last.position))
  // Rows of one entry lie next to each other, so the page's set and `last` leave one hit each.
  const wanted = (row: CandidateRow): boolean =>
    run.inScope(row.session) && !run.seen.has(keyOf(row.session, row.position))
  let rows = start.first.rows
  while (rows.length > 0) {
    for (let from = 0; from < rows.length; from += limits.verifyBatch) {
      const batch = rows.slice(from, from + limits.verifyBatch)
      const asked = batch.filter(wanted)
      const read = await deps.log.at({ tenant, points: asked })
      if ('failure' in read) return { kind: 'unavailable' }
      const entries = new Map(asked.map((row, at) => [row.doc, read.ok[at] ?? null]))
      for (const row of batch) {
        if (examined >= limits.maxCandidates || spentOut(run))
          return { kind: 'stopped', why: 'budget', before, last }
        examined += 1
        before = row.doc
        const logged = entries.get(row.doc)
        if (logged === undefined || logged === null || !wanted(row)) continue
        const { entry, at } = logged
        // What lies past a frozen cover was the tail scan's to report.
        const cover = frozenAt.get(row.session)
        if (cover !== undefined && BigInt(entry.revision) > cover) continue
        const match = matchEntry(query, entry)
        if (match === null) continue
        run.seen.add(keyOf(row.session, row.position))
        last = { session: row.session, position: row.position }
        run.hits.push({ ...last, kind: match.kind, at, snippet: snippetOf(match) })
        if (pageFull(run)) return { kind: 'stopped', why: 'full', before, last }
      }
    }
    if (rows.length < limits.candidateBatch) return { kind: 'done' }
    const next = await deps.index.candidates({
      tenant,
      generation: start.generation,
      plan: query.plan,
      sessions: query.scope.kind === 'sessions' ? query.scope.sessions : null,
      window: query.window,
      before,
      limit: limits.candidateBatch,
    })
    if ('failure' in next)
      return { kind: next.failure === 'generation-gone' ? 'stale' : 'unavailable' }
    rows = next.ok.rows
  }
  return { kind: 'done' }
}
