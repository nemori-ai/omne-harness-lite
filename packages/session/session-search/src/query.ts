import type { HistoryEntry, SessionId } from '@omne-harness/session-contract'
import {
  DEFAULT_SEARCH_KINDS,
  SEARCHABLE_KINDS,
  blocksOf,
  isSearchableKind,
  kindMarker,
  searchableKindOf,
  visibilityMarker,
  type SearchableKind,
} from './extract.ts'
import { foldText } from './fold.ts'
import { ANY, and, or, planLiteral, type GramPlan, type PlanLimits } from './plan.ts'
import { compileRegex, type Span } from './regex.ts'
import { snippetOf, type Snippet } from './snippet.ts'

export type SearchScope =
  | Readonly<{ kind: 'tenant' }>
  | Readonly<{ kind: 'sessions'; sessions: readonly SessionId[] }>

export type SearchContent =
  | Readonly<{ kind: 'literals'; all: readonly string[]; caseSensitive: boolean }>
  | Readonly<{ kind: 'regex'; pattern: string; caseSensitive: boolean }>

export type SearchQuery = Readonly<{
  scope: SearchScope
  archived: 'unarchived' | 'archived' | 'all'
  /** Commit time in epoch milliseconds, inclusive; null: open on that side. */
  from: number | null
  to: number | null
  kinds: readonly SearchableKind[]
  modelReadable: 'only' | 'any'
  content: SearchContent
}>

export type QueryRefusal =
  | 'empty-literal'
  | 'too-many-literals'
  | 'literal-too-long'
  | 'pattern-too-long'
  | 'pattern-invalid'
  | 'pattern-too-large'
  | 'too-many-sessions'
  | 'kind-unknown'
  | 'window-invalid'

export type QueryLimits = PlanLimits &
  Readonly<{
    maxLiterals: number
    maxLiteralLength: number
    maxPatternLength: number
    maxProgramSize: number
    maxScopeSessions: number
  }>

/** What decides whether an entry matches, as plain data: it goes to wherever the log bytes are. */
export type JudgeSpec = Readonly<{
  content: SearchContent
  kinds: readonly SearchableKind[]
  modelReadable: 'only' | 'any'
  limits: QueryLimits
}>

export type CompiledQuery = Readonly<{
  spec: JudgeSpec
  plan: GramPlan
  kinds: ReadonlySet<SearchableKind>
  modelReadable: 'only' | 'any'
  scope: SearchScope
  archived: SearchQuery['archived']
  window: Readonly<{ from: number | null; to: number | null }>
  /** The first match in one block, or null. Linear in the block for every query. */
  matches(block: string): Span | null
}>

type Matcher = Readonly<{ plan: GramPlan; matches(block: string): Span | null }>

function literalMatcher(
  content: Extract<SearchContent, { kind: 'literals' }>,
  limits: QueryLimits,
): Matcher | QueryRefusal {
  if (content.all.length === 0 || content.all.some(literal => literal === ''))
    return 'empty-literal'
  if (content.all.length > limits.maxLiterals) return 'too-many-literals'
  if (content.all.some(literal => literal.length > limits.maxLiteralLength))
    return 'literal-too-long'
  const wanted = content.caseSensitive ? content.all : content.all.map(foldText)
  return {
    plan: and(content.all.map(literal => planLiteral(literal, limits))),
    matches(block) {
      const text = content.caseSensitive ? block : foldText(block)
      let first: Span | null = null
      for (const literal of wanted) {
        const start = text.indexOf(literal)
        if (start < 0) return null
        if (first === null || start < first.start) first = { start, end: start + literal.length }
      }
      return first
    },
  }
}

function regexMatcher(
  content: Extract<SearchContent, { kind: 'regex' }>,
  limits: QueryLimits,
): Matcher | QueryRefusal {
  if (content.pattern.length > limits.maxPatternLength) return 'pattern-too-long'
  const compiled = compileRegex(content, limits)
  if (typeof compiled === 'string') return compiled
  return { plan: compiled.plan, matches: block => compiled.find(block) }
}

function validWindow(query: SearchQuery): boolean {
  const fine = (at: number | null) => at === null || (Number.isSafeInteger(at) && at >= 0)
  return (
    fine(query.from) &&
    fine(query.to) &&
    !(query.from !== null && query.to !== null && query.from > query.to)
  )
}

function filterPlan(
  kinds: ReadonlySet<SearchableKind>,
  modelReadable: 'only' | 'any',
  limits: PlanLimits,
): GramPlan {
  const byKind =
    kinds.size === SEARCHABLE_KINDS.length
      ? ANY
      : or(
          [...kinds].map(kind => ({ kind: 'gram', gram: kindMarker(kind) })),
          limits,
        )
  const byVisibility: GramPlan =
    modelReadable === 'only' ? { kind: 'gram', gram: visibilityMarker('model') } : ANY
  return and([byKind, byVisibility])
}

export function compileQuery(
  query: SearchQuery,
  limits: QueryLimits,
): CompiledQuery | QueryRefusal {
  if (query.kinds.some(kind => !isSearchableKind(kind))) return 'kind-unknown'
  if (!validWindow(query)) return 'window-invalid'
  if (query.scope.kind === 'sessions' && query.scope.sessions.length > limits.maxScopeSessions)
    return 'too-many-sessions'
  const matcher =
    query.content.kind === 'literals'
      ? literalMatcher(query.content, limits)
      : regexMatcher(query.content, limits)
  if (typeof matcher === 'string') return matcher
  const kinds = new Set(query.kinds.length === 0 ? DEFAULT_SEARCH_KINDS : query.kinds)
  const { content, modelReadable } = query
  return {
    spec: { content, kinds: [...kinds], modelReadable, limits },
    plan: and([matcher.plan, filterPlan(kinds, query.modelReadable, limits)]),
    kinds,
    modelReadable: query.modelReadable,
    scope: query.scope,
    archived: query.archived,
    window: { from: query.from, to: query.to },
    matches: matcher.matches,
  }
}

export type BlockMatch = Readonly<{ kind: SearchableKind; block: string; span: Span }>

/** The match of a query in one log entry: its first matching block, or null. One hit per entry. */
export function matchEntry(query: CompiledQuery, entry: HistoryEntry): BlockMatch | null {
  const kind = searchableKindOf(entry)
  if (kind === null || !query.kinds.has(kind)) return null
  for (const block of blocksOf(entry, query.modelReadable)) {
    const span = query.matches(block)
    if (span !== null) return { kind, block, span }
  }
  return null
}

export type Verdict = Readonly<{ kind: SearchableKind; snippet: Snippet }>

// Judges entries as the search does, from a spec alone: built where the entries are read, so
// that only verdicts travel. Null: the spec is not one a query compiles to.
export function createJudge(spec: JudgeSpec): ((entry: HistoryEntry) => Verdict | null) | null {
  const { content, kinds, modelReadable, limits } = spec
  const query = compileQuery(
    {
      scope: { kind: 'tenant' },
      archived: 'all',
      from: null,
      to: null,
      kinds,
      modelReadable,
      content,
    },
    limits,
  )
  if (typeof query === 'string') return null
  return entry => {
    const match = matchEntry(query, entry)
    return match === null ? null : { kind: match.kind, snippet: snippetOf(match) }
  }
}
