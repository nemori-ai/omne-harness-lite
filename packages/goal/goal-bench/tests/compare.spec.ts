import { describe, expect, it } from 'vitest'
import { pairedLoss, type Tallies } from '../src/compare.ts'

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
