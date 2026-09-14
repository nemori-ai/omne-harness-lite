import { describe, expect, it } from 'vitest'
import { addMoney, compareMoney, rescaleMoney, validateMoney } from '../dist/index.js'
import { money } from './fixtures.js'

function accepted<T>(result: { ok: boolean; value?: T }): T {
  expect(result).toMatchObject({ ok: true })
  if (!result.ok) throw new Error('expected accepted result')
  return result.value as T
}

describe('exact Money values', () => {
  it('rescales exactly without binary floating point or rounding', () => {
    expect(accepted(rescaleMoney(money('1'), 2))).toEqual(money('100', 2))
    expect(accepted(rescaleMoney(money('100', 2), 0))).toEqual(money('1'))
    expect(rescaleMoney(money('101', 2), 0).ok).toBe(false)

    const sum = accepted(addMoney(money('9007199254740993'), money('7')))
    expect(sum).toEqual(money('9007199254741000'))
    expect(accepted(compareMoney(money('100', 2), money('1')))).toBe(0)
  })

  it('rejects noncanonical values, mixed currencies, and negative constrained amounts', () => {
    for (const invalid of [
      money('01'),
      money('-0'),
      money('1.0'),
      money('1', -1),
      money('1', Number.MAX_SAFE_INTEGER + 1),
      money('1', 0, ''),
    ]) {
      expect(validateMoney(invalid).ok).toBe(false)
    }
    expect(addMoney(money('1', 0, 'USD'), money('1', 0, 'EUR')).ok).toBe(false)
    expect(validateMoney(money('-1'), { nonNegative: true }).ok).toBe(false)
  })
})
