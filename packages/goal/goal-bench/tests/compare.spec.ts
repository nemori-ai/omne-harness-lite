import { fileURLToPath } from 'node:url'
import { BASELINE_JUDGE_CONFIG, DEFAULT_JUDGE_CONFIG } from '@omne-harness/goal-contract'
import { describe, expect, it } from 'vitest'
import { configOf, overBaseline } from '../src/config.ts'
import { pairedLoss, renderComparison, talliesOf, type Tallies } from '../src/compare.ts'
import type { Report } from '../src/report.ts'
import { WEIGHTS, type Graded } from '../src/score.ts'

const tally = (entries: number, loss: number) => ({ entries, loss, notHolds: 0, falseHolds: 0 })

describe('the paired difference of weighted loss between two configurations', () => {
  const base: Tallies = { a: tally(2, 4), b: tally(2, 0) }
  const candidate: Tallies = { a: tally(2, 2), b: tally(2, 0) }

  it('is the candidate’s mean loss minus the base’s, over the same parents', () => {
    const found = pairedLoss(base, candidate)
    expect(found.difference).toBe(-0.5)
    expect(found.parents).toBe(2)
  })
  it('brackets it by resampling parents: two parents give −1, −0.5 or 0, so the interval is −1 to 0', () => {
    const found = pairedLoss(base, candidate, { draws: 4000, seed: 7 })
    expect([found.low, found.high]).toEqual([-1, 0])
  })
  it('is zero with a zero interval when the two are the same', () => {
    expect(pairedLoss(base, base)).toMatchObject({ difference: 0, low: 0, high: 0 })
  })
  it('gives the same interval for the same seed, and mirrors it when the two are swapped', () => {
    const many: Tallies = { a: tally(3, 6), b: tally(2, 0), c: tally(5, 5), d: tally(4, 1) }
    const other: Tallies = { a: tally(3, 3), b: tally(2, 2), c: tally(5, 0), d: tally(4, 1) }
    const one = pairedLoss(many, other, { seed: 11 })
    expect(pairedLoss(many, other, { seed: 11 })).toEqual(one)
    const back = pairedLoss(other, many, { seed: 11 })
    expect(back.difference).toBeCloseTo(-one.difference, 12)
    expect(back.low).toBeCloseTo(-one.high, 12)
    expect(back.high).toBeCloseTo(-one.low, 12)
    expect(one.low).toBeLessThanOrEqual(one.difference)
    expect(one.high).toBeGreaterThanOrEqual(one.difference)
    const few = Array.from({ length: 20 }, (_unused, seed) =>
      JSON.stringify(pairedLoss(many, other, { seed, draws: 9 })),
    )
    expect(new Set(few).size).toBeGreaterThan(1)
  })
  it('weighs a parent by how many entries it has', () => {
    const big: Tallies = { a: tally(8, 8), b: tally(2, 0) }
    const better: Tallies = { a: tally(8, 0), b: tally(2, 2) }
    expect(pairedLoss(big, better).difference).toBeCloseTo(2 / 10 - 8 / 10, 12)
  })
  it('refuses two runs over different parents', () => {
    expect(() => pairedLoss(base, { a: tally(2, 2) })).toThrow(
      'the two runs do not cover the same parents',
    )
    expect(() => pairedLoss(base, { a: tally(2, 2), c: tally(2, 0) })).toThrow(
      'the two runs do not cover the same parents',
    )
  })
})

describe('what each parent came to in a run', () => {
  const entry = (id: string, change: Partial<Graded>): Graded => ({
    case: id,
    family: 'clean',
    id: 'A1',
    kind: 'criterion',
    truth: 'holds',
    safe: [],
    said: 'holds',
    asked: true,
    probability: null,
    endsInSuccess: false,
    ...change,
  })

  it('counts the entries, their loss, the ones that do not hold and the ones let stand, by the parent of the case', () => {
    const entries = [
      entry('p01/clean', {}),
      entry('p01/break-a', { truth: 'fails', said: 'holds' }),
      entry('p01/break-b', { truth: 'fails', said: 'fails' }),
      entry('p02/clean', { said: 'cannot-tell' }),
      entry('p02/rule', { kind: 'rule', id: 'N1', truth: 'broken', said: 'kept' }),
    ]
    expect(talliesOf(entries)).toEqual({
      p01: { entries: 3, loss: WEIGHTS.falseHolds, notHolds: 2, falseHolds: 1 },
      p02: {
        entries: 2,
        loss: WEIGHTS.abstain + WEIGHTS.missedViolation,
        notHolds: 0,
        falseHolds: 0,
      },
    })
  })
})

describe('the page that sets two configurations side by side', () => {
  const rate = (errors: number, n: number) => ({ errors, n, rate: errors / n })
  const report = (change: { falseHolds: number; loss: number; exit: number }) =>
    ({
      name: 'x',
      split: 'verify,canary',
      parents: 16,
      cases: 168,
      gates: {
        falseHolds: { ...rate(change.falseHolds, 134), upper: 0.05 },
        falseSettles: rate(change.falseHolds, 150),
        discrimination: { exit: { n: 20, parent: 0, child: change.exit, value: change.exit } },
      },
      ranking: {
        loss: change.loss,
        missed: rate(10, 100),
        abstained: rate(5, 100),
        missedViolations: rate(1, 15),
      },
      cost: { requestsPerCase: 1, costPerCase: 0.0003 },
    }) as unknown as Report

  it('gives each gate and each ranking number of both, and the paired difference with its interval', () => {
    const page = renderComparison(
      report({ falseHolds: 6, loss: 0.288, exit: 0.4 }),
      report({ falseHolds: 1, loss: 0.174, exit: 0.95 }),
      { difference: -0.114, low: -0.171, high: -0.062, parents: 16 },
    )
    expect(page).toContain(
      '| 误判成立率 | 4.5%（6/134），95% 上界 5.0% | 0.7%（1/134），95% 上界 5.0% |',
    )
    expect(page).toContain('| 目标级的误收场率 | 4.0%（6/150） | 0.7%（1/150） |')
    expect(page).toContain('| 成对的分辨力 · exit | 0.40（20 对） | 0.95（20 对） |')
    expect(page).toContain('| 加权损失 | 0.288 | 0.174 |')
    expect(page).toContain('最终减基线 −0.114，95% 区间 −0.171 到 −0.062（按 16 个母本重抽样）')
    expect(page).toContain('16 个母本，168 个用例')
  })
})

describe('the configuration the bench settled on', () => {
  it('is the default scheme of the goal contract: the kept file over the baseline gives exactly it', () => {
    const file = fileURLToPath(new URL('../configs/final.json', import.meta.url))
    expect(configOf(file)).toEqual(DEFAULT_JUDGE_CONFIG)
    expect(configOf(undefined)).toEqual(BASELINE_JUDGE_CONFIG)
    expect(overBaseline({ line: 0.7 })).toEqual({ ...BASELINE_JUDGE_CONFIG, line: 0.7 })
  })
})
