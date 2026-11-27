import { describe, expect, it } from 'vitest'
import { judgeCount, judgeScale, type Expectation } from '../src/index.ts'

const rungs = (values: readonly number[], first = 25): { scale: number; value: number }[] =>
  values.map((value, index) => ({ scale: first * 2 ** index, value }))

describe('a reading that should not depend on a scale', () => {
  it('passes when no rung is above the one before it', () => {
    expect(judgeScale(rungs([1170, 1170, 1170, 1170]), 0)).toMatchObject({
      state: 'pass',
      ratios: [1, 1, 1],
      perDoubling: 0,
    })
  })

  it('fails when a rung rises above the allowance, and reports how much each doubling adds', () => {
    const verdict = judgeScale(rungs([1170, 1180, 1190, 1200]), 0)
    expect(verdict).toMatchObject({ state: 'fail' })
    expect(verdict.state === 'fail' && verdict.perDoubling).toBeCloseTo(10)
  })

  it('lets a rung rise inside the allowance', () => {
    expect(judgeScale(rungs([1000, 1004, 1008, 1010]), 0.005)).toMatchObject({ state: 'pass' })
    expect(judgeScale(rungs([1000, 1004, 1010, 1010]), 0.005)).toMatchObject({ state: 'fail' })
  })

  it('reads the rungs in the order of their scale, whatever order they came in', () => {
    const [a, b, c] = rungs([10, 10, 30])
    expect(judgeScale([c!, a!, b!], 0)).toMatchObject({ state: 'fail', ratios: [1, 3] })
  })

  it('fails a reading that appears where there was none', () => {
    expect(judgeScale(rungs([0, 0, 4]), 0)).toMatchObject({ state: 'fail' })
    expect(judgeScale(rungs([0, 0, 0]), 0)).toMatchObject({ state: 'pass' })
  })

  it('blocks on one rung, on rungs that do not double, and on a rung with no value', () => {
    expect(judgeScale(rungs([5]), 0).state).toBe('blocked')
    expect(
      judgeScale(
        [
          { scale: 10, value: 1 },
          { scale: 30, value: 1 },
        ],
        0,
      ).state,
    ).toBe('blocked')
    expect(judgeScale(rungs([1, Number.NaN]), 0).state).toBe('blocked')
    expect(judgeScale(rungs([1, -1]), 0).state).toBe('blocked')
  })

  it('refuses an allowance that is not a number, zero or more', () => {
    expect(() => judgeScale(rungs([1, 1]), -0.1)).toThrow()
    expect(() => judgeScale(rungs([1, 1]), Number.NaN)).toThrow()
  })
})

describe('a count a step decides', () => {
  const expectation: Expectation = { value: 3, from: 'multi-step: commits of one step', budget: 3 }

  it('passes when it is the expectation', () => {
    expect(judgeCount(3, expectation)).toEqual({ state: 'pass', measured: 3, expected: 3 })
  })

  it('fails above and below the expectation, and names where the number comes from', () => {
    expect(judgeCount(4, expectation)).toMatchObject({
      state: 'fail',
      reason: 'measured 4, expected 3 (multi-step: commits of one step)',
    })
    expect(judgeCount(2, expectation)).toMatchObject({ state: 'fail' })
  })

  it('fails an expectation above the design budget that nobody accepted, even when the count meets it', () => {
    expect(judgeCount(92, { value: 92, from: 'as measured', budget: 3 })).toMatchObject({
      state: 'fail',
      reason: 'the expectation 92 is above the design budget 3 and carries no acceptance',
    })
  })

  it('lets an expectation above the budget stand once it carries an acceptance', () => {
    const accepted = { card: '#1752', reason: 'the product fix belongs to the next run' }
    expect(judgeCount(92, { value: 92, from: 'as measured', budget: 3, accepted })).toMatchObject({
      state: 'pass',
    })
    expect(judgeCount(93, { value: 92, from: 'as measured', budget: 3, accepted })).toMatchObject({
      state: 'fail',
    })
  })

  it('blocks when there is no expectation, or nothing was measured', () => {
    expect(judgeCount(3, undefined).state).toBe('blocked')
    expect(judgeCount(Number.NaN, expectation).state).toBe('blocked')
  })
})
