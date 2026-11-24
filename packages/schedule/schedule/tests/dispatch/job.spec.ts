import { describe, expect, it } from 'vitest'
import { advanceJob, type JobEvent, type JobFacts, type JobState } from '../../src/dispatch/job.ts'

const job = (state: JobState, change: Partial<JobFacts> = {}): JobFacts => ({
  state,
  stopState: 'none',
  executionRef: null,
  outcome: null,
  reason: null,
  ...change,
})
const quiet: JobEvent = { kind: 'predecessorsQuiet' }
const intent: JobEvent = { kind: 'startIntent' }
const taken: JobEvent = { kind: 'taken', executionRef: 'x', running: false }
const running: JobEvent = { kind: 'taken', executionRef: 'x', running: true }
const notStarted: JobEvent = { kind: 'notStarted', recoverable: true, reason: 'busy' }
const gone: JobEvent = { kind: 'notStarted', recoverable: false, reason: 'no-program' }
const cancel: JobEvent = { kind: 'cancel' }
const succeeded: JobEvent = { kind: 'ended', report: 'succeeded', result: true, reason: 'done' }

describe('the progression table of a Job', () => {
  it.each([
    ['waiting', quiet, { kind: 'move', next: job('accepted'), effect: 'none' }],
    ['waiting', intent, { kind: 'refuse' }],
    [
      'waiting',
      cancel,
      {
        kind: 'move',
        next: job('concluded', { outcome: 'cancelled', reason: 'cancelled-before-start' }),
        effect: 'none',
      },
    ],
    ['waiting', running, { kind: 'refuse' }],
    ['accepted', quiet, { kind: 'same' }],
    ['accepted', intent, { kind: 'move', next: job('startPending'), effect: 'start' }],
    [
      'accepted',
      cancel,
      {
        kind: 'move',
        next: job('concluded', { outcome: 'cancelled', reason: 'cancelled-before-start' }),
        effect: 'none',
      },
    ],
    ['accepted', running, { kind: 'refuse' }],
    ['accepted', succeeded, { kind: 'refuse' }],
    ['startPending', intent, { kind: 'same' }],
    [
      'startPending',
      running,
      { kind: 'move', next: job('running', { executionRef: 'x' }), effect: 'none' },
    ],
    [
      'startPending',
      taken,
      { kind: 'move', next: job('startPending', { executionRef: 'x' }), effect: 'none' },
    ],
    [
      'startPending',
      notStarted,
      { kind: 'move', next: job('blocked', { reason: 'busy' }), effect: 'none' },
    ],
    [
      'startPending',
      gone,
      {
        kind: 'move',
        next: job('concluded', { outcome: 'failed', reason: 'no-program' }),
        effect: 'none',
      },
    ],
    [
      'startPending',
      cancel,
      { kind: 'move', next: job('startPending', { stopState: 'requested' }), effect: 'none' },
    ],
    ['running', intent, { kind: 'refuse' }],
    ['running', running, { kind: 'same' }],
    ['running', notStarted, { kind: 'refuse' }],
    [
      'running',
      cancel,
      { kind: 'move', next: job('running', { stopState: 'requested' }), effect: 'stop' },
    ],
    [
      'running',
      succeeded,
      { kind: 'move', next: job('concluded', { outcome: 'succeeded' }), effect: 'none' },
    ],
    ['blocked', intent, { kind: 'move', next: job('startPending'), effect: 'start' }],
    ['blocked', notStarted, { kind: 'same' }],
    [
      'blocked',
      cancel,
      {
        kind: 'move',
        next: job('concluded', { outcome: 'cancelled', reason: 'cancelled-before-start' }),
        effect: 'none',
      },
    ],
    ['blocked', running, { kind: 'refuse' }],
    ['concluded', quiet, { kind: 'same' }],
    ['concluded', intent, { kind: 'refuse' }],
    ['concluded', running, { kind: 'same' }],
    ['concluded', cancel, { kind: 'same' }],
    ['concluded', succeeded, { kind: 'same' }],
  ] as const)('%s, %j', (state, event, step) => {
    expect(advanceJob(job(state), event)).toEqual(step)
  })

  it('a cancel while the start is undecided only records the intent; then not-started concludes it cancelled, taken sends the stop', () => {
    const asked = job('startPending', { stopState: 'requested' })
    expect(advanceJob(asked, intent)).toEqual({ kind: 'same' })
    expect(advanceJob(job('accepted', { stopState: 'requested' }), intent)).toEqual({
      kind: 'refuse',
    })
    expect(advanceJob(asked, notStarted)).toMatchObject({
      next: { state: 'concluded', outcome: 'cancelled' },
    })
    expect(advanceJob(asked, running)).toEqual({
      kind: 'move',
      next: { ...asked, state: 'running', executionRef: 'x' },
      effect: 'stop',
    })
  })

  it('the outcome table: stopped is cancelled with the stop confirmed, failed is failed, success needs a final result', () => {
    const at = job('running', { executionRef: 'x', stopState: 'pending' })
    expect(
      advanceJob(at, { kind: 'ended', report: 'stopped', result: false, reason: 'stopped' }),
    ).toMatchObject({ next: { outcome: 'cancelled', stopState: 'confirmed' } })
    expect(
      advanceJob(at, { kind: 'ended', report: 'failed', result: false, reason: 'exit 1' }),
    ).toMatchObject({ next: { outcome: 'failed', reason: 'exit 1' } })
    expect(
      advanceJob(at, { kind: 'ended', report: 'succeeded', result: false, reason: 'done' }),
    ).toMatchObject({ next: { outcome: 'failed', reason: 'no-final-result' } })
  })

  it('the stop sub-state moves only once asked, and a concluded Job ignores it', () => {
    expect(advanceJob(job('running'), { kind: 'stopSent' })).toEqual({ kind: 'refuse' })
    expect(
      advanceJob(job('running', { stopState: 'requested' }), { kind: 'stopSent' }),
    ).toMatchObject({ next: { stopState: 'pending' } })
    expect(advanceJob(job('running', { stopState: 'pending' }), { kind: 'stopSent' })).toEqual({
      kind: 'same',
    })
    expect(
      advanceJob(job('running', { stopState: 'pending' }), { kind: 'stopUnknown' }),
    ).toMatchObject({ next: { stopState: 'unknown' } })
    expect(
      advanceJob(job('concluded', { stopState: 'pending' }), { kind: 'stopConfirmed' }),
    ).toEqual({ kind: 'same' })
  })
})

/** Every state against every event, read off the design's table; a cell is refused, unchanged, or a move. */
describe('every cell of the progression table', () => {
  const events = {
    quiet,
    intent,
    taken,
    running,
    notStarted,
    gone,
    cancel,
    succeeded,
    noResult: { kind: 'ended', report: 'succeeded', result: false, reason: 'done' },
    failed: { kind: 'ended', report: 'failed', result: true, reason: 'boom' },
    stopped: { kind: 'ended', report: 'stopped', result: false, reason: 'halted' },
    stopSent: { kind: 'stopSent' },
    stopConfirmed: { kind: 'stopConfirmed' },
    stopUnknown: { kind: 'stopUnknown' },
  } satisfies Record<string, JobEvent>
  type Cell = 'refuse' | 'same' | [Partial<JobFacts>, 'none' | 'start' | 'stop']
  const cancelled: Cell = [
    { state: 'concluded', outcome: 'cancelled', reason: 'cancelled-before-start' },
    'none',
  ]
  const outcomes = {
    succeeded: [{ state: 'concluded', outcome: 'succeeded', reason: null }, 'none'],
    noResult: [{ state: 'concluded', outcome: 'failed', reason: 'no-final-result' }, 'none'],
    failed: [{ state: 'concluded', outcome: 'failed', reason: 'boom' }, 'none'],
    stopped: [
      { state: 'concluded', outcome: 'cancelled', stopState: 'confirmed', reason: 'halted' },
      'none',
    ],
  } satisfies Record<string, Cell>
  const noStop = { stopSent: 'refuse', stopConfirmed: 'refuse', stopUnknown: 'refuse' } as const
  const notEnded = {
    succeeded: 'refuse',
    noResult: 'refuse',
    failed: 'refuse',
    stopped: 'refuse',
  } as const
  const table: Record<JobState, Record<keyof typeof events, Cell>> = {
    accepted: {
      quiet: 'same',
      intent: [{ state: 'startPending' }, 'start'],
      taken: 'refuse',
      running: 'refuse',
      notStarted: 'refuse',
      gone: 'refuse',
      cancel: cancelled,
      ...notEnded,
      ...noStop,
    },
    waiting: {
      quiet: [{ state: 'accepted' }, 'none'],
      intent: 'refuse',
      taken: 'refuse',
      running: 'refuse',
      notStarted: 'refuse',
      gone: 'refuse',
      cancel: cancelled,
      ...notEnded,
      ...noStop,
    },
    startPending: {
      quiet: 'same',
      intent: 'same',
      taken: [{ state: 'startPending', executionRef: 'x' }, 'none'],
      running: [{ state: 'running', executionRef: 'x' }, 'none'],
      notStarted: [{ state: 'blocked', reason: 'busy' }, 'none'],
      gone: [{ state: 'concluded', outcome: 'failed', reason: 'no-program' }, 'none'],
      cancel: [{ state: 'startPending', stopState: 'requested' }, 'none'],
      ...outcomes,
      ...noStop,
    },
    running: {
      quiet: 'same',
      intent: 'refuse',
      taken: 'same',
      running: 'same',
      notStarted: 'refuse',
      gone: 'refuse',
      cancel: [{ state: 'running', stopState: 'requested' }, 'stop'],
      ...outcomes,
      ...noStop,
    },
    blocked: {
      quiet: 'same',
      intent: [{ state: 'startPending' }, 'start'],
      taken: 'refuse',
      running: 'refuse',
      notStarted: 'same',
      gone: 'same',
      cancel: cancelled,
      ...notEnded,
      ...noStop,
    },
    concluded: {
      quiet: 'same',
      intent: 'refuse',
      taken: 'same',
      running: 'same',
      notStarted: 'same',
      gone: 'same',
      cancel: 'same',
      succeeded: 'same',
      noResult: 'same',
      failed: 'same',
      stopped: 'same',
      stopSent: 'same',
      stopConfirmed: 'same',
      stopUnknown: 'same',
    },
  }
  const cells = Object.entries(table).flatMap(([state, row]) =>
    Object.entries(row).map(([event, cell]) => [state as JobState, event, cell] as const),
  )

  it.each(cells)('%s × %s', (state, event, cell) => {
    const before = job(state, {
      executionRef: state === 'running' ? 'x' : null,
      outcome: state === 'concluded' ? 'succeeded' : null,
    })
    const step = advanceJob(before, events[event as keyof typeof events])
    if (typeof cell === 'string') expect(step).toEqual({ kind: cell })
    else expect(step).toEqual({ kind: 'move', next: { ...before, ...cell[0] }, effect: cell[1] })
  })

  it('covers six states and fourteen events', () => {
    expect(cells).toHaveLength(6 * 14)
  })
})

describe('the cells where a stop was already asked', () => {
  const asked = (state: JobState, stopState: JobFacts['stopState'], executionRef: string | null) =>
    job(state, { stopState, executionRef })
  it.each([
    [asked('running', 'requested', 'x'), { kind: 'stopSent' }, { stopState: 'pending' }],
    [asked('running', 'requested', 'x'), { kind: 'stopConfirmed' }, { stopState: 'confirmed' }],
    [asked('running', 'requested', 'x'), { kind: 'stopUnknown' }, { stopState: 'unknown' }],
    [asked('running', 'pending', 'x'), { kind: 'stopConfirmed' }, { stopState: 'confirmed' }],
    [asked('startPending', 'requested', null), { kind: 'stopUnknown' }, { stopState: 'unknown' }],
  ] as const)('%o, %o moves only the stop sub-state', (before, event, change) => {
    expect(advanceJob(before, event)).toEqual({
      kind: 'move',
      next: { ...before, ...change },
      effect: 'none',
    })
  })

  it.each([
    [asked('running', 'pending', 'x'), { kind: 'stopSent' }],
    [asked('running', 'requested', 'x'), cancel],
    [asked('startPending', 'requested', null), cancel],
    [asked('startPending', 'requested', 'x'), taken],
  ] as const)('%o, %o changes nothing', (before, event) => {
    expect(advanceJob(before, event)).toEqual({ kind: 'same' })
  })

  it('a pending start that learns of its execution sends the stop asked for; one that learns it never started is cancelled', () => {
    const before = asked('startPending', 'requested', null)
    expect(advanceJob(before, taken)).toEqual({
      kind: 'move',
      next: { ...before, executionRef: 'x' },
      effect: 'stop',
    })
    expect(advanceJob(before, running)).toEqual({
      kind: 'move',
      next: { ...before, state: 'running', executionRef: 'x' },
      effect: 'stop',
    })
    expect(advanceJob(before, gone)).toEqual({
      kind: 'move',
      next: {
        ...before,
        state: 'concluded',
        outcome: 'cancelled',
        reason: 'cancelled-before-start',
      },
      effect: 'none',
    })
  })
})
