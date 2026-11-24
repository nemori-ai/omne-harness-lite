import type { TenantId } from '@omne-harness/legal-identity'
import type { SessionId } from '@omne-harness/session-contract'
import type { SearchCursor } from './cursor.ts'
import type { SearchHit } from './hit.ts'
import type { CandidateRequest, CoverStamp, DocId, HistoryIndex } from './index-port.ts'
import type { HistoryLogReader } from './log-port.ts'
import type { CompiledQuery } from './query.ts'
import type { SearchMemo } from './search-memo.ts'

export type SearchLimits = Readonly<{
  /** Rows asked of the index at a time, and entries read back in one log read. */
  candidateBatch: number
  verifyBatch: number
  /** What one page may spend before it says it is not through: time, candidates, tail bytes. */
  timeBudgetMs: number
  maxCandidates: number
  scanBytes: number
  tailPageBytes: number
  /** Sessions behind the index a cursor can carry; with more, a page cannot be continued. */
  maxFrozen: number
}>

export type SearchDeps = Readonly<{
  index: HistoryIndex
  log: HistoryLogReader
  now(): number
  memo?: SearchMemo
}>

export type SearchInput = Readonly<{
  tenant: TenantId
  query: CompiledQuery
  /** The digest of the query as asked: a cursor of another query does not go on here. */
  digest: string
  cursor: SearchCursor | null
  pageSize: number
  limits: SearchLimits
}>

/** What one page works with: its ports, its query, what it found and what it spent. */
export type Run = Readonly<{
  deps: SearchDeps
  input: SearchInput
  hits: SearchHit[]
  seen: Set<string>
  spent: { bytes: number }
  started: number
  inScope(session: SessionId): boolean
}>

export const pageFull = (run: Run): boolean => run.hits.length >= run.input.pageSize

export const spentOut = (run: Run): boolean =>
  run.deps.now() - run.started >= run.input.limits.timeBudgetMs ||
  run.spent.bytes >= run.input.limits.scanBytes

export function inWindow(window: CompiledQuery['window'], at: number): boolean {
  return (window.from === null || at >= window.from) && (window.to === null || at <= window.to)
}

/** What a search asks the index for: the same question for every batch, further down each time. */
export function candidatesAsk(
  input: SearchInput,
  generation: number,
  before: DocId | null,
  known: CoverStamp | null,
): CandidateRequest {
  const { query, tenant } = input
  const sessions = query.scope.kind === 'sessions' ? query.scope.sessions : null
  const limit = input.limits.candidateBatch
  return {
    tenant,
    generation,
    plan: query.plan,
    sessions,
    window: query.window,
    before,
    limit,
    known,
  }
}
