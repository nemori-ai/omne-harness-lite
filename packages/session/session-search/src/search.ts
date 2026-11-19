import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { SessionId } from '@omne-harness/session-contract'
import type { FrozenCover, SearchCursor } from './cursor.ts'
import type { SearchHit } from './hit.ts'
import type { CandidateRow, CoverStamp, IndexState, Progress } from './index-port.ts'
import type { LoggedSession } from './log-port.ts'
import type { CompiledQuery } from './query.ts'
import { behindOf, headsOf, sameStamp, type Remembered } from './search-memo.ts'
import { candidatesAsk, type Run, type SearchDeps, type SearchInput } from './search-run.ts'
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

type Opened = Readonly<{
  state: IndexState
  index: Readonly<{ generation: number; stamp: CoverStamp; rows: readonly CandidateRow[] }> | null
  sessions: readonly LoggedSession[]
  behind: readonly FrozenCover[]
}>

async function headsNow(
  deps: SearchDeps,
  tenant: SearchInput['tenant'],
  held: Remembered | undefined,
): Promise<Pick<Remembered, 'heads' | 'sessions'> | null> {
  const stamp = await deps.log.stamp(tenant)
  if ('failure' in stamp) return null
  if (held !== undefined && sameStamp(held.heads, stamp.ok)) return held
  const listed = await deps.log.sessions(tenant)
  return 'failure' in listed ? null : { heads: headsOf(listed.ok), sessions: listed.ok }
}

// Covers and first candidates in one index read, the log heads after: a sound cover is behind them.
async function open(deps: SearchDeps, input: SearchInput): Promise<Outcome<Opened, SearchFailure>> {
  const { cursor, tenant } = input
  const state = await deps.index.state(tenant)
  if (state.kind === 'broken') return fail('index-broken')
  const generation = state.kind === 'absent' ? null : state.generation
  if (cursor !== null && (cursor.generation !== generation || cursor.query !== input.digest))
    return fail('cursor-stale')
  const held = deps.memo?.get(tenant)
  const known = held?.generation === generation ? held : undefined
  let index: Opened['index'] = null
  let covered: Remembered['covered'] | undefined
  if (generation !== null) {
    const ask = candidatesAsk(input, generation, cursor?.before ?? null, known?.stamp ?? null)
    const found = await deps.index.candidates(ask)
    if ('failure' in found) {
      const gone = found.failure === 'generation-gone' && cursor !== null
      return fail(gone ? 'cursor-stale' : 'unavailable')
    }
    covered = found.ok.covered ?? known?.covered
    if (covered === undefined) return fail('unavailable')
    index = { generation, stamp: found.ok.stamp, rows: found.ok.rows }
  }
  const logs = await headsNow(deps, tenant, held)
  if (logs === null) return fail('unavailable')
  const { heads, sessions } = logs
  const same = known !== undefined && covered === known.covered && sessions === known.sessions
  const behind = same ? known.behind : behindOf(sessions, covered)
  if (index !== null && covered !== undefined)
    deps.memo?.set(tenant, {
      generation: index.generation,
      stamp: index.stamp,
      covered,
      heads,
      sessions,
      behind,
    })
  if (behind === 'broken') return fail('index-broken')
  return succeed({ state, index, sessions, behind })
}

type Ends =
  | Readonly<{ tail: Extract<TailEnd, { kind: 'stopped' }> }>
  | Readonly<{
      tail: Readonly<{ kind: 'done' }>
      walk: Extract<WalkEnd, { kind: 'done' | 'stopped' }>
    }>

const THROUGH: Ends = { tail: { kind: 'done' }, walk: { kind: 'done' } }

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
  const { tail } = ends
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
  if (!('walk' in ends)) {
    const short = { reason: 'tail-budget', behind: ends.tail.left } as const
    return onward({ tail: ends.tail.resume, before: null, last: null }, ends.tail.spent, short)
  }
  const { walk } = ends
  if (walk.kind === 'done') return page(null, null)
  const short = { reason: 'budget', behind: 0 } as const
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
  const frozen = cursor?.frozen ?? opened.ok.behind.filter(([session]) => inScope(session))
  const from = cursor === null ? (frozen.length > 0 ? 'start' : null) : cursor.tail
  const tail: TailEnd = from === null ? { kind: 'done' } : await scanTails(run, frozen, from)
  if (tail.kind === 'unavailable') return fail('unavailable')
  if (tail.kind === 'stale') return fail('cursor-stale')
  if (tail.kind === 'stopped') return succeed(pageOf(run, opened.ok, frozen, { tail }))
  // The tails are through, and a page they had filled would have stopped in them: the walk goes on.
  if (index === null) return succeed(pageOf(run, opened.ok, frozen, THROUGH))
  const { generation, stamp, rows: first } = index
  const last = cursor?.last ?? null
  const walk = await walkIndex(run, { generation, stamp, first, frozen, last })
  if (walk.kind === 'unavailable') return fail('unavailable')
  if (walk.kind === 'stale') return fail(cursor === null ? 'unavailable' : 'cursor-stale')
  return succeed(pageOf(run, opened.ok, frozen, { tail, walk }))
}
