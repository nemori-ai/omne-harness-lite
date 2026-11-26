import { describe, expect, it } from 'vitest'
import {
  closer,
  gapOf,
  rule,
  STALL_LIMIT,
  validateDraft,
  type Findings,
  type GoalBody,
  type GoalDraft,
} from '@omne-harness/goal-contract'
import { HOME } from './fixtures.ts'

function body(draft: GoalDraft = HOME): GoalBody {
  const checked = validateDraft(draft, { attendance: 'attended' })
  if (checked.kind !== 'valid') throw new Error(JSON.stringify(checked.issues))
  return checked.body
}
/** HOME plus a condition exit X4, so every kind of exit is present. */
const FULL: GoalDraft = {
  ...HOME,
  exits: [
    ...HOME.exits!,
    {
      statement: '测试环境不可用超过一天',
      kind: 'condition',
      deliver: '已经做的改动',
      counts: 'failure',
    },
  ],
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
const OPEN = found({ criteria: { A2: 'holds', A3: 'no-evidence' }, metrics: { M1: 940 } })
const start = { rounds: 3, stalled: 0, gap: null }
const spent = { rounds: 30, stalled: 0, gap: null }
const row = (findings: Findings, progress = start, of: GoalBody = body(FULL)) =>
  rule(of, progress, findings).row

describe('row 1: achieved', () => {
  it('every criterion holds, every metric is at its target, no rule is broken', () => {
    expect(rule(body(FULL), start, DONE)).toEqual({ row: 1 })
  })
  it('a criterion measured by a metric holds by the reading, with no answer of the judge', () => {
    expect(DONE.criteria).not.toHaveProperty('A1')
    expect(row(found({ metrics: { M1: 800 } }))).toBe(1)
    expect(row(found({ metrics: { M1: 801 } }))).not.toBe(1)
    expect(row(found({ metrics: {} }))).not.toBe(1)
  })
  it.each(['fails', 'no-evidence', 'stale', 'cannot-tell'] as const)(
    'a criterion read as %s is not held',
    reading => expect(row(found({ criteria: { A2: 'holds', A3: reading } }))).not.toBe(1),
  )
  it('a criterion nobody read is not held', () => {
    expect(row(found({ criteria: { A2: 'holds' } }))).not.toBe(1)
  })
  it('a broken rule keeps it from achieved; an unclear one does not', () => {
    expect(row(found({ rules: { N1: 'broken', N2: 'kept' } }))).not.toBe(1)
    expect(row(found({ rules: { N1: 'unclear' } }))).toBe(1)
  })
  it('a metric where higher is better is reached from above', () => {
    const higher = body({
      ...HOME,
      metrics: [{ ...HOME.metrics![0]!, direction: 'higher', target: 90, floor: 60 }],
    })
    expect(row(found({ metrics: { M1: 90 } }), start, higher)).toBe(1)
    expect(row(found({ metrics: { M1: 89 } }), start, higher)).not.toBe(1)
  })
  it('comes before the budget: a goal done on its last round is achieved, not out of budget', () => {
    expect(rule(body(FULL), spent, DONE)).toEqual({ row: 1 })
  })
})

describe('rows 2 and 3: the budget is reached', () => {
  /** Open, and short of what good enough stands on: M1 is past its floor. */
  const SHORT = found({ criteria: { A2: 'holds', A3: 'no-evidence' }, metrics: { M1: 1300 } })
  it('row 3 at the limit, not one round before it', () => {
    expect(rule(body(FULL), spent, SHORT)).toEqual({ row: 3, exit: 'X1', counts: 'failure' })
    expect(row(SHORT, { ...spent, rounds: 29 })).toBe(9)
    expect(row(SHORT, { ...spent, rounds: 31 })).toBe(3)
  })
  it('row 2 when what a good-enough exit stands on all holds: the floor of M1 and A2', () => {
    const enough = found({ criteria: { A2: 'holds', A3: 'fails' }, metrics: { M1: 1200 } })
    expect(rule(body(FULL), spent, enough)).toEqual({ row: 2, exit: 'X2', counts: 'success' })
  })
  it('row 3 when one of them does not: the metric short of its floor, or the criterion not held', () => {
    expect(row(found({ criteria: { A2: 'holds' }, metrics: { M1: 1201 } }), spent)).toBe(3)
    expect(row(found({ criteria: { A2: 'fails' }, metrics: { M1: 1000 } }), spent)).toBe(3)
    expect(row(found({ criteria: { A2: 'holds' }, metrics: {} }), spent)).toBe(3)
  })
  it('good enough is never reached before the budget', () => {
    const enough = found({ criteria: { A2: 'holds', A3: 'fails' }, metrics: { M1: 1100 } })
    expect(row(enough, start)).toBe(9)
  })
  it('the budget comes before every exit the judge saw, a dead end and a judge that did not answer', () => {
    const all = found({ ...SHORT, exits: ['X3', 'X4'], unattainable: true, judge: 'unavailable' })
    expect(row(all, spent)).toBe(3)
  })
})

describe('a goal of two metrics, its budget written after another exit and with two limits', () => {
  const list = {
    ...HOME.metrics![0]!,
    statement: '列表页 p95 加载时间，毫秒',
    target: 500,
    floor: 700,
  }
  const two = () =>
    body({
      purpose: '把首页与列表页的加载时间降下来',
      criteria: [{ statement: '列表页到目标', evidence: { kind: 'metric', metric: 'M2' } }],
      metrics: [HOME.metrics![0]!, list],
      exits: [
        { statement: '要改接口', kind: 'person', deliver: '原因', counts: 'failure' },
        {
          statement: '预算用尽',
          kind: 'budget',
          limits: [
            { amount: 10, unit: 'rounds' },
            { amount: 20, unit: 'rounds' },
          ],
          deliver: '改动',
          counts: 'failure',
        },
        {
          statement: '列表页够用',
          kind: 'good-enough',
          by: [{ kind: 'floor', id: 'M2' }],
          deliver: '改动',
          counts: 'success',
        },
      ],
    })
  const read = (M1: number, M2: number): Findings => found({ criteria: {}, metrics: { M1, M2 } })
  it('is achieved only when every metric is at its target, not when one of them is', () => {
    expect(rule(two(), start, read(800, 500))).toEqual({ row: 1 })
    expect(rule(two(), start, read(900, 400)).row).toBe(9)
  })
  it('a criterion holds by the metric it names, not by the first one', () => {
    expect(rule(two(), start, read(700, 600))).toMatchObject({
      row: 9,
      gap: { open: 2, remaining: { M2: 100 } },
    })
  })
  it('the budget is found wherever it stands, and is reached at the first of its limits', () => {
    expect(rule(two(), { ...start, rounds: 9 }, read(900, 800)).row).toBe(9)
    expect(rule(two(), { ...start, rounds: 10 }, read(900, 800))).toEqual({
      row: 3,
      exit: 'X2',
      counts: 'failure',
    })
  })
  it('good enough stands on the floor of the metric it names', () => {
    expect(rule(two(), { ...start, rounds: 10 }, read(5000, 650))).toEqual({
      row: 2,
      exit: 'X3',
      counts: 'success',
    })
  })
})

describe('rows 4 to 6: what the judge saw', () => {
  it('row 4: a condition exit came about', () => {
    expect(rule(body(FULL), start, found({ ...OPEN, exits: ['X4'] }))).toEqual({
      row: 4,
      exit: 'X4',
      counts: 'failure',
    })
  })
  it('row 5: an exit for the person to decide came about', () => {
    expect(rule(body(FULL), start, found({ ...OPEN, exits: ['X3'] }))).toEqual({
      row: 5,
      exit: 'X3',
      counts: 'failure',
    })
  })
  it('a condition comes before the person, and both before a dead end', () => {
    expect(row(found({ ...OPEN, exits: ['X3', 'X4'], unattainable: true }))).toBe(4)
    expect(row(found({ ...OPEN, exits: ['X3'], unattainable: true }))).toBe(5)
  })
  it('an exit of another kind named by mistake is not a way out: a budget or good-enough exit is never seen', () => {
    expect(row(found({ ...OPEN, exits: ['X1', 'X2'] }))).toBe(9)
  })
  it('row 6: an undeclared dead end', () => {
    expect(rule(body(FULL), start, found({ ...OPEN, unattainable: true }))).toEqual({ row: 6 })
  })
})

describe('rows 7 to 9: no way out yet', () => {
  it('row 9 carries the gap this observation saw, and a stall count of zero when it came closer', () => {
    expect(rule(body(FULL), start, OPEN)).toEqual({
      row: 9,
      stalled: 0,
      gap: { open: 3, remaining: { M1: 140 } },
    })
  })
  it('row 7 at the third observation in a row that did not come closer', () => {
    const gap = gapOf(body(FULL), OPEN)
    expect(STALL_LIMIT).toBe(3)
    expect(rule(body(FULL), { rounds: 5, stalled: 1, gap }, OPEN)).toEqual({
      row: 9,
      stalled: 2,
      gap,
    })
    expect(rule(body(FULL), { rounds: 6, stalled: 2, gap }, OPEN)).toEqual({
      row: 7,
      stalled: 3,
      gap,
    })
  })
  it('coming closer clears the stall count', () => {
    const before = gapOf(body(FULL), OPEN)
    const nearer = found({ ...OPEN, metrics: { M1: 900 } })
    expect(rule(body(FULL), { rounds: 6, stalled: 2, gap: before }, nearer)).toMatchObject({
      row: 9,
      stalled: 0,
    })
  })
  it('row 8: the judge did not answer; that observation saw no gap, so it is not a stall', () => {
    const silent: Findings = { ...OPEN, judge: 'unavailable', criteria: {}, rules: {} }
    const gap = gapOf(body(FULL), OPEN)
    expect(rule(body(FULL), { rounds: 6, stalled: 2, gap }, silent)).toEqual({ row: 8 })
  })
  it('a goal the system can read alone is achieved even when the judge did not answer', () => {
    const measured = body({
      purpose: '把首页的加载时间降下来',
      criteria: [{ statement: '到目标', evidence: { kind: 'metric', metric: 'M1' } }],
      metrics: [HOME.metrics![0]!],
    })
    const silent: Findings = { ...DONE, judge: 'unavailable', criteria: {}, rules: {} }
    expect(rule(measured, start, silent)).toEqual({ row: 1 })
  })
})

describe('the gap and whether it came closer', () => {
  const gap = (open: number, remaining: Record<string, number> = {}) => ({ open, remaining })
  it('counts the criteria not held, the metrics short of target and the rules broken', () => {
    expect(gapOf(body(FULL), DONE)).toEqual({ open: 0, remaining: {} })
    const far = found({ criteria: {}, metrics: {}, rules: { N1: 'broken', N2: 'unclear' } })
    expect(gapOf(body(FULL), far)).toEqual({ open: 5, remaining: {} })
  })
  it.each([
    ['the first observation', null, gap(3), true],
    ['fewer entries open', gap(3), gap(2), true],
    ['more entries open', gap(2, { M1: 300 }), gap(3, { M1: 100 }), false],
    ['as many open, nothing measured', gap(2), gap(2), false],
    ['as many open, a metric nearer', gap(2, { M1: 300 }), gap(2, { M1: 140 }), true],
    ['as many open, the metric where it was', gap(2, { M1: 140 }), gap(2, { M1: 140 }), false],
    ['as many open, the metric farther', gap(2, { M1: 140 }), gap(2, { M1: 141 }), false],
    [
      'one metric nearer and another farther',
      gap(2, { M1: 300, M2: 5 }),
      gap(2, { M1: 100, M2: 6 }),
      false,
    ],
    ['a metric read for the first time', gap(2), gap(2, { M1: 140 }), false],
    [
      'one metric nearer and another read for the first time',
      gap(2, { M1: 300 }),
      gap(2, { M1: 100, M2: 5 }),
      true,
    ],
    [
      'one metric nearer and another where it was',
      gap(2, { M1: 300, M2: 5 }),
      gap(2, { M1: 100, M2: 5 }),
      true,
    ],
  ])('%s: closer is %s', (_name, before, now, expected) => {
    expect(closer(before as never, now as never)).toBe(expected)
  })
})
