import { describe, expect, it } from 'vitest'
import {
  NO_EXAMINATION,
  type CriterionId,
  type Examination,
  type GoalRecord,
} from '@omne-harness/goal-contract'
import { decideCommand, decideWrite, type WriteInput } from '@omne-harness/goal'

const DRAFT = {
  purpose: '做一个能玩的贪吃蛇',
  criteria: [
    { statement: '验收脚本通过', evidence: { kind: 'rerun', command: 'node accept.js' } },
    { statement: '方向键能控制蛇', evidence: { kind: 'examination', method: '用 node 走一局' } },
    { statement: '写了说明', evidence: { kind: 'file', path: 'README.md' } },
  ],
}
const write = (proposal: WriteInput['proposal'], operation: string): WriteInput => ({
  session: 's',
  attendance: 'attended',
  moment: '41',
  proposal,
  entrance: { via: 'direct', draftedBy: 'person', by: 'acc-1' },
  operation,
  words: null,
  asked: null,
  at: '2026-11-26T00:00:00.000Z',
})
const A1 = 'A1' as CriterionId
const A2 = 'A2' as CriterionId
const OUT: Examination = {
  ...NO_EXAMINATION,
  batch: {
    key: { revision: 1, written: 'call-9' },
    criteria: [A1, A2],
    delivery: 'handed',
    ran: {},
  },
  used: 1,
}

function waiting(): GoalRecord {
  const set = decideWrite(null, write({ kind: 'set', draft: DRAFT }, 'op-1'))
  if (set.kind !== 'next') throw new Error(set.kind)
  expect(set.record.examination).toEqual(NO_EXAMINATION)
  return { ...set.record, examination: OUT }
}
function after(step: ReturnType<typeof decideCommand>): GoalRecord {
  if (step?.kind !== 'next') throw new Error(String(step?.kind))
  return step.record
}

describe('a batch that is out when the owner changes the goal', () => {
  it('stays out through a pause and a resume', () => {
    const paused = after(decideCommand(waiting(), { kind: 'pause' }))
    expect(paused.examination).toEqual(OUT)
    expect(after(decideCommand(paused, { kind: 'resume' })).examination).toEqual(OUT)
  })

  it('is taken back by a cancel; the count of examinations is kept', () => {
    const cancelled = after(decideCommand(waiting(), { kind: 'cancel' }))
    expect(cancelled.state.status).toBe('settled')
    expect(cancelled.examination).toEqual({ ...OUT, batch: null })
  })

  it('is taken back by an abort of the creator', () => {
    const alone = waiting()
    const unattended = {
      ...alone,
      state: { ...alone.state, attendance: 'unattended' },
    } as GoalRecord
    expect(after(decideCommand(unattended, { kind: 'abort' })).examination.batch).toBeNull()
  })

  it('is taken back by a revision that touches one of its criteria, and stays through one that does not', () => {
    const touching = [
      {
        op: 'replace',
        id: 'A2',
        entry: { ...DRAFT.criteria[1], statement: '方向键与 WASD 都能控制蛇' },
      },
    ]
    const touched = decideWrite(waiting(), write({ kind: 'revise', changes: touching }, 'op-2'))
    if (touched.kind !== 'next') throw new Error(touched.kind)
    expect(touched.record.state.revision).toBe(2)
    expect(touched.record.examination).toEqual({ ...OUT, batch: null })
    const beside = [
      { op: 'replace', id: 'A3', entry: { ...DRAFT.criteria[2], statement: '写了中文说明' } },
    ]
    const left = decideWrite(waiting(), write({ kind: 'revise', changes: beside }, 'op-3'))
    if (left.kind !== 'next') throw new Error(left.kind)
    expect(left.record.examination).toEqual(OUT)
  })
})
