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
export { foldText } from './fold.ts'
export type {
  AppendRequest,
  CandidateRequest,
  CandidateRow,
  Candidates,
  DocId,
  HistoryIndex,
  IndexFailure,
  IndexState,
  Progress,
} from './index-port.ts'
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
