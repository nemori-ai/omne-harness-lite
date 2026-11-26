import { describe, expect, it } from 'vitest'
import {
  compactedNote,
  continueRequest,
  GoalRecordSchema,
  NO_PROGRESS,
  NO_READINGS,
  observe,
  observedReadings,
  openGap,
  pausedNote,
  STALL_LIMIT,
  validateDraft,
  type Attendance,
  type Findings,
  type GoalRecord,
  type SetGoalState,
} from '@omne-harness/goal-contract'
import { HOME } from './fixtures.ts'

const checked = validateDraft(HOME, { attendance: 'attended' })
if (checked.kind !== 'valid') throw new Error(JSON.stringify(checked.issues))
const BODY = checked.body

const active = (attendance: Attendance, change: Partial<SetGoalState> = {}): SetGoalState =>
  ({
    status: 'active',
    attendance,
    generation: 1,
    revision: 2,
    rounds: 3,
    stalled: 0,
    gap: null,
    ...change,
  }) as SetGoalState

function recordOf(state: SetGoalState, change: Partial<GoalRecord> = {}): GoalRecord {
  return GoalRecordSchema.parse({
    session: 's',
    version: 7,
    state,
    body: BODY,
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
    ...change,
  })
}

const DONE: Findings = {
  judge: 'answered',
  criteria: { A2: 'holds', A3: 'holds' },
  metrics: { M1: 780 },
  rules: { N1: 'kept', N2: 'kept' },
  exits: [],
  unattainable: false,
}
const found = (change: Partial<Findings>): Findings => ({ ...DONE, ...change })
const AT = { generation: 1, revision: 2, rounds: 3 }
const CALL = 'exec-1/cand-4/before_terminal/call/0'
const seen = (record: GoalRecord, findings: Findings, at = AT) =>
  observe(record, { call: CALL, at, decided: { A2: findings.criteria.A2 ?? 'holds' }, findings })

describe('one observation of a goal', () => {
  it('lets the round end, and writes nothing, when no goal is in progress', () => {
    const paused = active('attended', { status: 'paused', pause: { by: 'person' } } as never)
    const settled = {
      status: 'settled',
      attendance: 'attended',
      generation: 1,
      revision: 2,
      rounds: 3,
      outcome: { kind: 'cancelled' },
    } as SetGoalState
    for (const state of [paused, settled])
      expect(seen(recordOf(state), DONE)).toEqual({ kind: 'pass' })
  })

  it('settles the goal as achieved and lets the round end when every entry is met', () => {
    const step = seen(recordOf(active('attended')), DONE)
    if (step.kind !== 'next') throw new Error(step.kind)
    expect(step.answer).toBe('pass')
    expect(step.record.state).toMatchObject({ status: 'settled', outcome: { kind: 'achieved' } })
    expect(step.record).toMatchObject({
      version: 8,
      wake: null,
      observed: { call: CALL, answer: 'pass' },
    })
  })

  it('counts a round, owes the reminder of that round and answers to go on when an entry is open', () => {
    const step = seen(
      recordOf(active('attended')),
      found({ criteria: { A2: 'holds', A3: 'fails' } }),
    )
    if (step.kind !== 'next') throw new Error(step.kind)
    expect(step.answer).toBe('continue')
    expect(step.record.state).toMatchObject({ status: 'active', rounds: 4, revision: 2 })
    expect(step.record.wake).toEqual({ kind: 'continue', request: 'continue/1/2/4' })
    expect(step.record.observed).toEqual({ call: CALL, answer: 'continue' })
    expect(continueRequest({ generation: 1, revision: 2, rounds: 4 })).toBe('continue/1/2/4')
  })

  it('hands the goal to the person where one attends, and settles it where nobody does', () => {
    const stalled = { stalled: STALL_LIMIT - 1, gap: { open: 1, remaining: {} } }
    const open = found({ criteria: { A2: 'holds', A3: 'fails' } })
    const attended = seen(recordOf(active('attended', stalled as never)), open)
    if (attended.kind !== 'next') throw new Error(attended.kind)
    expect(attended.answer).toBe('tell')
    expect(attended.record.state).toMatchObject({
      status: 'paused',
      pause: { by: 'verdict', row: 7, exit: null },
    })
    expect(attended.record.wake).toBeNull()
    const unattended = seen(recordOf(active('unattended', stalled as never)), open)
    if (unattended.kind !== 'next') throw new Error(unattended.kind)
    expect(unattended.answer).toBe('pass')
    expect(unattended.record.state).toMatchObject({
      status: 'settled',
      outcome: { kind: 'stalled' },
    })
  })

  it('is to be made again, and writes nothing, when it began on another revision or round', () => {
    const record = recordOf(active('attended'))
    expect(seen(record, DONE, { ...AT, revision: 1 })).toEqual({ kind: 'reobserve' })
    expect(seen(record, DONE, { ...AT, rounds: 2 })).toEqual({ kind: 'reobserve' })
    expect(seen(record, DONE, { ...AT, generation: 2 })).toEqual({ kind: 'reobserve' })
  })

  it('keeps what it read: the system for what it settled itself, the judge for what was asked, and what it did not read stays', () => {
    const before = {
      criteria: { A3: { value: 'holds', source: 'agent', ref: 'call-1' } },
      metrics: {},
      rules: { N2: { value: 'kept', source: 'judge', ref: null } },
    } as GoalRecord['readings']
    const findings = found({ criteria: { A2: 'holds', A3: 'stale' }, rules: { N1: 'broken' } })
    expect(observedReadings(before, { A2: 'holds' }, findings)).toEqual({
      criteria: {
        A2: { value: 'holds', source: 'system', ref: null },
        A3: { value: 'stale', source: 'judge', ref: null },
      },
      metrics: { M1: { value: 780, source: 'system', ref: null } },
      rules: {
        N1: { value: 'broken', source: 'judge', ref: null },
        N2: { value: 'kept', source: 'judge', ref: null },
      },
    })
  })
})

describe('what a goal says when a round does not simply end', () => {
  const going = seen(
    recordOf(active('attended')),
    found({ criteria: { A2: 'holds', A3: 'fails' } }),
  )
  if (going.kind !== 'next') throw new Error(going.kind)

  it('names the rows that are still open, and only those: an entry never read is open', () => {
    const { body, readings, state } = going.record
    const open = openGap(body, readings, state.rounds)
    expect(open).toBe('- [A3] 改动说明写进了 CHANGELOG：证据显示没做到（判定）')
    const unread = recordOf(active('attended'))
    expect(openGap(unread.body, unread.readings, 3)).toContain('- [A2] 现有端到端用例全过：没读过')
  })

  it('tells the person why a verdict stopped the goal, what is open, and what they can do', () => {
    const stalled = { stalled: STALL_LIMIT - 1, gap: { open: 1, remaining: {} } }
    const step = seen(
      recordOf(active('attended', stalled as never)),
      found({ criteria: { A2: 'holds', A3: 'fails' } }),
    )
    if (step.kind !== 'next') throw new Error(step.kind)
    const note = pausedNote(step.record)
    expect(note).toContain(`连续 ${String(STALL_LIMIT)} 次核对，差距都没有变近。`)
    expect(note).toContain('[A3]')
    expect(note).toContain('你可以恢复、修订或取消这个目标。')
    const byExit = seen(recordOf(active('attended')), found({ metrics: {}, exits: ['X3'] }))
    if (byExit.kind !== 'next') throw new Error(byExit.kind)
    const asked = pausedNote(byExit.record)
    expect(asked).toContain('[X3] 要改公共接口才能达标')
    expect(asked).toContain('，或照 [X3] 收场。')
  })

  it('names each cause a verdict can pause on', () => {
    const paused = (row: 6 | 8) =>
      recordOf({
        ...active('attended'),
        status: 'paused',
        pause: { by: 'verdict', row, exit: null },
      } as SetGoalState)
    expect(pausedNote(paused(6))).toContain('达不成')
    expect(pausedNote(paused(8))).toContain('判定答不出')
  })

  it('says nothing of a pause for a goal the person paused, or one that is not paused', () => {
    const byPerson = { ...active('attended'), status: 'paused', pause: { by: 'person' } }
    expect(pausedNote(recordOf(byPerson as SetGoalState))).toBeNull()
    expect(pausedNote(recordOf(active('attended')))).toBeNull()
  })

  it('after a compaction tells the agent the purpose, where the material is and what is open; nothing when no goal is in progress', () => {
    const note = compactedNote(going.record)
    expect(note).toContain('Purpose: 把首页的加载时间降下来')
    expect(note).toContain('- [R1] 首页的渲染路径与已知的慢点')
    expect(note).toContain('Still open:\n- [A3]')
    const settled = seen(recordOf(active('attended')), DONE)
    if (settled.kind !== 'next') throw new Error(settled.kind)
    expect(compactedNote(settled.record)).toBeNull()
  })
})
