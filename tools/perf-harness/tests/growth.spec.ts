import { describe, expect, it } from 'vitest'
import { GROWTH, judgeGrowth, judgeSeries, median } from '../src/index.ts'
import { seeded } from './support.ts'

const rounds = (at: (round: number) => number): number[] =>
  Array.from({ length: GROWTH.lastRound }, (_, index) => at(index + 1))

describe('the growth of a reading over the rounds of one run', () => {
  it('passes a series that stays where it is, noise and all', () => {
    const noise = seeded(7)
    const { median: gate, growth } = judgeSeries(rounds(() => 100 + noise() * 6))
    expect(gate).toMatchObject({ state: 'pass' })
    expect(growth).toMatchObject({ state: 'pass' })
  })

  it('fails a series that rises with the round, on both gates', () => {
    const noise = seeded(7)
    const { median: gate, growth } = judgeSeries(rounds(round => 100 + round * 2 + noise() * 6))
    expect(gate).toMatchObject({ state: 'fail' })
    expect(growth).toMatchObject({ state: 'fail' })
  })

  it('fails growth alone on a slow steady rise the median gate lets through', () => {
    const { median: gate, growth } = judgeSeries(rounds(round => 100 + round * 0.1))
    expect(gate).toMatchObject({ state: 'pass' })
    expect(growth).toMatchObject({ state: 'fail' })
  })

  it('passes a single step up that does not keep rising: one jump is not growth', () => {
    const { growth } = judgeSeries(rounds(round => (round < 100 ? 100 : 104)))
    expect(growth).toMatchObject({ state: 'pass' })
  })

  it('blocks a series that is too short or holds a value that is not a number', () => {
    expect(judgeSeries([1, 2, 3]).growth.state).toBe('blocked')
    expect(judgeSeries(rounds(round => (round === 50 ? Number.NaN : 1))).median.state).toBe(
      'blocked',
    )
    expect(judgeGrowth([1]).state).toBe('blocked')
  })

  it('blocks the median gate when the early window is not positive', () => {
    expect(judgeSeries(rounds(() => 0)).median).toMatchObject({ state: 'blocked' })
  })

  it('takes the middle of a list, of either parity', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 2, 3])).toBe(2.5)
  })
})

const middleOf = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  const half = sorted.length / 2
  return sorted.length % 2 === 1
    ? sorted[Math.floor(half)]!
    : (sorted[half - 1]! + sorted[half]!) / 2
}

const sumOf = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0)

function plainFit(values: readonly number[]) {
  const points = Array.from({ length: 19 }, (_, block) => ({
    x: 15.5 + 10 * block,
    y: middleOf(values.slice(block * 10, block * 10 + 10)),
  }))
  const count = points.length
  const sumX = sumOf(points.map(point => point.x))
  const sumY = sumOf(points.map(point => point.y))
  const slope =
    (count * sumOf(points.map(point => point.x * point.y)) - sumX * sumY) /
    (count * sumOf(points.map(point => point.x * point.x)) - sumX * sumX)
  const intercept = (sumY - slope * sumX) / count
  const residuals = points.map(point => point.y - (intercept + slope * point.x))
  const total = sumOf(points.map(point => (point.y - sumY / count) ** 2))
  const middle = middleOf(residuals)
  return {
    slope,
    r2: total === 0 ? 0 : 1 - sumOf(residuals.map(value => value * value)) / total,
    residualMAD: middleOf(residuals.map(value => Math.abs(value - middle))),
    predictedGrowth: slope * 180,
  }
}

describe('the line through the block medians of rounds 11 to 200', () => {
  const from11 = (at: (round: number) => number): number[] =>
    Array.from({ length: 190 }, (_, index) => at(index + 11))

  it('is the plain least-squares line: slope, fit, spread of the residuals and rise over the span', () => {
    for (let seed = 1; seed <= 24; seed += 1) {
      const noise = seeded(seed)
      const rise = (seed % 5) * 0.4 - 0.4
      const spread = 1 + (seed % 7) * 4
      const values = from11(round => 500 + rise * round + (noise() - 0.5) * spread)
      const judged = judgeGrowth(values)
      const plain = plainFit(values)
      if (judged.state === 'blocked') throw new Error(judged.reason)
      expect(judged.slope).toBeCloseTo(plain.slope, 8)
      expect(judged.r2).toBeCloseTo(plain.r2, 8)
      expect(judged.residualMAD).toBeCloseTo(plain.residualMAD, 8)
      expect(judged.predictedGrowth).toBeCloseTo(plain.predictedGrowth, 6)
      const grows =
        plain.slope > 0 && plain.r2 >= 0.95 && plain.predictedGrowth > 3 * plain.residualMAD
      expect(judged.state).toBe(grows ? 'fail' : 'pass')
    }
  })

  it('reads a straight rise exactly', () => {
    const judged = judgeGrowth(from11(round => 100 + 2 * round))
    if (judged.state === 'blocked') throw new Error(judged.reason)
    expect(judged.state).toBe('fail')
    expect(judged.slope).toBeCloseTo(2, 10)
    expect(judged.r2).toBeCloseTo(1, 10)
    expect(judged.residualMAD).toBeCloseTo(0, 8)
    expect(judged.predictedGrowth).toBeCloseTo(360, 8)
  })

  it('passes a flat line and a falling one: no fit to speak of, or a slope the wrong way', () => {
    expect(judgeGrowth(from11(() => 7))).toEqual({
      state: 'pass',
      slope: 0,
      r2: 0,
      residualMAD: 0,
      predictedGrowth: 0,
    })
    const falling = judgeGrowth(from11(round => 500 - round))
    expect(falling).toMatchObject({ state: 'pass' })
    expect(falling.state === 'pass' && falling.slope).toBeCloseTo(-1, 10)
  })

  it('says why it cannot judge', () => {
    const short = { state: 'blocked', reason: 'requires 190 finite values of rounds 11-200' }
    expect(judgeGrowth([1])).toEqual(short)
    expect(judgeGrowth(from11(round => (round === 50 ? Number.NaN : 1)))).toEqual(short)
    expect(judgeGrowth(from11(round => (round - 105.5) * 1.8e306))).toEqual({
      state: 'blocked',
      reason: 'growth statistics exceed finite numeric range',
    })
  })
})

describe('the median gate of a series', () => {
  it('holds the middle of rounds 181 to 200 against the middle of rounds 11 to 30', () => {
    expect(judgeSeries(rounds(round => round)).median).toEqual({
      state: 'fail',
      ratio: 190.5 / 20.5,
      earlyMedian: 20.5,
      lateMedian: 190.5,
      threshold: 1.5,
    })
  })

  it('passes at the threshold itself and fails above it', () => {
    const late = (value: number) => rounds(round => (round > 180 ? value : 2))
    expect(judgeSeries(late(3)).median).toMatchObject({ state: 'pass', ratio: 1.5 })
    expect(judgeSeries(late(3.01)).median).toMatchObject({ state: 'fail' })
    expect(judgeSeries(late(3), 1.4).median).toMatchObject({ state: 'fail', threshold: 1.4 })
  })

  it('says why it cannot judge: too few values, or an early window that is not positive', () => {
    const few = { state: 'blocked', reason: 'requires 200 finite values' }
    expect(judgeSeries([1, 2, 3])).toEqual({ median: few, growth: few })
    expect(judgeSeries(rounds(() => -1)).median).toEqual({
      state: 'blocked',
      reason: 'early median is not positive',
    })
  })

  it('refuses a threshold that is not a positive number', () => {
    for (const threshold of [0, -1, Number.NaN, Number.POSITIVE_INFINITY])
      expect(() =>
        judgeSeries(
          rounds(() => 1),
          threshold,
        ),
      ).toThrow('threshold must be a finite positive number')
  })
})
