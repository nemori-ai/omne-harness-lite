import type { JsonValue } from '@omne-harness/json-text'
import type { BaselineEntry } from './cells.ts'

// What a cell measured, read from the product's own session diagnostics and history, and how it is
// judged. The numbers come from the product, so a run also checks the product's accounts.

export type TurnAttempt = Readonly<{
  /** The model that served the attempt, by route. */
  route: string
  reasoning: 'carried' | 'not-carried' | 'unknown'
  input: number | null
  cacheRead: number | null
  cacheWrite: number | null
  costUsd: number | null
}>

export type Turn = Readonly<{
  /** The model selected for the turn. */
  route: string
  /** The completed attempt that answered the turn; null when none did. */
  attempt: TurnAttempt | null
  /** Whether the reply of the turn kept a reasoning state to carry back. */
  replied: boolean
  dispatchCosts?: readonly (number | null)[]
}>

export type Measured = Readonly<{
  /** Cache read over all input, on the attempts after each model's first; null when none counts. */
  hitRate: number | null
  /** The attempts after a warm-up whose usage was complete enough to count. */
  counted: number
  /** Attempts that should have carried a reasoning state back and did not. */
  dropped: number
  costUsd: number | null
  /** Turns without a completed attempt, and attempts served by another model than selected. */
  unanswered: number
  misrouted: number
}>

export const HIT_FLOOR = 0.5
export const HIT_TOLERANCE = 0.15

export function measure(turns: readonly Turn[]): Measured {
  const warmed = new Set<string>()
  const keeping = new Set<string>()
  let read = 0
  let whole = 0
  let counted = 0
  let dropped = 0
  let costUsd: number | null = 0
  let unanswered = 0
  let misrouted = 0
  for (const turn of turns) {
    const attempt = turn.attempt
    const costs = turn.dispatchCosts ?? [attempt?.costUsd ?? null]
    for (const cost of costs)
      costUsd =
        costUsd === null || cost === null || !Number.isFinite(cost) || cost < 0
          ? null
          : costUsd + cost
    if (attempt === null) {
      unanswered += 1
      continue
    }
    if (attempt.route !== turn.route) misrouted += 1
    const { input, cacheRead, cacheWrite } = attempt
    if (warmed.has(turn.route) && input !== null && cacheRead !== null && cacheWrite !== null) {
      read += cacheRead
      whole += input + cacheRead + cacheWrite
      counted += 1
    }
    warmed.add(turn.route)
    if (keeping.has(turn.route) && attempt.reasoning !== 'carried') dropped += 1
    if (turn.replied) keeping.add(turn.route)
  }
  return {
    hitRate: whole === 0 ? null : read / whole,
    counted,
    dropped,
    costUsd,
    unanswered,
    misrouted,
  }
}

/** A cell starts only while what was spent plus the dearest cell so far stays within the budget. */
export function fitsBudget(
  spentUsd: number | null,
  dearestUsd: number,
  budgetUsd: number,
): boolean {
  return (
    spentUsd !== null &&
    Number.isFinite(spentUsd) &&
    Number.isFinite(dearestUsd) &&
    spentUsd >= 0 &&
    dearestUsd >= 0 &&
    spentUsd + dearestUsd <= budgetUsd
  )
}

/** Why a cell is red; empty when it is green. */
export function judge(measured: Measured, expected: BaselineEntry | undefined): readonly string[] {
  const reasons: string[] = []
  if (measured.costUsd === null) reasons.push('billable cost is unknown')
  if (measured.unanswered > 0)
    reasons.push(`${measured.unanswered} turn(s) got no completed answer`)
  if (measured.misrouted > 0) reasons.push(`${measured.misrouted} attempt(s) ran on another model`)
  if (measured.dropped > 0) reasons.push(`${measured.dropped} reasoning state(s) were not carried`)
  const rate = measured.hitRate
  if (rate !== null && rate < HIT_FLOOR)
    reasons.push(`cache hit rate ${rate.toFixed(3)} is under the floor ${HIT_FLOOR}`)
  const was = expected?.hitRate ?? null
  if (rate !== null && was !== null && rate < was - HIT_TOLERANCE)
    reasons.push(`cache hit rate ${rate.toFixed(3)} fell from the expected ${was.toFixed(3)}`)
  return reasons
}

// The shapes below are the parts of the diagnostics and history answers this file reads.

type Amount = Readonly<{
  name?: string
  source?: string
  state: string
  lexeme: string | null
}>
type AttemptView = Readonly<{
  adapter: Readonly<{ name: string }>
  outcome: Readonly<{ kind: string }>
  reasoning?: string
  account: Readonly<{ kind: string; usage?: readonly Amount[]; cost?: readonly Amount[] }>
}>
export type RunView = Readonly<{
  started: Readonly<{ position: string }>
  modelCalls: readonly Readonly<{ dispatches: readonly AttemptView[] }>[]
}>
export type EntryView = Readonly<{ kind: string; payload: JsonValue }>

function known(amounts: readonly Amount[] | undefined, pick: (amount: Amount) => boolean) {
  const amount = amounts?.find(pick)
  if (amount?.state !== 'known' || amount.lexeme === null || amount.lexeme.trim() === '')
    return null
  const value = Number(amount.lexeme)
  return Number.isFinite(value) && value >= 0 ? value : null
}

function attemptOf(view: AttemptView): TurnAttempt {
  const usage = view.account.kind === 'account' ? view.account.usage : undefined
  const cost = view.account.kind === 'account' ? view.account.cost : undefined
  const reasoning = view.reasoning
  return {
    route: view.adapter.name,
    reasoning: reasoning === 'carried' || reasoning === 'not-carried' ? reasoning : 'unknown',
    input: known(usage, amount => amount.name === 'input'),
    cacheRead: known(usage, amount => amount.name === 'cache-read'),
    cacheWrite: known(usage, amount => amount.name === 'cache-write'),
    costUsd: known(cost, amount => amount.source === 'billable'),
  }
}

function member(tree: JsonValue | undefined, key: string): JsonValue | undefined {
  return tree?.kind === 'object' ? tree.entries.find(entry => entry.key === key)?.value : undefined
}

function replied(entry: EntryView): boolean {
  const replay = member(member(entry.payload, 'message'), 'replay')
  const positions = member(replay, 'at')
  return positions?.kind === 'array' && positions.items.length > 0
}

/**
 * Pairs each selected route with the Run that answered it: Runs in the order they started and the
 * last completed attempt of each; the history split at each Run's terminal, and the last reply of
 * each part.
 */
export function turnsOf(
  routes: readonly string[],
  runs: readonly RunView[],
  history: readonly EntryView[],
): readonly Turn[] {
  const ordered = [...runs].sort((left, right) =>
    Number(BigInt(left.started.position) - BigInt(right.started.position)),
  )
  const parts: EntryView[][] = [[]]
  for (const entry of history) {
    parts.at(-1)?.push(entry)
    if (entry.kind === 'run.terminal') parts.push([])
  }
  return routes.map((route, index) => {
    const dispatches = (ordered[index]?.modelCalls ?? []).flatMap(call => call.dispatches)
    const completed = dispatches.filter(view => view.outcome.kind === 'completed')
    const last = completed.at(-1)
    const reply = (parts[index] ?? []).filter(entry => entry.kind === 'message.assistant').at(-1)
    return {
      route,
      dispatchCosts: dispatches.map(view => attemptOf(view).costUsd),
      attempt: last === undefined ? null : attemptOf(last),
      replied: reply !== undefined && replied(reply),
    }
  })
}
