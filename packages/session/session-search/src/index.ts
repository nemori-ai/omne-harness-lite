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
export type {
  AppendRequest,
  CandidateRequest,
  CandidateRow,
  Candidates,
  Cover,
  DocId,
  HistoryIndex,
  IndexFailure,
  IndexState,
  IndexedEntry,
  Progress,
} from './index-port.ts'
export type {
  EntryPage,
  HistoryLogReader,
  LogPoint,
  LoggedEntry,
  LoggedSession,
} from './log-port.ts'
export { SNIPPET_CONTEXT, SNIPPET_MATCH, snippetOf, type SearchHit, type Snippet } from './hit.ts'
export { ANY, planAdmits, type GramPlan, type PlanLimits } from './plan.ts'
export {
  compileQuery,
  matchEntry,
  type BlockMatch,
  type CompiledQuery,
  type QueryLimits,
  type QueryRefusal,
  type SearchContent,
  type SearchQuery,
  type SearchScope,
} from './query.ts'
export type { Span } from './regex.ts'
export type { SearchDeps, SearchInput, SearchLimits } from './search-run.ts'
export { searchHistory, type Incomplete, type SearchFailure, type SearchPage } from './search.ts'
