import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { SessionId, SessionRevision } from '@omne-harness/session-contract'
import type { FrozenCover, SearchCursor } from './cursor.ts'
import type { SearchHit } from './hit.ts'
import type { Candidates, IndexState, Progress } from './index-port.ts'
import type { LoggedSession } from './log-port.ts'
import type { CompiledQuery } from './query.ts'
import { pageFull, spentOut, type Run, type SearchDeps, type SearchInput } from './search-run.ts'
import { scanTails, type TailEnd } from './search-tail.ts'
import { walkIndex, type WalkEnd } from './search-walk.ts'

// One page of a search. The index names candidates and the log decides: each is read back and
// matched, and what the index has not reached is scanned. What was not looked at is said.

export type Incomplete = Readonly<{
  reason: 'budget' | 'tail-budget' | 'rebuilding'
  behind: number
  progress: Progress | null
}>

export type SearchPage = Readonly<{
  hits: readonly SearchHit[]
  next: SearchCursor | null
  /** False: something in range was not looked at; `incomplete` says what. */
  complete: boolean
  incomplete: Incomplete | null
}>

export type SearchFailure = 'unavailable' | 'index-broken' | 'cursor-stale'

function generationOf(state: IndexState): number | null {
  return state.kind === 'ready' || state.kind === 'rebuilding' ? state.generation : null
}

function scopeOf(query: CompiledQuery, sessions: readonly LoggedSession[]) {
  const named = query.scope.kind === 'sessions' ? new Set(query.scope.sessions) : null
  const archived = new Map(sessions.map(item => [item.session, item.archived]))
  return (session: SessionId): boolean => {
    const state = archived.get(session)
    if (state === undefined || (named !== null && !named.has(session))) return false
    return query.archived === 'all' || state === (query.archived === 'archived')
  }
}

function behindOf(
  sessions: readonly LoggedSession[],
  covered: Candidates['covered'],
): FrozenCover[] {
  const behind: FrozenCover[] = []
  for (const { session, tail } of sessions) {
    const cover = covered.get(session)
    const through = cover?.through ?? ('0' as SessionRevision)
    if (BigInt(tail) > BigInt(through)) behind.push([session, through, cover?.at ?? 0])
  }
  return behind.sort((left, right) => (left[0] < right[0] ? -1 : 1))
}

type Opened = Readonly<{
  state: IndexState
  generation: number | null
  first: Candidates
  sessions: readonly LoggedSession[]
}>

// Covers and first candidates in one index read, the log heads after it: a sound cover is behind them.
async function open(deps: SearchDeps, input: SearchInput): Promise<Outcome<Opened, SearchFailure>> {
  const { cursor, query, tenant } = input
  const state = await deps.index.state(tenant)
  if (state.kind === 'broken') return fail('index-broken')
  const generation = generationOf(state)
  if (cursor !== null && (cursor.generation !== generation || cursor.query !== input.digest))
    return fail('cursor-stale')
  let first: Candidates = { covered: new Map(), rows: [] }
  if (generation !== null) {
    const found = await deps.index.candidates({
      tenant,
      generation,
      plan: query.plan,
      sessions: query.scope.kind === 'sessions' ? query.scope.sessions : null,
      window: query.window,
      before: cursor?.before ?? null,
      limit: input.limits.candidateBatch,
    })
    if ('failure' in found) {
      const gone = found.failure === 'generation-gone' && cursor !== null
      return fail(gone ? 'cursor-stale' : 'unavailable')
    }
    first = found.ok
  }
  const listed = await deps.log.sessions(tenant)
  if ('failure' in listed) return fail('unavailable')
  for (const { session, tail } of listed.ok)
    if (BigInt(first.covered.get(session)?.through ?? '0') > BigInt(tail))
      return fail('index-broken')
  return succeed({ state, generation, first, sessions: listed.ok })
}

type Ends = Readonly<{
  tail: Extract<TailEnd, { kind: 'done' | 'stopped' }>
  walk: WalkEnd | null
}>

function pageOf(run: Run, opened: Opened, frozen: readonly FrozenCover[], ends: Ends): SearchPage {
  const { cursor, digest, limits } = run.input
  const { generation, state } = opened
  const progress = state.kind === 'rebuilding' ? state.progress : null
  const page = (next: SearchCursor | null, incomplete: Incomplete | null): SearchPage => ({
    hits: run.hits,
    next,
    complete: incomplete === null,
    incomplete,
  })
  const { tail, walk } = ends
  if (generation === null) {
    // No generation to bind a cursor to: the logs were scanned, wholly or not.
    if (tail.kind === 'done') return page(null, null)
    const total = opened.sessions.length
    return page(null, {
      reason: 'rebuilding',
      behind: tail.left,
      progress: progress ?? { indexed: 0, total },
    })
  }
  const cursorOf = (rest: Pick<SearchCursor, 'tail' | 'before' | 'last'>): SearchCursor | null =>
    frozen.length <= limits.maxFrozen ? { query: digest, generation, frozen, ...rest } : null
  const carried = { before: cursor?.before ?? null, last: cursor?.last ?? null }
  if (tail.kind === 'stopped') {
    const next = cursorOf({ tail: tail.resume, ...carried })
    const said = tail.why === 'budget' || next === null
    return page(next, said ? { reason: 'tail-budget', behind: tail.left, progress } : null)
  }
  // The walk did not run: the tails filled the page or spent the budget.
  const end: WalkEnd =
    walk ??
    (opened.first.rows.length === 0
      ? { kind: 'done' }
      : { kind: 'stopped', why: pageFull(run) ? 'full' : 'budget', ...carried })
  if (end.kind !== 'stopped') return page(null, null)
  const next = cursorOf({ tail: null, before: end.before, last: end.last })
  const said = end.why === 'budget' || next === null
  return page(next, said ? { reason: 'budget', behind: 0, progress } : null)
}

export async function searchHistory(
  deps: SearchDeps,
  input: SearchInput,
): Promise<Outcome<SearchPage, SearchFailure>> {
  const opened = await open(deps, input)
  if ('failure' in opened) return opened
  const { first, generation, sessions } = opened.ok
  const { cursor } = input
  const inScope = scopeOf(input.query, sessions)
  const run: Run = {
    deps,
    input,
    hits: [],
    seen: new Set(),
    spent: { bytes: 0 },
    started: deps.now(),
    inScope,
  }
  const frozen =
    cursor?.frozen ??
    behindOf(
      sessions.filter(item => inScope(item.session)),
      first.covered,
    )
  const from = cursor === null ? (frozen.length > 0 ? 'start' : null) : cursor.tail
  const tail: TailEnd = from === null ? { kind: 'done' } : await scanTails(run, frozen, from)
  if (tail.kind === 'unavailable') return fail('unavailable')
  if (tail.kind === 'stale') return fail('cursor-stale')
  let walk: WalkEnd | null = null
  if (tail.kind === 'done' && generation !== null && !pageFull(run) && !spentOut(run)) {
    const start = { generation, first, frozen, before: cursor?.before ?? null }
    walk = await walkIndex(run, { ...start, last: cursor?.last ?? null })
    if (walk.kind === 'unavailable') return fail('unavailable')
    if (walk.kind === 'stale') return fail(cursor === null ? 'unavailable' : 'cursor-stale')
  }
  return succeed(pageOf(run, opened.ok, frozen, { tail, walk }))
}
