// The growth rule of J6 (`growth.ts`, R2-D17 and R2-D118) on synthetic series, so the judgement is
// checked without the 200 rounds of `w2-counts.spec.ts`: a flat series does not grow, a series
// that rises 0.1 per round does (the negative control of R2-D118), a noisy one with a low R² does
// not, and the constants are those of `METHOD.growth` of `tools/e9/metrics.mjs`.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CONTROL_PER_ROUND, GROWTH, median, roundGrowthOf } from './growth.ts'

const ROUNDS = 200
const series = (valueOf: (round: number) => number): number[] =>
  Array.from({ length: ROUNDS }, (_, index) => valueOf(index + 1))

describe('the growth rule of the timed counts', () => {
  it('a flat series does not grow', () => {
    const judged = roundGrowthOf(series(() => 7))
    expect(judged.grows).toBe(false)
    expect(judged.slope).toBe(0)
  })

  it('a flat series with one count that alternates by one does not grow', () => {
    expect(roundGrowthOf(series(round => 7 + (round % 2))).grows).toBe(false)
  })

  it('a series that rises by the control step every round grows', () => {
    const judged = roundGrowthOf(series(round => 7 + round * CONTROL_PER_ROUND))
    expect(judged.grows).toBe(true)
    expect(judged.slope).toBeCloseTo(CONTROL_PER_ROUND, 10)
    expect(judged.r2).toBeGreaterThanOrEqual(GROWTH.minR2)
  })

  it('a noisy series whose line explains little (low R²) does not grow', () => {
    // A pseudo-random series from a fixed linear congruential generator: the same on every run.
    let state = 12345
    const noise = series(() => {
      state = (state * 1103515245 + 12345) % 2147483648
      return (state / 2147483648) * 20
    })
    const judged = roundGrowthOf(noise)
    expect(judged.r2).toBeLessThan(GROWTH.minR2)
    expect(judged.grows).toBe(false)
  })

  it('a rising series whose line explains little (low R²) does not grow, whatever its slope', () => {
    // A trend of 0.1 per round with three whole blocks of 10 rounds shifted far off it: the slope is
    // positive and large against the median deviation of the residuals, only R² is low.
    const shifted = new Map([
      [5, 15],
      [12, -15],
      [17, 15],
    ])
    const spiky = series(round => {
      const block = Math.floor((round - GROWTH.firstRound) / GROWTH.blockSize) + 1
      return 20 + round * CONTROL_PER_ROUND + (shifted.get(block) ?? 0)
    })
    const judged = roundGrowthOf(spiky)
    expect(judged.slope).toBeGreaterThan(0)
    expect(judged.slope * GROWTH.span).toBeGreaterThan(GROWTH.madFactor * judged.residualMAD)
    expect(judged.r2).toBeLessThan(GROWTH.minR2)
    expect(judged.grows).toBe(false)
  })

  it('a falling series does not grow', () => {
    expect(roundGrowthOf(series(round => 40 - round * CONTROL_PER_ROUND)).grows).toBe(false)
  })

  it('takes the median of an even and of an odd number of values', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
  })
})

describe('the constants of the rule', () => {
  it('are those of METHOD.growth in tools/e9/metrics.mjs, item by item', () => {
    const text = readFileSync(
      new URL('../../../../../tools/e9/metrics.mjs', import.meta.url),
      'utf8',
    )
    const found = /growth:\s*\{([^}]*)\}/.exec(text)
    if (found === null) throw new Error('METHOD.growth was not found in tools/e9/metrics.mjs')
    const parsed = Object.fromEntries(
      found[1]!
        .split(',')
        .map(item => item.trim())
        .filter(item => item !== '')
        .map(item => {
          const [name, value] = item.split(':').map(part => part.trim())
          return [name!, Number(value)]
        }),
    )
    expect(parsed).toEqual(GROWTH)
  })
})
