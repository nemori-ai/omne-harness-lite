import type { Dispatch, DispatchFailure, DispatchState, Instant, Report, Stop } from './values.ts'

/** What happens to a dispatch: one event is one row of the table in the specification. */
export type DispatchEvent =
  | Readonly<{ kind: 'session-created' }>
  | Readonly<{ kind: 'session-failed'; detail: string }>
  | Readonly<{ kind: 'report'; text: string }>
  | Readonly<{ kind: 'run-ended'; reply: string }>
  | Readonly<{ kind: 'run-failed'; cause: 'run-failed' | 'run-cancelled'; detail: string }>
  | Readonly<{ kind: 'withdraw' }>
  | Readonly<{ kind: 'dispatcher-archived' }>
export type DispatchEventKind = DispatchEvent['kind']

export type TransitionRefusal =
  | 'not-started'
  | 'already-reported'
  | 'failed'
  | 'withdrawn'
  | 'no-report-in-this-mode'
  | 'cannot-withdraw-a-handoff'
  | 'unreachable'

export type Transition =
  | Readonly<{ kind: 'changed'; next: Dispatch }>
  | Readonly<{ kind: 'recalled' }>
  | Readonly<{ kind: 'unchanged' }>
  | Readonly<{ kind: 'refused'; reason: TransitionRefusal }>

const RECALLED: Transition = Object.freeze({ kind: 'recalled' })
const UNCHANGED: Transition = Object.freeze({ kind: 'unchanged' })
const refused = (reason: TransitionRefusal): Transition => ({ kind: 'refused', reason })
const UNREACHABLE = refused('unreachable')

type Cell = (dispatch: Dispatch, event: never, at: Instant) => Transition
type Row<K extends DispatchEventKind> = Readonly<
  Record<
    DispatchState,
    (dispatch: Dispatch, event: Extract<DispatchEvent, { kind: K }>, at: Instant) => Transition
  >
>

const to = (
  dispatch: Dispatch,
  at: Instant,
  change: Partial<Pick<Dispatch, 'state' | 'report' | 'failure' | 'stop' | 'delivery'>>,
): Transition => ({
  kind: 'changed',
  next: Object.freeze({ ...dispatch, ...change, changedAt: at }),
})

const PENDING = Object.freeze({ kind: 'pending' as const })

const reported = (dispatch: Dispatch, at: Instant, report: Report): Transition =>
  to(dispatch, at, { state: 'reported', report, delivery: PENDING })

const failed = (dispatch: Dispatch, at: Instant, failure: DispatchFailure): Transition =>
  to(dispatch, at, { state: 'failed', failure, delivery: PENDING })

const withdrawn = (dispatch: Dispatch, at: Instant, stop: Stop): Transition =>
  to(dispatch, at, { state: 'withdrawn', stop, delivery: PENDING })

const unchanged = (): Transition => UNCHANGED
const recalled = (): Transition => RECALLED
const unreachable = (): Transition => UNREACHABLE

const sessionCreated: Row<'session-created'> = {
  accepted: (dispatch, _event, at) =>
    dispatch.mode === 'handoff'
      ? to(dispatch, at, { state: 'handed-off', delivery: PENDING })
      : to(dispatch, at, { state: 'started' }),
  started: recalled,
  reported: unreachable,
  failed: unchanged,
  withdrawn: unchanged,
  'handed-off': recalled,
}

const sessionFailed: Row<'session-failed'> = {
  accepted: (dispatch, event, at) =>
    failed(dispatch, at, { cause: 'session-not-created', detail: event.detail }),
  started: unreachable,
  reported: unreachable,
  failed: recalled,
  withdrawn: unchanged,
  'handed-off': unreachable,
}

const report: Row<'report'> = {
  accepted: () => refused('not-started'),
  started: (dispatch, event, at) => reported(dispatch, at, { text: event.text, origin: 'report' }),
  reported: (dispatch, event) =>
    dispatch.report?.text === event.text ? RECALLED : refused('already-reported'),
  failed: () => refused('failed'),
  withdrawn: () => refused('withdrawn'),
  'handed-off': () => refused('no-report-in-this-mode'),
}

const runEnded: Row<'run-ended'> = {
  accepted: unreachable,
  started: (dispatch, event, at) =>
    reported(dispatch, at, { text: event.reply, origin: 'final-reply' }),
  reported: unchanged,
  failed: unchanged,
  withdrawn: unchanged,
  'handed-off': unchanged,
}

const runFailed: Row<'run-failed'> = {
  accepted: unreachable,
  started: (dispatch, event, at) =>
    failed(dispatch, at, { cause: event.cause, detail: event.detail }),
  reported: unchanged,
  failed: unchanged,
  withdrawn: unchanged,
  'handed-off': unchanged,
}

const withdraw: Row<'withdraw'> = {
  accepted: (dispatch, _event, at) => withdrawn(dispatch, at, 'not-needed'),
  started: (dispatch, _event, at) => withdrawn(dispatch, at, 'requested'),
  reported: () => refused('already-reported'),
  failed: () => refused('failed'),
  withdrawn: recalled,
  'handed-off': () => refused('cannot-withdraw-a-handoff'),
}

const dispatcherArchived: Row<'dispatcher-archived'> = {
  accepted: (dispatch, _event, at) => withdrawn(dispatch, at, 'not-needed'),
  started: (dispatch, _event, at) => withdrawn(dispatch, at, 'requested'),
  reported: unchanged,
  failed: unchanged,
  withdrawn: unchanged,
  'handed-off': unchanged,
}

const TABLE: Readonly<Record<DispatchEventKind, Readonly<Record<DispatchState, Cell>>>> = {
  'session-created': sessionCreated,
  'session-failed': sessionFailed,
  report,
  'run-ended': runEnded,
  'run-failed': runFailed,
  withdraw,
  'dispatcher-archived': dispatcherArchived,
}

/** One cell of the table: what this event does to a dispatch in the state it is in. Total. */
export function transition(dispatch: Dispatch, event: DispatchEvent, at: Instant): Transition {
  return TABLE[event.kind][dispatch.state](dispatch, event as never, at)
}
