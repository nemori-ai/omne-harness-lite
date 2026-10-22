// The plain decimal lexeme of the gateway cost: exact string arithmetic over a JSON number lexeme.
import { describe, expect, it } from 'vitest'
import { MAX_PLAIN_DECIMAL_LENGTH, plainDecimal } from '../src/chat-completions/decimal.ts'

describe('plainDecimal', () => {
  it('keeps a plain lexeme as it is', () => {
    for (const lexeme of ['0', '7', '0.000858', '12.50', '0.0'])
      expect(plainDecimal(lexeme)).toBe(lexeme)
  })

  it('moves the decimal point of an exponent form without a float', () => {
    expect(plainDecimal('2.25e-7')).toBe('0.000000225')
    expect(plainDecimal('1e-7')).toBe('0.0000001')
    expect(plainDecimal('1.50E+2')).toBe('150')
    expect(plainDecimal('1.5e1')).toBe('15')
    expect(plainDecimal('12.345e1')).toBe('123.45')
    expect(plainDecimal('0.5e1')).toBe('5')
    expect(plainDecimal('3e0')).toBe('3')
    expect(plainDecimal('0e5')).toBe('0')
    expect(plainDecimal('1.23456789012345678901e-3')).toBe('0.00123456789012345678901')
  })

  it('refuses a negative number and a lexeme that is not a JSON number', () => {
    for (const lexeme of ['-1', '-2.5e-7', '1.', '.5', '01', '1e', 'NaN', 'free', ''])
      expect(plainDecimal(lexeme)).toBeNull()
  })

  it('refuses an exponent that writes a lexeme beyond the limit', () => {
    expect(plainDecimal('1e600')).toBeNull()
    expect(plainDecimal('1e-600')).toBeNull()
    expect(plainDecimal('1e-999999999')).toBeNull()
    expect(plainDecimal(`1e${MAX_PLAIN_DECIMAL_LENGTH - 1}`)).toHaveLength(MAX_PLAIN_DECIMAL_LENGTH)
    expect(plainDecimal(`1e${MAX_PLAIN_DECIMAL_LENGTH}`)).toBeNull()
  })
})
