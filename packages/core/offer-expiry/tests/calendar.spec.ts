import { unwrap } from '@omne-harness-lite/identity-values'
import { describe, expect, it } from 'vitest'
import { instantFromRfc3339, instantToRfc3339, validate } from '../src/index.ts'

// Independent epoch oracles: Python's proleptic Gregorian datetime for years
// 0001..9999; year 0000 is the leap year immediately before 0001 (366 days).
const calendarCases = [
  ['0000-01-01T00:00:00Z', -62167219200000],
  ['0000-02-29T00:00:00Z', -62162121600000],
  ['0000-12-31T23:59:59Z', -62135596801000],
  ['0001-01-01T00:00:00Z', -62135596800000],
  ['0099-12-31T23:59:59Z', -59011459201000],
  ['0100-02-28T00:00:00Z', -59006448000000],
  ['0100-03-01T00:00:00Z', -59006361600000],
  ['0400-02-29T00:00:00Z', -49539340800000],
  ['9999-12-31T23:59:59Z', 253402300799000],
] as const

describe('Instant 四位年日历回归（S-22）', () => {
  it.each(calendarCases)('%s 保留原年份与独立 epoch oracle', (text, millis) => {
    expect(validate('Instant', text).valid).toBe(true)
    const instant = unwrap(instantFromRfc3339(text))
    expect(instant).toBe(millis)
    expect(instantToRfc3339(instant)).toBe(text.replace('Z', '.000Z'))
  })

  it.each([
    ['0000-02-29t08:00:00+08:00', -62162121600000],
    ['0001-01-01T01:00:00+01:00', -62135596800000],
    ['0000-12-31T23:00:00-01:00', -62135596800000],
    ['0100-01-01T00:59:59+01:00', -59011459201000],
    ['9999-12-31T22:59:59-01:00', 253402300799000],
  ] as const)('%s 的偏移按同一时间点求值', (text, millis) => {
    expect(unwrap(instantFromRfc3339(text))).toBe(millis)
  })

  it.each([
    ['0000-01-01T00:00:00+01:00', -62167222800000, '-000001-12-31T23:00:00.000Z'],
    ['9999-12-31T23:59:59-01:00', 253402304399000, '+010000-01-01T00:59:59.000Z'],
  ] as const)('%s 的偏移跨越四位年边界仍是时间点', (text, millis, written) => {
    const instant = unwrap(instantFromRfc3339(text))
    expect(instant).toBe(millis)
    // The established Date formatter can write an expanded year; the input
    // boundary remains the frozen four-digit-year pattern.
    expect(instantToRfc3339(instant)).toBe(written)
  })

  it.each([
    '0000-02-30T00:00:00Z',
    '0001-02-29T00:00:00Z',
    '0099-02-29T00:00:00Z',
    '0100-02-29T00:00:00Z',
    '1900-02-29T00:00:00Z',
    '0400-04-31T00:00:00Z',
    '0000-00-01T00:00:00Z',
    '0000-13-01T00:00:00Z',
    '0000-01-00T00:00:00Z',
    '0000-01-32T00:00:00Z',
    '0000-01-01T24:00:00Z',
    '0000-01-01T00:60:00Z',
    '0000-01-01T00:00:61Z',
    '0000-01-01T00:00:00+24:00',
    '0000-01-01T00:00:00-00:60',
    '10000-01-01T00:00:00Z',
    '-000001-01-01T00:00:00Z',
  ])('%s 不因 Date 的静默进位成为合法值', text => {
    expect('invalidInput' in instantFromRfc3339(text)).toBe(true)
  })
})

describe('既定毫秒映射保持（不是任意精度时间点）', () => {
  it.each([
    ['1970-01-01T00:00:00.00049Z', 0],
    ['1970-01-01T00:00:00.00050Z', 1],
    ['1970-01-01T00:00:00.00051Z', 1],
    ['1969-12-31T23:59:59.9995Z', -0],
    ['1970-01-01T00:00:00.123456789123456789Z', 123],
    ['1970-01-01T00:00:00.9999999Z', 1000],
    ['0001-01-01T00:00:00.123456789123456789Z', -62135596799877],
  ] as const)('%s 仍使用已定毫秒四舍五入', (text, millis) => {
    expect(unwrap(instantFromRfc3339(text))).toBe(millis)
  })
})
