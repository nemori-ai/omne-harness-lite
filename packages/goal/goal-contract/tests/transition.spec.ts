import { describe, expect, it } from 'vitest'
import {
  countsAs,
  NO_GOAL,
  transition,
  type GoalEvent,
  type GoalState,
  type GoalStatus,
  type Verdict,
} from '@omne-harness/goal-contract'

const GAP = { open: 2, remaining: {} }
const active = (change: Partial<Extract<GoalState, { status: 'active' }>> = {}): GoalState => ({
  status: 'active',
  attendance: 'attended',
  generation: 1,
  revision: 1,
  rounds: 3,
  stalled: 0,
  gap: null,
  ...change,
})
const paused = (
  pause: Extract<GoalState, { status: 'paused' }>['pause'] = { by: 'person' },
): GoalState => ({
  ...(active() as Extract<GoalState, { status: 'active' }>),
  status: 'paused',
  pause,
})
const settled: GoalState = {
  status: 'settled',
  attendance: 'attended',
  generation: 1,
  revision: 1,
  rounds: 3,
  outcome: { kind: 'achieved' },
}
const STATES: Readonly<Record<GoalStatus, GoalState>> = {
  none: NO_GOAL,
  active: active(),
  paused: paused(),
  settled,
}
const at = { generation: 1, revision: 1, rounds: 3 }
const observe = (verdict: Verdict, seen = at): GoalEvent => ({ kind: 'observe', at: seen, verdict })
const CONTINUE: Verdict = { row: 9, stalled: 0, gap: GAP }
const set: GoalEvent = { kind: 'set', attendance: 'attended' }
const X3 = 'X3' as const

type Cell = 'refused' | 'unchanged' | GoalStatus
const cell = (state: GoalState, event: GoalEvent): Cell => {
  const result = transition(state, event)
  return result.kind === 'changed' ? result.next.status : result.kind
}

describe('the transition table, cell by cell', () => {
  const EVENTS: Readonly<Record<string, GoalEvent>> = {
    set,
    revise: { kind: 'revise', confirmed: false },
    pause: { kind: 'pause' },
    resume: { kind: 'resume' },
    cancel: { kind: 'cancel' },
    'settle-by-exit': { kind: 'settle-by-exit', exit: X3, counts: 'failure' },
    observe: observe(CONTINUE),
    abort: { kind: 'abort' },
  }
  const TABLE: Readonly<Record<GoalStatus, Readonly<Record<string, Cell>>>> = {
    none: {
      set: 'active',
      revise: 'refused',
      pause: 'refused',
      resume: 'refused',
      cancel: 'unchanged',
      'settle-by-exit': 'refused',
      observe: 'unchanged',
      abort: 'unchanged',
    },
    active: {
      set: 'refused',
      revise: 'active',
      pause: 'paused',
      resume: 'unchanged',
      cancel: 'settled',
      'settle-by-exit': 'refused',
      observe: 'active',
      abort: 'settled',
    },
    paused: {
      set: 'refused',
      revise: 'paused',
      pause: 'unchanged',
      resume: 'active',
      cancel: 'settled',
      'settle-by-exit': 'refused',
      observe: 'unchanged',
      abort: 'settled',
    },
    settled: {
      set: 'active',
      revise: 'refused',
      pause: 'refused',
      resume: 'refused',
      cancel: 'unchanged',
      'settle-by-exit': 'refused',
      observe: 'unchanged',
      abort: 'unchanged',
    },
  }
  const cells = Object.entries(TABLE).flatMap(([status, row]) =>
    Object.entries(row).map(
      ([event, expected]) => [status as GoalStatus, event, expected] as const,
    ),
  )
  /** Each column is sent by whoever may send it: an abort comes from the creator of an unattended session. */
  const sentTo = (status: GoalStatus, event: string): GoalState => {
    const state = STATES[status]
    return event === 'abort' && state.status !== 'none'
      ? { ...state, attendance: 'unattended' }
      : state
  }
  it.each(cells)('%s on %s: %s', (status, event, expected) => {
    expect(cell(sentTo(status, event), EVENTS[event]!)).toBe(expected)
  })
  it('has all thirty-two cells', () => expect(cells).toHaveLength(32))
})

describe('what each cell does', () => {
  it('set starts the next goal of the session at revision one, with no round used, and wakes the session', () => {
    expect(transition(NO_GOAL, set)).toEqual({
      kind: 'changed',
      next: active({ rounds: 0, generation: 1 }),
      effects: ['wake'],
    })
    const again = transition(settled, { kind: 'set', attendance: 'unattended' })
    expect(again).toMatchObject({
      next: { generation: 2, revision: 1, rounds: 0, attendance: 'unattended' },
    })
  })

  it('a revision takes the next revision number and keeps the rounds used', () => {
    expect(transition(active(), { kind: 'revise', confirmed: false })).toMatchObject({
      kind: 'changed',
      next: { status: 'active', revision: 2, rounds: 3 },
    })
  })

  it('a paused goal revised from the panel stays paused; one revised by a confirmed card resumes', () => {
    expect(transition(paused(), { kind: 'revise', confirmed: false })).toMatchObject({
      next: { status: 'paused', revision: 2, pause: { by: 'person' } },
    })
    expect(transition(paused(), { kind: 'revise', confirmed: true })).toMatchObject({
      next: { status: 'active', revision: 2 },
      effects: ['wake'],
    })
  })

  it('pause is by the person; resume wakes the session', () => {
    expect(transition(active(), { kind: 'pause' })).toMatchObject({
      next: { status: 'paused', pause: { by: 'person' } },
    })
    expect(transition(paused(), { kind: 'resume' })).toMatchObject({
      next: { status: 'active' },
      effects: ['wake'],
    })
  })

  it('cancel settles as cancelled, which counts neither as success nor as failure', () => {
    for (const state of [active(), paused()]) {
      const result = transition(state, { kind: 'cancel' })
      expect(result).toMatchObject({ next: { status: 'settled', outcome: { kind: 'cancelled' } } })
    }
    expect(countsAs({ kind: 'cancelled' })).toBe('neither')
  })

  it('a paused goal settles by an exit only when that exit is why the verdict paused it', () => {
    const byExit = paused({ by: 'verdict', row: 5, exit: X3 })
    expect(
      transition(byExit, { kind: 'settle-by-exit', exit: X3, counts: 'failure' }),
    ).toMatchObject({
      next: { status: 'settled', outcome: { kind: 'exit', exit: X3, counts: 'failure' } },
    })
    expect(cell(byExit, { kind: 'settle-by-exit', exit: 'X2', counts: 'success' })).toBe('refused')
    expect(cell(paused({ by: 'verdict', row: 7, exit: null }), EXIT)).toBe('refused')
    expect(cell(paused({ by: 'person' }), EXIT)).toBe('refused')
  })
  const EXIT: GoalEvent = { kind: 'settle-by-exit', exit: X3, counts: 'failure' }

  it('a settled goal stays as it settled: a second cancel or an abort changes nothing', () => {
    for (const kind of ['cancel', 'abort'] as const)
      expect(transition(settled, { kind })).toEqual({ kind: 'unchanged', effects: [] })
  })
})

describe('who may send what', () => {
  const unattended = active({ attendance: 'unattended' })
  it.each(['pause', 'resume'] as const)('nobody %ss a goal where nobody is', kind => {
    expect(cell(unattended, { kind })).toBe('refused')
  })
  it('the body is frozen in an unattended session: no revision, no settling by hand', () => {
    expect(cell(unattended, { kind: 'revise', confirmed: false })).toBe('refused')
    expect(cell(unattended, EXIT_HERE)).toBe('refused')
  })
  const EXIT_HERE: GoalEvent = { kind: 'settle-by-exit', exit: X3, counts: 'failure' }
  it('the creator of an unattended session cancels, and aborts when its run died', () => {
    expect(transition(unattended, { kind: 'cancel' })).toMatchObject({
      next: { outcome: { kind: 'cancelled' } },
    })
    const aborted = transition(unattended, { kind: 'abort' })
    expect(aborted).toMatchObject({ next: { status: 'settled', outcome: { kind: 'aborted' } } })
    expect(countsAs({ kind: 'aborted' })).toBe('failure')
  })
  it('an attended goal is not aborted: its person decides', () => {
    expect(cell(active(), { kind: 'abort' })).toBe('refused')
    expect(cell(paused(), { kind: 'abort' })).toBe('refused')
  })
})

describe('an observation of an active goal', () => {
  const answerOf = (state: GoalState, event: GoalEvent) => {
    const result = transition(state, event)
    return result.kind === 'refused' ? 'refused' : result.effects
  }

  it.each([
    ['another goal', { ...at, generation: 2 }],
    ['an earlier revision', { ...at, revision: 0 }],
    ['an earlier round', { ...at, rounds: 2 }],
  ])('begun on %s changes nothing and is not let through: it is observed again', (_name, seen) => {
    for (const verdict of [{ row: 1 } as const, CONTINUE])
      expect(transition(active(), observe(verdict, seen))).toEqual({
        kind: 'unchanged',
        effects: ['reobserve'],
      })
  })

  it('row 1 settles as achieved and lets the round end', () => {
    expect(transition(active(), observe({ row: 1 }))).toEqual({
      kind: 'changed',
      next: { ...settled, outcome: { kind: 'achieved' } },
      effects: ['pass'],
    })
    expect(countsAs({ kind: 'achieved' })).toBe('success')
  })

  it.each([2, 3, 4] as const)('row %i settles by that exit, counted as the exit says', row => {
    for (const counts of ['success', 'failure'] as const) {
      const result = transition(active(), observe({ row, exit: X3, counts }))
      expect(result).toMatchObject({
        next: { status: 'settled', outcome: { kind: 'exit', exit: X3, counts } },
        effects: ['pass'],
      })
      expect(countsAs({ kind: 'exit', exit: X3, counts })).toBe(counts)
    }
  })

  const HANDED: readonly (readonly [Verdict, object, object])[] = [
    [
      { row: 5, exit: X3, counts: 'failure' },
      { by: 'verdict', row: 5, exit: X3 },
      { kind: 'exit', exit: X3, counts: 'failure' },
    ],
    [{ row: 6 }, { by: 'verdict', row: 6, exit: null }, { kind: 'unattainable' }],
    [{ row: 7, stalled: 3, gap: GAP }, { by: 'verdict', row: 7, exit: null }, { kind: 'stalled' }],
    [{ row: 8 }, { by: 'verdict', row: 8, exit: null }, { kind: 'judge-unavailable' }],
  ]
  it.each(HANDED)('row %j pauses where a person is, and tells the person', (verdict, pause) => {
    expect(transition(active(), observe(verdict))).toMatchObject({
      kind: 'changed',
      next: { status: 'paused', pause, rounds: 3 },
      effects: ['pass', 'tell-person'],
    })
  })
  it.each(HANDED)(
    'row %j settles where nobody is: a goal is never paused there',
    (verdict, _pause, outcome) => {
      const result = transition(active({ attendance: 'unattended' }), observe(verdict))
      expect(result).toMatchObject({
        kind: 'changed',
        next: { status: 'settled', outcome },
        effects: ['pass'],
      })
      if (
        result.kind === 'changed' &&
        result.next.status === 'settled' &&
        outcome !== HANDED[0]![2]
      )
        expect(countsAs(result.next.outcome)).toBe('failure')
    },
  )

  it('row 9 counts one more round, keeps what the observation saw, vetoes the end and continues', () => {
    expect(transition(active(), observe({ row: 9, stalled: 2, gap: GAP }))).toEqual({
      kind: 'changed',
      next: active({ rounds: 4, stalled: 2, gap: GAP }),
      effects: ['veto', 'continue'],
    })
  })

  it('where there is no active goal the round is let through and nothing is judged', () => {
    for (const state of [NO_GOAL, paused(), settled])
      expect(answerOf(state, observe({ row: 1 }))).toEqual(['pass'])
  })
})
