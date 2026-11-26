import type { ExitId } from './body.ts'
import type {
  Attendance,
  GoalOutcome,
  GoalState,
  GoalStatus,
  Pause,
  SetGoalState,
} from './state.ts'
import type { Verdict } from './verdict.ts'

type Active = Extract<GoalState, { status: 'active' }>
type Paused = Extract<GoalState, { status: 'paused' }>
type Live = Active | Paused

/** What happens to a goal: one event is one column of the table in the specification. */
export type GoalEvent =
  | Readonly<{ kind: 'set'; attendance: Attendance }>
  | Readonly<{ kind: 'revise'; confirmed: boolean }>
  | Readonly<{ kind: 'pause' | 'resume' | 'cancel' | 'abort' }>
  | Readonly<{ kind: 'settle-by-exit'; exit: ExitId; counts: 'success' | 'failure' }>
  | Readonly<{
      kind: 'observe'
      /** The goal, revision and round the observation began on. */
      at: Readonly<{ generation: number; revision: number; rounds: number }>
      verdict: Verdict
    }>
export type GoalEventKind = GoalEvent['kind']

/** What the caller does once the write stood: let the round end or not, and what to send. */
export type Effect = 'wake' | 'pass' | 'veto' | 'continue' | 'reobserve' | 'tell-person'
export type Refusal =
  | 'no-live-goal'
  | 'goal-in-progress'
  | 'nobody-attends'
  | 'attended'
  | 'not-its-cause'
export type Transition =
  | Readonly<{ kind: 'changed'; next: SetGoalState; effects: readonly Effect[] }>
  | Readonly<{ kind: 'unchanged'; effects: readonly Effect[] }>
  | Readonly<{ kind: 'refused'; reason: Refusal }>

const SAME: Transition = { kind: 'unchanged', effects: [] }
const PASS: Transition = { kind: 'unchanged', effects: ['pass'] }
const refused = (reason: Refusal): Transition => ({ kind: 'refused', reason })
const NO_LIVE = refused('no-live-goal')
const to = (next: SetGoalState, ...effects: Effect[]): Transition => ({
  kind: 'changed',
  next,
  effects,
})

const settle = (goal: Live, outcome: GoalOutcome): SetGoalState => ({
  status: 'settled',
  attendance: goal.attendance,
  generation: goal.generation,
  revision: goal.revision,
  rounds: goal.rounds,
  outcome,
})
const resumed = ({ pause: _pause, ...goal }: Paused): Active => ({ ...goal, status: 'active' })
/** A person's events have nobody to send them where nobody attends. */
const attended = (goal: Live, then: () => Transition): Transition =>
  goal.attendance === 'attended' ? then() : refused('nobody-attends')

function begin(state: GoalState, event: Extract<GoalEvent, { kind: 'set' }>): Transition {
  const next: Active = {
    status: 'active',
    attendance: event.attendance,
    generation: state.generation + 1,
    revision: 1,
    rounds: 0,
    stalled: 0,
    gap: null,
  }
  return to(next, 'wake')
}

const OUTCOME_OF: Readonly<Record<6 | 7 | 8, GoalOutcome>> = {
  6: { kind: 'unattainable' },
  7: { kind: 'stalled' },
  8: { kind: 'judge-unavailable' },
}

/** A current observation of an active goal, by the row of the verdict table it came to. */
function ruled(goal: Active, verdict: Verdict): Transition {
  if (verdict.row === 1) return to(settle(goal, { kind: 'achieved' }), 'pass')
  if (verdict.row === 9) {
    const { stalled, gap } = verdict
    return to({ ...goal, rounds: goal.rounds + 1, stalled, gap }, 'veto', 'continue')
  }
  const outcome: GoalOutcome =
    'exit' in verdict
      ? { kind: 'exit', exit: verdict.exit, counts: verdict.counts }
      : OUTCOME_OF[verdict.row]
  if (verdict.row < 5 || goal.attendance === 'unattended') return to(settle(goal, outcome), 'pass')
  const pause: Pause = {
    by: 'verdict',
    row: verdict.row as 5 | 6 | 7 | 8,
    exit: 'exit' in verdict ? verdict.exit : null,
  }
  return to({ ...goal, status: 'paused', pause }, 'pass', 'tell-person')
}

function observed(goal: Active, event: Extract<GoalEvent, { kind: 'observe' }>): Transition {
  const { at } = event
  const current =
    at.generation === goal.generation && at.revision === goal.revision && at.rounds === goal.rounds
  return current ? ruled(goal, event.verdict) : { kind: 'unchanged', effects: ['reobserve'] }
}

const abort = (goal: Live): Transition =>
  goal.attendance === 'attended' ? refused('attended') : to(settle(goal, { kind: 'aborted' }))

type Row<K extends GoalEventKind> = Readonly<{
  [S in GoalStatus]: (
    state: Extract<GoalState, { status: S }>,
    event: Extract<GoalEvent, { kind: K }>,
  ) => Transition
}>

const TABLE: { readonly [K in GoalEventKind]: Row<K> } = {
  set: {
    none: begin,
    active: () => refused('goal-in-progress'),
    paused: () => refused('goal-in-progress'),
    settled: begin,
  },
  revise: {
    none: () => NO_LIVE,
    active: goal => attended(goal, () => to({ ...goal, revision: goal.revision + 1 })),
    paused: (goal, event) =>
      attended(goal, () => {
        const next = { ...goal, revision: goal.revision + 1 }
        return event.confirmed ? to(resumed(next), 'wake') : to(next)
      }),
    settled: () => NO_LIVE,
  },
  pause: {
    none: () => NO_LIVE,
    active: goal =>
      attended(goal, () => to({ ...goal, status: 'paused', pause: { by: 'person' } })),
    paused: () => SAME,
    settled: () => NO_LIVE,
  },
  resume: {
    none: () => NO_LIVE,
    active: goal => attended(goal, () => SAME),
    paused: goal => attended(goal, () => to(resumed(goal), 'wake')),
    settled: () => NO_LIVE,
  },
  cancel: {
    none: () => SAME,
    active: goal => to(settle(goal, { kind: 'cancelled' })),
    paused: goal => to(settle(goal, { kind: 'cancelled' })),
    settled: () => SAME,
  },
  'settle-by-exit': {
    none: () => NO_LIVE,
    active: () => refused('not-its-cause'),
    paused: (goal, event) =>
      attended(goal, () =>
        goal.pause.by === 'verdict' && goal.pause.exit === event.exit
          ? to(settle(goal, { kind: 'exit', exit: event.exit, counts: event.counts }))
          : refused('not-its-cause'),
      ),
    settled: () => NO_LIVE,
  },
  observe: { none: () => PASS, active: observed, paused: () => PASS, settled: () => PASS },
  abort: { none: () => SAME, active: abort, paused: abort, settled: () => SAME },
}

/** The whole table: every state answers every event. The caller writes `next` under the revision it read. */
export function transition(state: GoalState, event: GoalEvent): Transition {
  const cell = TABLE[event.kind][state.status] as (state: GoalState, event: GoalEvent) => Transition
  return cell(state, event)
}
