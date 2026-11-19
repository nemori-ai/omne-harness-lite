import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { SessionId, SessionRevision } from '@omne-harness/session-contract'
import type { FrozenCover, SearchCursor } from './cursor.ts'
import type { SearchHit } from './hit.ts'
import type { Candidates, IndexState, Progress } from './index-port.ts'
import type { LoggedSession } from './log-port.ts'
import type { CompiledQuery } from './query.ts'
import {
  candidatesAsk,
  pageFull,
  type Run,
  type SearchDeps,
  type SearchInput,
} from './search-run.ts'
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

function scopeOf(query: CompiledQuery, sessions: readonly LoggedSession[]) {
  const named = query.scope.kind === 'sessions' ? new Set(query.scope.sessions) : null
  const archived = new Map(sessions.map(item => [item.session, item.archived]))
  return (session: SessionId): boolean => {
    if (named !== null && !named.has(session)) return false
    return query.archived === 'all' || archived.get(session) === (query.archived === 'archived')
  }
}

function behindOf(
  sessions: readonly LoggedSession[],
  covered: Candidates['covered'] | undefined,
): FrozenCover[] {
  const behind: FrozenCover[] = []
  for (const { session, tail } of sessions) {
    const cover = covered?.get(session) ?? { through: '0' as SessionRevision, at: 0 }
    if (BigInt(tail) > BigInt(cover.through)) behind.push([session, cover.through, cover.at])
  }
  return behind
}

type Opened = Readonly<{
  state: IndexState
  index: Readonly<{ generation: number; first: Candidates }> | null
  sessions: readonly LoggedSession[]
}>

// Covers and first candidates in one index read, the log heads after it: a sound cover is behind them.
async function open(deps: SearchDeps, input: SearchInput): Promise<Outcome<Opened, SearchFailure>> {
  const { cursor, tenant } = input
  const state = await deps.index.state(tenant)
  if (state.kind === 'broken') return fail('index-broken')
  const generation = state.kind === 'absent' ? null : state.generation
  if (cursor !== null && (cursor.generation !== generation || cursor.query !== input.digest))
    return fail('cursor-stale')
  let index: Opened['index'] = null
  if (generation !== null) {
    const before = cursor?.before ?? null
    const found = await deps.index.candidates(candidatesAsk(input, generation, before))
    if ('failure' in found) {
      const gone = found.failure === 'generation-gone' && cursor !== null
      return fail(gone ? 'cursor-stale' : 'unavailable')
    }
    index = { generation, first: found.ok }
  }
  const listed = await deps.log.sessions(tenant)
  if ('failure' in listed) return fail('unavailable')
  for (const { session, tail } of listed.ok) {
    const cover = index?.first.covered.get(session)
    if (cover !== undefined && BigInt(cover.through) > BigInt(tail)) return fail('index-broken')
  }
  return succeed({ state, index, sessions: listed.ok })
}

type Ends = Readonly<{
  tail: Extract<TailEnd, { kind: 'done' | 'stopped' }>
  walk: Extract<WalkEnd, { kind: 'done' | 'stopped' }> | null
}>

function pageOf(run: Run, opened: Opened, frozen: readonly FrozenCover[], ends: Ends): SearchPage {
  const { digest, limits } = run.input
  const { state, index } = opened
  const progress = state.kind === 'rebuilding' ? state.progress : null
  const page = (next: SearchCursor | null, incomplete: Incomplete | null): SearchPage => ({
    hits: run.hits,
    next,
    complete: incomplete === null,
    incomplete,
  })
  const { tail, walk } = ends
  if (index === null) {
    if (tail.kind === 'done') return page(null, null)
    const total = opened.sessions.length
    const built = progress ?? { indexed: 0, total }
    return page(null, { reason: 'rebuilding', behind: tail.left, progress: built })
  }
  // A page that stops with a way on is through; one that spent its budget, or has no way on, is not.
  const onward = (
    rest: Pick<SearchCursor, 'tail' | 'before' | 'last'>,
    spent: boolean,
    short: Pick<Incomplete, 'reason' | 'behind'>,
  ): SearchPage => {
    const carried = frozen.length <= limits.maxFrozen
    const next = carried ? { query: digest, generation: index.generation, frozen, ...rest } : null
    return page(next, spent || next === null ? { ...short, progress } : null)
  }
  if (tail.kind === 'stopped') {
    const short = { reason: 'tail-budget', behind: tail.left } as const
    return onward({ tail: tail.resume, before: null, last: null }, tail.spent, short)
  }
  const short = { reason: 'budget', behind: 0 } as const
  if (walk === null) {
    // The tails filled the page: the walk begins with the next one, if the index has anything.
    if (index.first.rows.length === 0) return page(null, null)
    return onward({ tail: null, before: null, last: null }, false, short)
  }
  if (walk.kind === 'done') return page(null, null)
  return onward({ tail: null, before: walk.before, last: walk.last }, walk.spent, short)
}

export async function searchHistory(
  deps: SearchDeps,
  input: SearchInput,
): Promise<Outcome<SearchPage, SearchFailure>> {
  const opened = await open(deps, input)
  if ('failure' in opened) return opened
  const { index, sessions } = opened.ok
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
  const inRange = sessions.filter(item => inScope(item.session))
  const frozen = cursor?.frozen ?? behindOf(inRange, index?.first.covered)
  const from = cursor === null ? (frozen.length > 0 ? 'start' : null) : cursor.tail
  const tail: TailEnd = from === null ? { kind: 'done' } : await scanTails(run, frozen, from)
  if (tail.kind === 'unavailable') return fail('unavailable')
  if (tail.kind === 'stale') return fail('cursor-stale')
  let walk: Ends['walk'] = null
  if (tail.kind === 'done' && index !== null && !pageFull(run)) {
    const { generation, first } = index
    const last = cursor?.last ?? null
    const walked = await walkIndex(run, { generation, first: first.rows, frozen, last })
    if (walked.kind === 'unavailable') return fail('unavailable')
    if (walked.kind === 'stale') return fail(cursor === null ? 'unavailable' : 'cursor-stale')
    walk = walked
  }
  return succeed(pageOf(run, opened.ok, frozen, { tail, walk }))
}
