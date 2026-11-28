import { describe, expect, it } from 'vitest'
import {
  NO_EXAMINATION,
  baseOf,
  GoalRecordSchema,
  NO_PROGRESS,
  NO_READINGS,
  validateDraft,
  judgeCard,
  NO_GOAL,
  type AnsweredCard,
  type GoalState,
} from '@omne-harness/goal-contract'

const live: GoalState = {
  status: 'active',
  attendance: 'attended',
  generation: 2,
  revision: 3,
  rounds: 4,
  stalled: 0,
  gap: null,
}
const base = baseOf(live)
const card: AnsweredCard = {
  card: 'card-1',
  by: 'acc-1',
  byMember: true,
  confirmed: true,
  digest: 'd1',
  base,
}
const now = { digest: 'd1', base, used: false }

describe('what a confirmation card was drafted against', () => {
  it('is the goal, its revision and whether it is live', () => {
    expect(baseOf(NO_GOAL)).toEqual({ generation: 0, revision: 0, live: false })
    expect(base).toEqual({ generation: 2, revision: 3, live: true })
    expect(baseOf({ ...live, status: 'paused', pause: { by: 'person' } })).toEqual(base)
    const { stalled: _stalled, gap: _gap, ...standing } = live
    const settled: GoalState = { ...standing, status: 'settled', outcome: { kind: 'achieved' } }
    expect(baseOf(settled)).toEqual({ generation: 2, revision: 3, live: false })
  })
})

describe('an answered card writes a revision only with all three credentials, and once', () => {
  it('stands when a member confirmed this content on this base', () => {
    expect(judgeCard(card, now)).toBeNull()
  })
  it.each([
    [
      'answered by someone who is not a member of the session',
      { byMember: false },
      {},
      'not-a-member',
    ],
    [
      'the content on the card is not the data to be written',
      {},
      { digest: 'd2' },
      'content-differs',
    ],
    ['drafted against an earlier revision', { base: { ...base, revision: 2 } }, {}, 'stale-base'],
    ['drafted against another goal', { base: { ...base, generation: 1 } }, {}, 'stale-base'],
    [
      'drafted while the goal was live, answered after it settled',
      {},
      { base: { ...base, live: false } },
      'stale-base',
    ],
    ['already used once', {}, { used: true }, 'already-used'],
    [
      'answered with something other than the confirm option',
      { confirmed: false },
      {},
      'not-confirmed',
    ],
  ] as const)('%s: refused as %s', (_name, onCard, atNow, refusal) => {
    expect(judgeCard({ ...card, ...onCard }, { ...now, ...atNow })).toBe(refusal)
  })
})

describe('the record of a goal', () => {
  it('keeps where the history of the session stood when the goal was set, as the session names it; a record kept before examinations reads in with none', () => {
    const checked = validateDraft(
      { purpose: '做完', criteria: [{ statement: '做完了', evidence: { kind: 'person' } }] },
      { attendance: 'attended' },
    )
    if (checked.kind !== 'valid') throw new Error('fixture')
    const record = {
      session: 's',
      version: 1,
      state: live,
      body: checked.body,
      history: [
        {
          revision: 1,
          via: 'direct',
          words: null,
          draftedBy: 'person',
          confirmedBy: 'acc-1',
          operation: 'op-1',
          at: '2026-11-25T00:00:00.000Z',
        },
      ],
      readings: NO_READINGS,
      progress: NO_PROGRESS,
      since: '4172',
      wake: null,
      observed: null,
    }
    const kept = { ...record, examination: NO_EXAMINATION }
    expect(GoalRecordSchema.parse(kept)).toEqual(kept)
    expect(GoalRecordSchema.parse(record)).toEqual(kept)
    expect(GoalRecordSchema.safeParse({ ...record, since: '' }).success).toBe(false)
  })
})
