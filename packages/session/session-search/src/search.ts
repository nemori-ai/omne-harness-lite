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

type Indexed = Readonly<{
  index: NonNullable<Opened['index']>
  covered: Remembered['covered']
}>

const staleFor = (cursor: SearchCursor | null, generation: number | null, digest: string) =>
  cursor !== null && (cursor.generation !== generation || cursor.query !== digest)

async function firstCandidates(
  deps: SearchDeps,
  input: SearchInput,
  generation: number,
  known: Remembered | undefined,
): Promise<Outcome<Indexed, SearchFailure>> {
  const { cursor } = input
  const ask = candidatesAsk(input, generation, cursor?.before ?? null, known?.stamp ?? null)
  const found = await deps.index.candidates(ask)
  if ('failure' in found) {
    const gone = found.failure === 'generation-gone' && cursor !== null
    return fail(gone ? 'cursor-stale' : 'unavailable')
  }
  const covered = found.ok.covered ?? known?.covered
  if (covered === undefined) return fail('unavailable')
  return succeed({ index: { generation, stamp: found.ok.stamp, rows: found.ok.rows }, covered })
}

function lagOf(
  known: Remembered | undefined,
  covered: Remembered['covered'] | undefined,
  sessions: readonly LoggedSession[],
) {
  const same = known !== undefined && covered === known.covered && sessions === known.sessions
  return same ? known.behind : behindOf(sessions, covered)
}

type IndexSide = Readonly<{
  held: Remembered | undefined
  known: Remembered | undefined
  found: Indexed | null
}>

async function readIndex(
  deps: SearchDeps,
  input: SearchInput,
  state: Exclude<IndexState, { kind: 'broken' }>,
): Promise<Outcome<IndexSide, SearchFailure>> {
  const generation = state.kind === 'absent' ? null : state.generation
  if (staleFor(input.cursor, generation, input.digest)) return fail('cursor-stale')
  const held = deps.memo?.get(input.tenant)
  const known = held?.generation === generation ? held : undefined
  if (generation === null) return succeed({ held, known, found: null })
  const indexed = await firstCandidates(deps, input, generation, known)
  return 'failure' in indexed ? indexed : succeed({ held, known, found: indexed.ok })
}

// The index is read first and the log heads after: a sound cover is behind them.
async function open(deps: SearchDeps, input: SearchInput): Promise<Outcome<Opened, SearchFailure>> {
  const { tenant } = input
  const state = await deps.index.state(tenant)
  if (state.kind === 'broken') return fail('index-broken')
  const read = await readIndex(deps, input, state)
  if ('failure' in read) return read
  const { held, known, found } = read.ok
  const logs = await headsNow(deps, tenant, held)
  if (logs === null) return fail('unavailable')
  const { heads, sessions } = logs
  if (found === null) {
    const behind = lagOf(known, undefined, sessions)
    return behind === 'broken'
      ? fail('index-broken')
      : succeed({ state, index: null, sessions, behind })
  }
  const { index, covered } = found
  const behind = lagOf(known, covered, sessions)
  const { generation, stamp } = index
  deps.memo?.set(tenant, { generation, stamp, covered, heads, sessions, behind })
  return behind === 'broken' ? fail('index-broken') : succeed({ state, index, sessions, behind })
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

const runOf = (deps: SearchDeps, input: SearchInput, inScope: Run['inScope']): Run => ({
  deps,
  input,
  hits: [],
  seen: new Set(),
  spent: { bytes: 0 },
  started: deps.now(),
  inScope,
})

function tailsOf(run: Run, frozen: readonly FrozenCover[]): TailEnd | Promise<TailEnd> {
  const { cursor } = run.input
  const from = cursor === null ? (frozen.length > 0 ? 'start' : null) : cursor.tail
  return from === null ? { kind: 'done' } : scanTails(run, frozen, from)
}

// The tails are through, and a page they had filled would have stopped in them: the walk goes on.
async function walkPart(
  run: Run,
  opened: Opened,
  frozen: readonly FrozenCover[],
): Promise<Outcome<SearchPage, SearchFailure>> {
  const { index } = opened
  if (index === null) return succeed(pageOf(run, opened, frozen, THROUGH))
  const { cursor } = run.input
  const { generation, stamp, rows: first } = index
  const walk = await walkIndex(run, {
    generation,
    stamp,
    first,
    frozen,
    last: cursor?.last ?? null,
  })
  if (walk.kind === 'unavailable') return fail('unavailable')
  if (walk.kind === 'stale') return fail(cursor === null ? 'unavailable' : 'cursor-stale')
  return succeed(pageOf(run, opened, frozen, { tail: { kind: 'done' }, walk }))
}

export async function searchHistory(
  deps: SearchDeps,
  input: SearchInput,
): Promise<Outcome<SearchPage, SearchFailure>> {
  const opened = await open(deps, input)
  if ('failure' in opened) return opened
  const inScope = scopeOf(input.query, opened.ok.sessions)
  const run = runOf(deps, input, inScope)
  const frozen = input.cursor?.frozen ?? opened.ok.behind.filter(([session]) => inScope(session))
  const tail = await tailsOf(run, frozen)
  if (tail.kind === 'unavailable') return fail('unavailable')
  if (tail.kind === 'stale') return fail('cursor-stale')
  if (tail.kind === 'stopped') return succeed(pageOf(run, opened.ok, frozen, { tail }))
  return walkPart(run, opened.ok, frozen)
}
