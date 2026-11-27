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
