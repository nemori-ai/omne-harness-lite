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
const start = { rounds: 3, stalled: 0, gap: null, examinations: 0 }
const spent = { rounds: 30, stalled: 0, gap: null, examinations: 0 }
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

describe('rows 3 and 4: the budget is reached', () => {
  /** Open, and short of what good enough stands on: M1 is past its floor. */
  const SHORT = found({ criteria: { A2: 'holds', A3: 'no-evidence' }, metrics: { M1: 1300 } })
  it('row 4 at the limit, not one round before it', () => {
    expect(rule(body(FULL), spent, SHORT)).toEqual({ row: 4, exit: 'X1', counts: 'failure' })
    expect(row(SHORT, { ...spent, rounds: 29 })).toBe(10)
    expect(row(SHORT, { ...spent, rounds: 31 })).toBe(4)
  })
  it('row 3 when what a good-enough exit stands on all holds: the floor of M1 and A2', () => {
    const enough = found({ criteria: { A2: 'holds', A3: 'fails' }, metrics: { M1: 1200 } })
    expect(rule(body(FULL), spent, enough)).toEqual({ row: 3, exit: 'X2', counts: 'success' })
  })
  it('row 4 when one of them does not: the metric short of its floor, or the criterion not held', () => {
    expect(row(found({ criteria: { A2: 'holds' }, metrics: { M1: 1201 } }), spent)).toBe(4)
    expect(row(found({ criteria: { A2: 'fails' }, metrics: { M1: 1000 } }), spent)).toBe(4)
    expect(row(found({ criteria: { A2: 'holds' }, metrics: {} }), spent)).toBe(4)
  })
  it('good enough is never reached before the budget', () => {
    const enough = found({ criteria: { A2: 'holds', A3: 'fails' }, metrics: { M1: 1100 } })
    expect(row(enough, start)).toBe(10)
  })
  it('the budget comes before every exit the judge saw, a dead end and a judge that did not answer', () => {
    const all = found({ ...SHORT, exits: ['X3', 'X4'], unattainable: true, judge: 'unavailable' })
    expect(row(all, spent)).toBe(4)
  })
})

describe('row 2: only what waits is open', () => {
  const WAITS: GoalDraft = {
    purpose: '做一个能玩的贪吃蛇',
    criteria: [
      {
        statement: '单元测试全过',
        evidence: { kind: 'command', command: 'node --test' },
        pass: { kind: 'exit-zero' },
      },
      { statement: '验收脚本通过', evidence: { kind: 'rerun', command: 'node accept.js' } },
      { statement: '方向键能控制蛇', evidence: { kind: 'examination', method: '用 node 走一局' } },
      { statement: '我看过了', evidence: { kind: 'person' } },
    ],
    rules: [{ statement: '不引第三方库。' }],
    exits: [
      {
        statement: '预算用尽',
        kind: 'budget',
        limits: [
          { amount: 30, unit: 'rounds' },
          { amount: 3, unit: 'examinations' },
        ],
        deliver: '做到哪算哪',
        counts: 'failure',
      },
      {
        statement: '预算用尽时测试是过的',
        kind: 'good-enough',
        by: [{ kind: 'criterion', id: 'A1' }],
        deliver: '现在的样子',
        counts: 'success',
      },
    ],
  }
  const waits = body(WAITS)
  const READ: Findings = {
    judge: 'answered',
    criteria: { A1: 'holds', A2: 'holds', A3: 'holds', A4: 'holds' },
    metrics: {},
    rules: { N1: 'kept' },
    exits: [],
    unattainable: false,
  }
  const read = (criteria: Findings['criteria'], pending: Findings['pending'] = []): Findings => ({
    ...READ,
    criteria: { ...READ.criteria, ...criteria },
    pending,
  })
  const at = (change: Partial<typeof start>) => ({ ...start, ...change })
  const ruled = (findings: Findings, progress = start) => rule(waits, progress, findings)

  it('hands over the run again and the examination nothing was read of, once everything read on the spot stands', () => {
    expect(ruled(read({ A2: 'no-evidence', A3: 'no-evidence' }))).toEqual({
      row: 2,
      hand: ['A2', 'A3'],
    })
    expect(ruled(read({ A3: 'stale' }))).toEqual({ row: 2, hand: ['A3'] })
    expect(ruled(read({ A2: undefined, A3: 'stale' }))).toEqual({ row: 2, hand: ['A2', 'A3'] })
  })

  it('waits and hands nothing over while the batch is out', () => {
    const out = read({ A2: 'gathering', A3: 'gathering' }, ['A2', 'A3'])
    expect(ruled(out)).toEqual({ row: 2, hand: [] })
    const unknown = read({ A2: 'cannot-tell', A3: 'cannot-tell' }, ['A2', 'A3'])
    expect(ruled(unknown)).toEqual({ row: 2, hand: [] })
  })

  it('waits for the person without handing anything over: the agent asks the person itself', () => {
    expect(ruled(read({ A4: 'no-evidence' }))).toEqual({ row: 2, hand: [] })
    expect(ruled(read({ A4: 'stale', A3: 'no-evidence' }))).toEqual({ row: 2, hand: ['A3'] })
  })

  it.each([
    ['a criterion read on the spot does not hold', read({ A1: 'fails', A3: 'no-evidence' })],
    ['a rule is broken', { ...read({ A3: 'no-evidence' }), rules: { N1: 'broken' } } as Findings],
    ['the examiner found it not done', read({ A3: 'fails' })],
    ['the examination could not tell, and that batch is back', read({ A3: 'cannot-tell' })],
    ['the judge could not tell what the person said', read({ A4: 'cannot-tell' })],
  ])('is not this row when %s: the round goes on', (_name, findings) => {
    expect(ruled(findings).row).toBe(10)
  })

  it('comes after achieved and before the budget of rounds', () => {
    expect(ruled(READ, at({ rounds: 30 }))).toEqual({ row: 1 })
    const out = read({ A3: 'gathering' }, ['A3'])
    expect(ruled(out, at({ rounds: 30 }))).toEqual({ row: 2, hand: [] })
    expect(ruled(read({ A3: 'no-evidence' }), at({ rounds: 30 }))).toEqual({ row: 2, hand: ['A3'] })
    expect(ruled(read({ A3: 'fails' }), at({ rounds: 30 }))).toEqual({
      row: 3,
      exit: 'X2',
      counts: 'success',
    })
  })

  it('the budget is reached when a batch is to be handed over and the examinations are used up', () => {
    const used = at({ examinations: 3 })
    expect(ruled(read({ A3: 'stale' }), at({ examinations: 2 }))).toEqual({ row: 2, hand: ['A3'] })
    expect(ruled(read({ A3: 'stale' }), used)).toEqual({ row: 3, exit: 'X2', counts: 'success' })
    expect(ruled(read({ A1: 'fails', A3: 'stale' }), used).row).toBe(10)
    expect(ruled(read({ A3: 'gathering' }, ['A3']), used)).toEqual({ row: 2, hand: [] })
    expect(ruled(read({ A4: 'no-evidence' }), used)).toEqual({ row: 2, hand: [] })
  })

  it('a metric short of its target keeps it from waiting; one at its target does not', () => {
    const measured = body({
      ...WAITS,
      metrics: [
        {
          statement: '一局的帧时间，毫秒',
          measure: { command: 'node bench.js', path: '.ms' },
          direction: 'lower',
          target: 16,
        },
      ],
    })
    const open = read({ A3: 'no-evidence' })
    expect(rule(measured, start, { ...open, metrics: { M1: 12 } })).toEqual({
      row: 2,
      hand: ['A3'],
    })
    expect(rule(measured, start, { ...open, metrics: { M1: 20 } }).row).toBe(10)
    expect(rule(measured, start, open).row).toBe(10)
  })

  it('a budget that names no examinations allows none, and a goal without a budget has nothing to bound them', () => {
    const [budget, enough] = waits.exits
    const rounds = { ...budget!, limits: [{ amount: 30, unit: 'rounds' } as const] }
    const unnamed = { ...waits, exits: [rounds, enough!] }
    expect(rule(unnamed, start, read({ A3: 'no-evidence' }))).toEqual({
      row: 3,
      exit: 'X2',
      counts: 'success',
    })
    expect(rule(unnamed, start, read({ A3: 'gathering' }, ['A3']))).toEqual({ row: 2, hand: [] })
    const unbounded = { ...waits, exits: [enough!] }
    expect(rule(unbounded, start, read({ A3: 'no-evidence' })).row).toBe(10)
    expect(rule(unbounded, start, read({ A4: 'no-evidence' }))).toEqual({ row: 2, hand: [] })
    expect(rule(unbounded, at({ rounds: 99 }), read({ A1: 'fails' })).row).toBe(10)
  })

  it('a budget that counts examinations is reached by its rounds as before', () => {
    expect(ruled(read({ A1: 'fails' }), at({ examinations: 3 })).row).toBe(10)
    expect(ruled(read({ A4: 'cannot-tell' }), at({ rounds: 30 }))).toEqual({
      row: 3,
      exit: 'X2',
      counts: 'success',
    })
    expect(ruled(read({ A1: 'no-evidence' }), at({ rounds: 30 }))).toEqual({
      row: 4,
      exit: 'X1',
      counts: 'failure',
    })
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
    expect(rule(two(), start, read(900, 400)).row).toBe(10)
  })
  it('a criterion holds by the metric it names, not by the first one', () => {
    expect(rule(two(), start, read(700, 600))).toMatchObject({
      row: 10,
      gap: { open: 2, remaining: { M2: 100 } },
    })
  })
  it('the budget is found wherever it stands, and is reached at the first of its limits', () => {
    expect(rule(two(), { ...start, rounds: 9 }, read(900, 800)).row).toBe(10)
    expect(rule(two(), { ...start, rounds: 10 }, read(900, 800))).toEqual({
      row: 4,
      exit: 'X2',
      counts: 'failure',
    })
  })
  it('good enough stands on the floor of the metric it names', () => {
    expect(rule(two(), { ...start, rounds: 10 }, read(5000, 650))).toEqual({
      row: 3,
      exit: 'X3',
      counts: 'success',
    })
  })
})

describe('rows 5 to 7: what the judge saw', () => {
  it('row 5: a condition exit came about', () => {
    expect(rule(body(FULL), start, found({ ...OPEN, exits: ['X4'] }))).toEqual({
      row: 5,
      exit: 'X4',
      counts: 'failure',
    })
  })
  it('row 6: an exit for the person to decide came about', () => {
    expect(rule(body(FULL), start, found({ ...OPEN, exits: ['X3'] }))).toEqual({
      row: 6,
      exit: 'X3',
      counts: 'failure',
    })
  })
  it('a condition comes before the person, and both before a dead end', () => {
    expect(row(found({ ...OPEN, exits: ['X3', 'X4'], unattainable: true }))).toBe(5)
    expect(row(found({ ...OPEN, exits: ['X3'], unattainable: true }))).toBe(6)
  })
  it('an exit of another kind named by mistake is not a way out: a budget or good-enough exit is never seen', () => {
    expect(row(found({ ...OPEN, exits: ['X1', 'X2'] }))).toBe(10)
  })
  it('row 7: an undeclared dead end', () => {
    expect(rule(body(FULL), start, found({ ...OPEN, unattainable: true }))).toEqual({ row: 7 })
  })
})

describe('rows 8 to 10: no way out yet', () => {
  it('row 10 carries the gap this observation saw, and a stall count of zero when it came closer', () => {
    expect(rule(body(FULL), start, OPEN)).toEqual({
      row: 10,
      stalled: 0,
      gap: { open: 3, remaining: { M1: 140 } },
    })
  })
  it('row 8 at the third observation in a row that did not come closer', () => {
    const gap = gapOf(body(FULL), OPEN)
    expect(STALL_LIMIT).toBe(3)
    expect(rule(body(FULL), { rounds: 5, stalled: 1, gap, examinations: 0 }, OPEN)).toEqual({
      row: 10,
      stalled: 2,
      gap,
    })
    expect(rule(body(FULL), { rounds: 6, stalled: 2, gap, examinations: 0 }, OPEN)).toEqual({
      row: 8,
      stalled: 3,
      gap,
    })
  })
  it('coming closer clears the stall count', () => {
    const before = gapOf(body(FULL), OPEN)
    const nearer = found({ ...OPEN, metrics: { M1: 900 } })
    expect(
      rule(body(FULL), { rounds: 6, stalled: 2, gap: before, examinations: 0 }, nearer),
    ).toMatchObject({
      row: 10,
      stalled: 0,
    })
  })
  it('row 9: the judge did not answer; that observation saw no gap, so it is not a stall', () => {
    const silent: Findings = { ...OPEN, judge: 'unavailable', criteria: {}, rules: {} }
    const gap = gapOf(body(FULL), OPEN)
    expect(rule(body(FULL), { rounds: 6, stalled: 2, gap, examinations: 0 }, silent)).toEqual({
      row: 9,
    })
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
