import { describe, expect, it } from 'vitest'
import type { GoalRefusal } from '@omne-harness/goal-contract'
import { NOW_UNAVAILABLE, answered, refused, unknown } from '../src/results.ts'

const reasonOf = (reason: GoalRefusal) => {
  const failed = refused(reason)
  if (!('failure' in failed)) throw new Error('not a failure')
  return failed.failure
}

describe('a refusal of the goal services as the result of a call', () => {
  it.each([
    ['no-live-goal', 'conflict'],
    ['goal-in-progress', 'conflict'],
    ['nobody-attends', 'unsupported'],
    ['attended', 'unsupported'],
    ['not-its-cause', 'conflict'],
  ] as const)(
    'the state refuses with %s: a %s that starts with the reason and says what to do',
    (reason, kind) => {
      const failure = reasonOf({ kind: 'state', reason })
      expect(failure.kind).toBe(kind)
      expect(failure.reason).toMatch(new RegExp(`^${reason}: \\S.{12,}`, 'u'))
    },
  )

  it.each([
    'not-a-member',
    'not-confirmed',
    'already-used',
    'stale-base',
    'content-differs',
  ] as const)(
    'the card refuses with %s: a conflict that starts with the reason and says what it means',
    reason => {
      const failure = reasonOf({ kind: 'card', reason })
      expect(failure.kind).toBe('conflict')
      expect(failure.reason).toMatch(new RegExp(`^${reason}: \\S.{12,}`, 'u'))
    },
  )

  it('a body that does not stand lists every issue by entry and field', () => {
    const issues = [
      { entry: 'A1', field: 'evidence', problem: 'there is no metric M9' },
      { entry: null, field: 'purpose', problem: 'a goal needs a purpose' },
    ]
    expect(reasonOf({ kind: 'invalid', issues })).toEqual({
      kind: 'invalid',
      reason:
        'invalid: A1.evidence: there is no metric M9; body.purpose: a goal needs a purpose. Fix these and send it again.',
    })
  })

  it('a call that may not do it, and a session or a card that is not there, are unsupported', () => {
    expect(reasonOf({ kind: 'denied' })).toEqual({
      kind: 'unsupported',
      reason: 'denied: this call may not do that',
    })
    for (const kind of ['no-such-session', 'no-such-card'] as const)
      expect(reasonOf({ kind })).toEqual({
        kind: 'unsupported',
        reason: `${kind}: nothing to act on`,
      })
  })
})

describe('what the goal services answered, as the result of a call', () => {
  it('done is the text of the value under the name of the command', () => {
    expect(answered('show', { kind: 'done', value: 3, recalled: false }, String)).toEqual({
      ok: 'done Goal show\n3',
    })
  })
  it('no basis is unavailable and says nothing was changed; unknown says to read before sending again', () => {
    expect(answered('track', { kind: 'basis-unavailable' }, String)).toEqual({
      failure: { kind: 'unavailable', operation: 'Goal.track', reason: NOW_UNAVAILABLE },
    })
    expect(NOW_UNAVAILABLE).toBe('the goal services cannot answer now; nothing was changed')
    expect(answered('track', { kind: 'unknown' }, String)).toEqual(unknown('track'))
    expect(unknown('propose')).toEqual({
      failure: {
        kind: 'unknown',
        operation: 'Goal.propose',
        reason:
          'it is not known whether this took effect; read the goal with show before you send it again',
      },
    })
  })
  it('a refusal goes through as the refusal', () => {
    expect(answered('show', { kind: 'refused', reason: { kind: 'denied' } }, String)).toEqual(
      refused({ kind: 'denied' }),
    )
  })
})
