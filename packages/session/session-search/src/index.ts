export {
  BLOCK_SEPARATOR,
  DEFAULT_SEARCH_KINDS,
  EXTRACTION_VERSION,
  SEARCHABLE_KINDS,
  blocksOf,
  documentRow,
  documentsOf,
  isSearchableKind,
  kindMarker,
  searchableKindOf,
  visibilityMarker,
  type DocumentVisibility,
  type IndexDocument,
  type SearchableKind,
} from './extract.ts'
export {
  parseCursor,
  queryDigest,
  type FrozenCover,
  type SearchCursor,
  type TailPoint,
} from './cursor.ts'
export { foldText } from './fold.ts'
export { followSession, type FollowInput, type FollowStep } from './follow.ts'
export {
  createHistoryFollower,
  followTenant,
  type FollowLimits,
  type FollowPass,
  type FollowerOptions,
  type HistoryFollower,
} from './follower.ts'
export type {
  AppendRequest,
  CandidateRequest,
  CandidateRow,
  Candidates,
  Cover,
  CoverStamp,
  DocId,
  HistoryIndex,
  IndexFailure,
  IndexState,
  IndexedEntry,
  Progress,
} from './index-port.ts'
export type {
  Extracted,
  HistoryLogReader,
  Judged,
  LogPage,
  LogPoint,
  LogRange,
  LogStamp,
  LoggedSession,
} from './log-port.ts'
export type { SearchHit } from './hit.ts'
export { SNIPPET_CONTEXT, SNIPPET_MATCH, snippetOf, type Snippet } from './snippet.ts'
export { ANY, planAdmits, type GramPlan, type PlanLimits } from './plan.ts'
export {
  compileQuery,
  createJudge,
  matchEntry,
  type BlockMatch,
  type CompiledQuery,
  type JudgeSpec,
  type QueryLimits,
  type QueryRefusal,
  type SearchContent,
  type SearchQuery,
  type SearchScope,
  type Verdict,
} from './query.ts'
export type { Span } from './regex.ts'
export { createSearchMemo, type SearchMemo } from './search-memo.ts'
export type { SearchDeps, SearchInput, SearchLimits } from './search-run.ts'
export { searchHistory, type Incomplete, type SearchFailure, type SearchPage } from './search.ts'
export {
  createHistorySearch,
  type HistorySearch,
  type HistorySearchDeps,
  type HistorySearchFailure,
  type HistorySearchPage,
  type HistorySearchReply,
  type HistorySearchRequest,
  type SearchCursorSeal,
  type SearchPolicy,
} from './service.ts'
