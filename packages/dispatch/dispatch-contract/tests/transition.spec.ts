import { describe, expect, it } from 'vitest'
import {
  DISPATCH_STATES,
  transition,
  type Dispatch,
  type DispatchEvent,
  type DispatchId,
  type DispatchState,
  type Instant,
  type SessionRef,
  type TenantId,
} from '@omne-harness/dispatch-contract'

const T0 = '2026-11-20T00:00:00.000Z' as Instant
const T1 = '2026-11-20T00:00:01.000Z' as Instant
const PENDING = { kind: 'pending' }

/** A dispatch as the registry holds it in each state, with the facts that state carries. */
function dispatchIn(state: DispatchState, mode: Dispatch['mode'] = 'delegate'): Dispatch {
  const carried: Partial<Dispatch> = {
    reported: { report: { text: 'the first report', origin: 'report' }, delivery: PENDING },
    failed: { failure: { cause: 'run-failed', detail: 'the model refused' }, delivery: PENDING },
    withdrawn: { stop: 'requested', delivery: PENDING },
    'handed-off': { delivery: PENDING },
    accepted: {},
    started: {},
  }[state] as Partial<Dispatch>
  return {
    id: `dsp_${'a'.repeat(64)}` as DispatchId,
    tenant: 'tenant-1' as TenantId,
    dispatcher: 'session-parent' as SessionRef,
    call: 'call-1',
    mode: state === 'handed-off' ? 'handoff' : mode,
    agent: 'helper',
    instruction: 'look into it',
    expectation: null,
    context: null,
    session: 'session-child' as SessionRef,
    state,
    report: null,
    failure: null,
    stop: null,
    delivery: null,
    acceptedAt: T0,
    changedAt: T0,
    ...carried,
  }
}

const EVENTS: Readonly<Record<DispatchEvent['kind'], DispatchEvent>> = {
  'session-created': { kind: 'session-created' },
  'session-failed': { kind: 'session-failed', detail: 'no such definition' },
  report: { kind: 'report', text: 'another report' },
  'run-ended': { kind: 'run-ended', reply: 'the final reply' },
  'run-failed': { kind: 'run-failed', cause: 'run-cancelled', detail: 'cancelled by the person' },
  withdraw: { kind: 'withdraw' },
  'dispatcher-archived': { kind: 'dispatcher-archived' },
}

/**
 * The table of the specification, one row an event and one column a state. A cell is the next
 * state, or `=` for a recall, `.` for no change, `!reason` for a refusal.
 */
const TABLE: Readonly<Record<DispatchEvent['kind'], Readonly<Record<DispatchState, string>>>> = {
  'session-created': {
    accepted: 'started',
    started: '=',
    reported: '!unreachable',
    failed: '.',
    withdrawn: '.',
    'handed-off': '=',
  },
  'session-failed': {
    accepted: 'failed',
    started: '!unreachable',
    reported: '!unreachable',
    failed: '=',
    withdrawn: '.',
    'handed-off': '!unreachable',
  },
  report: {
    accepted: '!not-started',
    started: 'reported',
    reported: '!already-reported',
    failed: '!failed',
    withdrawn: '!withdrawn',
    'handed-off': '!no-report-in-this-mode',
  },
  'run-ended': {
    accepted: '!unreachable',
    started: 'reported',
    reported: '.',
    failed: '.',
    withdrawn: '.',
    'handed-off': '.',
  },
  'run-failed': {
    accepted: '!unreachable',
    started: 'failed',
    reported: '.',
    failed: '.',
    withdrawn: '.',
    'handed-off': '.',
  },
  withdraw: {
    accepted: 'withdrawn',
    started: 'withdrawn',
    reported: '!already-reported',
    failed: '!failed',
    withdrawn: '=',
    'handed-off': '!cannot-withdraw-a-handoff',
  },
  'dispatcher-archived': {
    accepted: 'withdrawn',
    started: 'withdrawn',
    reported: '.',
    failed: '.',
    withdrawn: '.',
    'handed-off': '.',
  },
}

const cells = Object.entries(TABLE).flatMap(([event, row]) =>
  DISPATCH_STATES.map(state => ({
    event: event as DispatchEvent['kind'],
    state,
    cell: row[state],
  })),
)

describe('the table of the specification, cell by cell', () => {
  it('has a cell for every event in every state', () => {
    expect(cells).toHaveLength(7 * 6)
  })

  it.each(cells)('$event in $state: $cell', ({ event, state, cell }) => {
    const before = dispatchIn(state)
    const result = transition(before, EVENTS[event], T1)
    if (cell === '=') return expect(result).toEqual({ kind: 'recalled' })
    if (cell === '.') return expect(result).toEqual({ kind: 'unchanged' })
    if (cell.startsWith('!'))
      return expect(result).toEqual({ kind: 'refused', reason: cell.slice(1) })
    expect(result).toMatchObject({ kind: 'changed', next: { state: cell, changedAt: T1 } })
    expect(before.changedAt).toBe(T0)
  })
})

describe('what a change carries', () => {
  const next = (state: DispatchState, event: DispatchEvent, mode?: Dispatch['mode']) => {
    const result = transition(dispatchIn(state, mode), event, T1)
    if (result.kind !== 'changed') throw new Error(`expected a change, got ${result.kind}`)
    return result.next
  }

  it('a handoff is handed off when its session is created, and its outcome is due', () => {
    expect(next('accepted', EVENTS['session-created'], 'handoff')).toMatchObject({
      state: 'handed-off',
      delivery: PENDING,
    })
  })

  it('a started dispatch has no outcome to hand over yet', () => {
    expect(next('accepted', EVENTS['session-created'])).toMatchObject({ delivery: null })
  })

  it('a report is kept as it was handed back, and its delivery is pending', () => {
    expect(next('started', EVENTS.report)).toMatchObject({
      report: { text: 'another report', origin: 'report' },
      delivery: PENDING,
    })
  })

  it('a run that ends without a report makes its final reply the report', () => {
    expect(next('started', EVENTS['run-ended'])).toMatchObject({
      report: { text: 'the final reply', origin: 'final-reply' },
      delivery: PENDING,
    })
  })

  it('a failure carries its cause, from the session or from the run', () => {
    expect(next('accepted', EVENTS['session-failed'])).toMatchObject({
      failure: { cause: 'session-not-created', detail: 'no such definition' },
      report: null,
      delivery: PENDING,
    })
    expect(next('started', EVENTS['run-failed'])).toMatchObject({
      failure: { cause: 'run-cancelled', detail: 'cancelled by the person' },
    })
  })

  it('a withdrawal asks the run to stop only when a run was started', () => {
    expect(next('accepted', EVENTS.withdraw)).toMatchObject({ stop: 'not-needed', report: null })
    expect(next('started', EVENTS.withdraw)).toMatchObject({ stop: 'requested', delivery: PENDING })
    expect(next('started', EVENTS['dispatcher-archived'])).toMatchObject({ stop: 'requested' })
    expect(next('accepted', EVENTS['dispatcher-archived'])).toMatchObject({ stop: 'not-needed' })
  })

  it('the same report again is a recall, and another one is refused: at most one report', () => {
    const reported = dispatchIn('reported')
    expect(transition(reported, { kind: 'report', text: 'the first report' }, T1)).toEqual({
      kind: 'recalled',
    })
    expect(transition(reported, { kind: 'report', text: 'a second report' }, T1)).toEqual({
      kind: 'refused',
      reason: 'already-reported',
    })
  })

  it('no event changes the report once it is made', () => {
    const reported = dispatchIn('reported')
    for (const event of Object.values(EVENTS))
      expect(transition(reported, event, T1).kind, event.kind).not.toBe('changed')
  })

  it('no event makes a report after a withdrawal', () => {
    const withdrawn = dispatchIn('withdrawn')
    for (const event of Object.values(EVENTS))
      expect(transition(withdrawn, event, T1).kind, event.kind).not.toBe('changed')
  })
})
