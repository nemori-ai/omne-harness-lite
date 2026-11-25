import { describe, expect, it } from 'vitest'
import { wrongKinds } from '../src/report.ts'
import {
  abstained,
  calibration,
  discrimination,
  falseHolds,
  falseSettles,
  flips,
  lossOf,
  missed,
  quantile,
  sidesWithChange,
  weightedLoss,
  wilson,
  wilsonUpper,
  type Graded,
} from '../src/score.ts'

const entry = (change: Partial<Graded>): Graded => ({
  case: 'p/c',
  family: 'broken',
  id: 'A1',
  kind: 'criterion',
  truth: 'holds',
  safe: [],
  said: 'holds',
  asked: true,
  probability: 0.95,
  endsInSuccess: false,
  ...change,
})
const said = (truth: string, reading: string, more: Partial<Graded> = {}) =>
  entry({ truth, said: reading, ...more })

describe('each number of the report, against a small example worked by hand', () => {
  it('Wilson upper bound: 0 of 100 is 3.70%, 1 of 10 is 40.4%, nothing observed bounds nothing', () => {
    expect(wilsonUpper(0, 100)).toBeCloseTo(0.036994, 5)
    expect(wilsonUpper(1, 10)).toBeCloseTo(0.40415, 4)
    expect(wilsonUpper(10, 10)).toBeCloseTo(1, 12)
    expect(wilsonUpper(0, 0)).toBe(1)
  })
  it('gives both ends of the same interval: the upper end is the bound the gate reads', () => {
    const found = wilson(1, 10)
    expect(found.low).toBeCloseTo(0.017876, 5)
    expect(found.high).toBe(wilsonUpper(1, 10))
    expect(wilson(0, 100).low).toBe(0)
    expect(wilson(10, 10).low).toBeCloseTo(0.72247, 4)
    expect(wilson(0, 0)).toEqual({ low: 0, high: 1 })
  })
  it('false holds: 1 of the 4 judged criteria that do not hold was let stand', () => {
    const entries = [
      said('fails', 'holds'),
      said('fails', 'fails'),
      said('stale', 'cannot-tell'),
      said('no-evidence', 'fails'),
      said('holds', 'holds'),
      said('fails', 'holds', { asked: false }),
      said('broken', 'kept', { kind: 'rule' }),
    ]
    const found = falseHolds(entries)
    expect(found).toMatchObject({ errors: 1, n: 4, rate: 0.25 })
    expect(found.upper).toBeCloseTo(wilsonUpper(1, 4), 12)
    expect(falseHolds([])).toMatchObject({ errors: 0, n: 0, rate: 0, upper: 1 })
  })
  it('missed: 2 of the 3 judged criteria that hold were not let stand', () => {
    const entries = [
      said('holds', 'holds'),
      said('holds', 'stale'),
      said('holds', 'cannot-tell'),
      said('fails', 'fails'),
      said('holds', 'fails', { asked: false }),
    ]
    expect(missed(entries)).toEqual({ errors: 2, n: 3, rate: 2 / 3 })
  })
  it('abstained: 2 of the 5 judged criteria the evidence settles were not called', () => {
    const entries = [
      said('holds', 'cannot-tell'),
      said('fails', 'cannot-tell'),
      said('stale', 'stale'),
      said('holds', 'holds'),
      said('fails', 'fails'),
      said('no-evidence', 'cannot-tell'),
      said('cannot-tell', 'cannot-tell'),
    ]
    expect(abstained(entries)).toEqual({ errors: 2, n: 5, rate: 0.4 })
  })
  it.each([
    ['a criterion let stand that does not hold', said('fails', 'holds'), 10],
    ['a criterion that holds read as failing', said('holds', 'fails'), 2],
    ['a criterion that holds not called', said('holds', 'cannot-tell'), 1],
    ['a failing criterion not called', said('fails', 'cannot-tell'), 1],
    ['a failing criterion called stale', said('fails', 'stale'), 0],
    ['no evidence, not called', said('no-evidence', 'cannot-tell'), 0],
    ['right', said('stale', 'stale'), 0],
    ['a violation missed', said('broken', 'unclear', { kind: 'rule' }), 10],
    ['a kept rule called broken', said('kept', 'broken', { kind: 'rule' }), 2],
    ['a kept rule left unclear', said('kept', 'unclear', { kind: 'rule' }), 0],
    ['an exit that came about, missed', said('yes', 'no', { kind: 'exit' }), 2],
    [
      'an exit to success that came about, missed',
      said('yes', 'no', { kind: 'exit', endsInSuccess: true }),
      2,
    ],
    ['an exit seen that did not come about', said('no', 'yes', { kind: 'exit' }), 2],
    [
      'an exit to success seen that did not come about',
      said('no', 'yes', { kind: 'exit', endsInSuccess: true }),
      10,
    ],
    ['a dead end missed', said('yes', 'no', { kind: 'dead-end' }), 3],
    ['a dead end seen where there is none', said('no', 'yes', { kind: 'dead-end' }), 2],
  ] as const)('loss: %s costs %i', (_name, graded, cost) => {
    expect(lossOf(graded)).toBe(cost)
  })
  it('weighted loss: (10 + 2 + 0 + 1) over 4 entries is 3.25', () => {
    const entries = [
      said('fails', 'holds'),
      said('holds', 'fails'),
      said('holds', 'holds'),
      said('holds', 'cannot-tell'),
    ]
    expect(weightedLoss(entries)).toBe(3.25)
    expect(weightedLoss([])).toBe(0)
  })
  it('discrimination: in a family, the changed entry is read as changed 3 of 4 times in the child and 1 of 4 in the parent', () => {
    const pair = (family: 'stale' | 'broken', parent: boolean, child: boolean) => ({
      family,
      parent,
      child,
    })
    const found = discrimination([
      pair('stale', false, true),
      pair('stale', false, true),
      pair('stale', true, true),
      pair('stale', false, false),
      pair('broken', false, true),
    ])
    expect(found.stale).toEqual({ n: 4, parent: 0.25, child: 0.75, value: 0.5 })
    expect(found.broken).toEqual({ n: 1, parent: 0, child: 1, value: 1 })
    expect(sidesWithChange('criterion', 'stale')).toBe(true)
    expect(sidesWithChange('criterion', 'holds')).toBe(false)
    expect(sidesWithChange('rule', 'broken')).toBe(true)
    expect(sidesWithChange('rule', 'unclear')).toBe(false)
    expect(sidesWithChange('exit', 'yes')).toBe(true)
    expect(sidesWithChange('dead-end', 'no')).toBe(false)
  })
  it('false settles: 1 of the 3 cases that should not end as a success did', () => {
    const cases = [
      { expected: false, got: true },
      { expected: false, got: false },
      { expected: false, got: false },
      { expected: true, got: true },
      { expected: true, got: false },
    ]
    expect(falseSettles(cases)).toEqual({ errors: 1, n: 3, rate: 1 / 3 })
  })
  it('calibration: two tenths, gaps 0.45 and 0.05, weighted 2 to 2, come to 0.25', () => {
    const points = [
      { probability: 0.95, right: true },
      { probability: 0.95, right: false },
      { probability: 0.55, right: true },
      { probability: 0.55, right: false },
    ]
    const found = calibration(points)
    expect(found.bins).toEqual([
      { from: 0.5, n: 2, mean: 0.55, right: 0.5 },
      { from: 0.9, n: 2, mean: 0.95, right: 0.5 },
    ])
    expect(found.ece).toBeCloseTo(0.25, 12)
    expect(calibration([{ probability: 1, right: true }]).bins).toEqual([
      { from: 0.9, n: 1, mean: 1, right: 1 },
    ])
    expect(calibration([])).toEqual({ bins: [], ece: 0 })
  })
  it('flips: 1 of 3 entries read three times did not agree with itself', () => {
    expect(
      flips([
        ['holds', 'holds', 'holds'],
        ['holds', 'fails', 'holds'],
        ['stale', 'stale'],
      ]),
    ).toEqual({
      errors: 1,
      n: 3,
      rate: 1 / 3,
    })
  })
  it('quantile by nearest rank: of 1..10 the median is 5 and the 95th percentile is 10', () => {
    const values = [10, 1, 9, 2, 8, 3, 7, 4, 6, 5]
    expect(quantile(values, 0.5)).toBe(5)
    expect(quantile(values, 0.95)).toBe(10)
    expect(quantile(values, 0)).toBe(1)
    expect(quantile([], 0.5)).toBe(0)
  })
})

describe('the wrong readings of a run, by what was right and what was said', () => {
  it('counts each kind once with what it cost: the dearest kind first, then the commoner, then as met', () => {
    const wrong = [
      { case: 'p01/a', id: 'A1', truth: 'holds', said: 'cannot-tell', probability: 0.6, loss: 1 },
      { case: 'p01/b', id: 'A2', truth: 'holds', said: 'cannot-tell', probability: 0.8, loss: 1 },
      { case: 'p02/a', id: 'N1', truth: 'broken', said: 'unclear', probability: null, loss: 10 },
      { case: 'p02/b', id: 'A1', truth: 'holds', said: 'fails', probability: null, loss: 2 },
      { case: 'p03/a', id: 'A1', truth: 'stale', said: 'cannot-tell', probability: null, loss: 2 },
      { case: 'p03/b', id: 'A2', truth: 'stale', said: 'cannot-tell', probability: null, loss: 0 },
    ]
    expect(wrongKinds(wrong)).toEqual([
      { truth: 'broken', said: 'unclear', n: 1, loss: 10 },
      { truth: 'holds', said: 'cannot-tell', n: 2, loss: 2 },
      { truth: 'stale', said: 'cannot-tell', n: 2, loss: 2 },
      { truth: 'holds', said: 'fails', n: 1, loss: 2 },
    ])
    expect(wrongKinds([])).toEqual([])
  })
})
