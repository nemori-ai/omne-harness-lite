import { describe, expect, it } from 'vitest'
import { decideAdmission, type AdmissionFacts } from '../../src/dispatch/admission.ts'
import { reminderDeadline } from '../../src/dispatch/prepare.ts'

const ready: AdmissionFacts = {
  slot: { disposed: false, earlierPending: false },
  control: 'active',
  basisCurrent: true,
  counts: { eligibleConsumed: 0, eligibleLimit: null, jobsAccepted: 0, jobLimit: null },
  hasNext: true,
  dependency: { kind: 'ready' },
  missingCarriers: [],
  reminderClosed: null,
  standing: { kind: 'eligible' },
  overlap: { unfinished: 0, policy: 'parallel' },
}
const with_ = (change: Partial<AdmissionFacts>): AdmissionFacts => ({ ...ready, ...change })

describe('the admission of one due slot: the first row that holds decides', () => {
  it.each([
    [
      '1 the slot already has an outcome',
      with_({ slot: { disposed: true, earlierPending: false } }),
      { kind: 'retreat', reason: 'disposed' },
    ],
    [
      '1 an earlier slot is still pending',
      with_({ slot: { disposed: false, earlierPending: true } }),
      { kind: 'retreat', reason: 'earlier' },
    ],
    [
      '2 the schedule is paused',
      with_({ control: 'paused' }),
      { kind: 'retreat', reason: 'inactive' },
    ],
    [
      '2 the schedule is stopped',
      with_({ control: 'stopped' }),
      { kind: 'retreat', reason: 'inactive' },
    ],
    ['3 a revision changed since preparing', with_({ basisCurrent: false }), { kind: 'recompute' }],
    [
      '4 the job limit is reached',
      with_({ counts: { ...ready.counts, jobsAccepted: 2, jobLimit: 2 } }),
      { kind: 'exhaust' },
    ],
    [
      '4 the eligible limit is reached',
      with_({ counts: { ...ready.counts, eligibleConsumed: 3, eligibleLimit: 3 } }),
      { kind: 'exhaust' },
    ],
    [
      '5 a dependency is gone for good',
      with_({ dependency: { kind: 'terminal', reasons: ['device-retired'] } }),
      { kind: 'invalidate', reasons: ['device-retired'] },
    ],
    [
      '5 the owner is no longer a member',
      with_({ standing: { kind: 'terminal', reason: 'owner-not-member' } }),
      { kind: 'invalidate', reasons: ['owner-not-member'] },
    ],
    [
      '6 a dependency is blocked',
      with_({ dependency: { kind: 'blocked', reasons: ['calendar-unavailable'] } }),
      { kind: 'block', reasons: ['calendar-unavailable'] },
    ],
    [
      '6 a chosen carrier is missing',
      with_({ missingCarriers: ['executor:program'] }),
      { kind: 'block', reasons: ['carrier-missing:executor:program'] },
    ],
    [
      '7 the reminder window has closed',
      with_({ reminderClosed: true }),
      { kind: 'miss', reason: 'reminder-window', exhausts: false },
    ],
    [
      '8 the owner is refused now',
      with_({ standing: { kind: 'refused', reason: 'member-removed' } }),
      { kind: 'reject', reason: 'member-removed', exhausts: false },
    ],
    [
      '9 an unfinished job and the policy skips',
      with_({ overlap: { unfinished: 1, policy: 'skip' } }),
      { kind: 'skip', reason: 'overlap', exhausts: false },
    ],
    [
      '10 an unfinished job and the policy waits',
      with_({ overlap: { unfinished: 1, policy: 'wait' } }),
      { kind: 'accept', start: 'waiting', stopPredecessors: false, exhausts: false },
    ],
    [
      '11 an unfinished job and the policy replaces',
      with_({ overlap: { unfinished: 2, policy: 'replace' } }),
      { kind: 'accept', start: 'waiting', stopPredecessors: true, exhausts: false },
    ],
    [
      '12 otherwise',
      ready,
      { kind: 'accept', start: 'ready', stopPredecessors: false, exhausts: false },
    ],
    [
      '12 parallel ignores unfinished jobs',
      with_({ overlap: { unfinished: 3, policy: 'parallel' } }),
      { kind: 'accept', start: 'ready', stopPredecessors: false, exhausts: false },
    ],
    [
      '12 a reminder still in its window',
      with_({ reminderClosed: false }),
      { kind: 'accept', start: 'ready', stopPredecessors: false, exhausts: false },
    ],
  ] as const)('%s', (_, facts, admission) => {
    expect(decideAdmission(facts)).toEqual(admission)
  })

  it('earlier rows win over later ones: a paused schedule with a missing carrier retreats; a blocked one with a closed reminder is blocked', () => {
    expect(
      decideAdmission(with_({ control: 'paused', missingCarriers: ['executor:program'] })),
    ).toEqual({ kind: 'retreat', reason: 'inactive' })
    expect(
      decideAdmission(
        with_({ dependency: { kind: 'blocked', reasons: ['x'] }, reminderClosed: true }),
      ),
    ).toMatchObject({ kind: 'block' })
    expect(
      decideAdmission(
        with_({ basisCurrent: false, counts: { ...ready.counts, jobsAccepted: 1, jobLimit: 1 } }),
      ),
    ).toEqual({ kind: 'recompute' })
  })

  it('a written slot exhausts the schedule when it uses the last eligible place, the last job, or the last candidate', () => {
    expect(
      decideAdmission(with_({ counts: { ...ready.counts, jobsAccepted: 1, jobLimit: 2 } })),
    ).toMatchObject({ kind: 'accept', exhausts: true })
    expect(
      decideAdmission(
        with_({ counts: { ...ready.counts, eligibleConsumed: 4, eligibleLimit: 5 } }),
      ),
    ).toMatchObject({ kind: 'accept', exhausts: true })
    expect(decideAdmission(with_({ hasNext: false }))).toMatchObject({
      kind: 'accept',
      exhausts: true,
    })
    expect(
      decideAdmission(with_({ hasNext: false, overlap: { unfinished: 1, policy: 'skip' } })),
    ).toMatchObject({ kind: 'skip', exhausts: true })
    expect(
      decideAdmission(
        with_({
          counts: { ...ready.counts, jobsAccepted: 1, jobLimit: 2 },
          overlap: { unfinished: 1, policy: 'skip' },
        }),
      ),
    ).toMatchObject({ kind: 'skip', exhausts: false })
  })
})

describe('the admission window of a reminder', () => {
  const candidate = (scheduledAt: string) => ({ scheduledAt }) as never
  it('is five minutes from its slot, or up to the next slot when that comes sooner', () => {
    expect(reminderDeadline(candidate('2026-11-04T09:00:00.000Z'), null)).toBe(
      '2026-11-04T09:05:00.000Z',
    )
    expect(
      reminderDeadline(
        candidate('2026-11-04T09:00:00.000Z'),
        candidate('2026-11-04T09:10:00.000Z'),
      ),
    ).toBe('2026-11-04T09:05:00.000Z')
    expect(
      reminderDeadline(
        candidate('2026-11-04T09:00:00.000Z'),
        candidate('2026-11-04T09:01:00.000Z'),
      ),
    ).toBe('2026-11-04T09:01:00.000Z')
  })
})

describe('what does not count as a job, and what is not an overlap', () => {
  const oneJobLeft = { ...ready.counts, jobsAccepted: 1, jobLimit: 2 }
  it('a missed or rejected slot does not use the last job, so it does not exhaust the schedule by the job limit', () => {
    expect(decideAdmission(with_({ counts: oneJobLeft, reminderClosed: true }))).toMatchObject({
      kind: 'miss',
      exhausts: false,
    })
    expect(
      decideAdmission(with_({ counts: oneJobLeft, standing: { kind: 'refused', reason: 'x' } })),
    ).toMatchObject({ kind: 'reject', exhausts: false })
  })

  it.each(['skip', 'wait', 'replace'] as const)(
    'with nothing unfinished, policy %s accepts at once and stops nothing',
    policy => {
      expect(decideAdmission(with_({ overlap: { unfinished: 0, policy } }))).toEqual({
        kind: 'accept',
        start: 'ready',
        stopPredecessors: false,
        exhausts: false,
      })
    },
  )
})
