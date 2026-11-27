import { describe, expect, it } from 'vitest'
import {
  MAX_ROUNDS,
  MIN_ROUNDS,
  judgeEquivalence,
  judgePaired,
  orderOf,
  wantsMore,
  type Round,
  type Side,
} from '../src/index.ts'
import { seeded } from './support.ts'

function rounds(count: number, candidate: number, spread: number, seed = 11): Round[] {
  const noise = seeded(seed)
  const jitter = (): number => 1 + (noise() - 0.5) * 2 * spread
  return Array.from({ length: count }, () => ({
    base: 100 * jitter(),
    self: 100 * jitter(),
    candidate: 100 * candidate * jitter(),
  }))
}

describe('the order the three sides run in', () => {
  it('puts every side in every place equally often over six rounds', () => {
    const places: Record<Side, number[]> = {
      base: [0, 0, 0],
      self: [0, 0, 0],
      candidate: [0, 0, 0],
    }
    for (let round = 0; round < 6; round += 1)
      orderOf(round).forEach((side, place) => {
        places[side][place]! += 1
      })
    expect(places).toEqual({ base: [2, 2, 2], self: [2, 2, 2], candidate: [2, 2, 2] })
    expect(orderOf(6)).toEqual(orderOf(0))
  })
})

describe('the verdict of a paired comparison', () => {
  it('says slower when the candidate lies outside the noise and above the minimum change', () => {
    expect(judgePaired(rounds(MIN_ROUNDS, 1.2, 0.01))).toMatchObject({
      state: 'slower',
      rounds: 10,
    })
  })

  it('says faster on the same terms, the other way', () => {
    const verdict = judgePaired(rounds(MIN_ROUNDS, 0.8, 0.01))
    expect(verdict.state).toBe('faster')
    expect(verdict.median).toBeLessThan(-0.15)
    expect(verdict.least?.candidate).toBeLessThan(verdict.least?.base ?? 0)
  })

  it('says unchanged when both bands lie inside the minimum change', () => {
    expect(judgePaired(rounds(MIN_ROUNDS, 1, 0.01))).toMatchObject({ state: 'unchanged' })
  })

  it('does not call a change outside the noise but below the minimum a change', () => {
    expect(judgePaired(rounds(MIN_ROUNDS, 1.02, 0.001))).toMatchObject({ state: 'unchanged' })
    expect(judgePaired(rounds(MIN_ROUNDS, 0.98, 0.001))).toMatchObject({ state: 'unchanged' })
  })

  it('says the evidence is not enough when the noise covers the minimum change', () => {
    const verdict = judgePaired(rounds(MIN_ROUNDS, 1.06, 0.2))
    expect(verdict.state).toBe('insufficient')
    expect(verdict.noise).not.toBeNull()
  })

  it('does not believe a steady gain while the base cannot repeat itself: the noise is what the self-control shows', () => {
    const unsteady = Array.from({ length: MIN_ROUNDS }, (_, round) => ({
      base: 100,
      self: round % 2 === 0 ? 60 : 140,
      candidate: 90,
    }))
    expect(judgePaired(unsteady)).toMatchObject({ state: 'insufficient' })
  })

  it('says the evidence is not enough below ten rounds, however clear the numbers look', () => {
    expect(judgePaired(rounds(MIN_ROUNDS - 1, 2, 0.001))).toMatchObject({
      state: 'insufficient',
      noise: null,
    })
  })

  it('says the evidence is not enough when a round carries no positive time', () => {
    const broken = [...rounds(MIN_ROUNDS, 1, 0.01), { base: 0, self: 1, candidate: 1 }]
    expect(judgePaired(broken).state).toBe('insufficient')
  })

  it('asks for more rounds only while the verdict is open and the limit is not reached', () => {
    expect(wantsMore(judgePaired(rounds(MIN_ROUNDS, 1.06, 0.2)))).toBe(true)
    expect(wantsMore(judgePaired(rounds(MAX_ROUNDS, 1.06, 0.2)))).toBe(false)
    expect(wantsMore(judgePaired(rounds(MIN_ROUNDS, 1.2, 0.01)))).toBe(false)
  })
})

describe('sameness before speed', () => {
  it('finds three sides that left the same digests equivalent', () => {
    expect(judgeEquivalence(['a', 'b'], ['a', 'b'], ['a', 'b'])).toEqual({ state: 'equivalent' })
  })

  it('points at the first place the candidate differs from the base', () => {
    expect(judgeEquivalence(['a', 'b', 'c'], ['a', 'b', 'c'], ['a', 'x', 'y'])).toEqual({
      state: 'different',
      first: 1,
    })
  })

  it('counts a missing digest as a difference', () => {
    expect(judgeEquivalence(['a', 'b'], ['a', 'b'], ['a'])).toEqual({
      state: 'different',
      first: 1,
    })
  })

  it('cannot judge a base that differs from itself', () => {
    expect(judgeEquivalence(['a', 'b'], ['a', 'c'], ['a', 'b'])).toEqual({
      state: 'unstable',
      first: 1,
    })
  })
})
