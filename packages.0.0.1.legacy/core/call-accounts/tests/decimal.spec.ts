import { describe, expect, it } from 'vitest'
import {
  LosslessNumber,
  readJsonStrict,
  writeJsonLossless,
} from '@omne-harness-lite/content-blocks'
import { ExactDecimal, judgeAccountValue, validate } from '../src/index.ts'

function exact(source: string) {
  return ExactDecimal.from(new LosslessNumber(source))
}
describe('S5/G9 exact decimal', () => {
  it('adds 0.1 and 0.2 exactly and writes a JSON number', () => {
    const sum = exact('0.1').add(exact('0.2'))
    expect(sum.compare(exact('0.3'))).toBe(0)
    expect(writeJsonLossless(sum.toJsonNumber())).toBe('0.3')
  })
  it.each([
    '0.0000000123456789012345',
    '9007199254740993',
    '123456789012345678901234567890.12345678901234567890',
    '1e400',
    '1e-400',
    '1.2300E+2',
    '-0',
    '0.100000000000000000000000000000000000001',
  ])('preserves original numeric spelling %s', source => {
    const read = readJsonStrict(source)
    if ('failed' in read) throw new Error(read.failed)
    expect(writeJsonLossless(exact(source).toJsonNumber())).toBe(source)
    expect(Object.isFrozen(exact(source))).toBe(true)
  })
  it('survives read/add/write beyond 17 significant digits', () => {
    const sum = exact('0.12345678901234567890123456789').add(
      exact('0.00000000000000000000000000001'),
    )
    expect(sum.compare(exact('0.12345678901234567890123456790'))).toBe(0)
    const reread = readJsonStrict(writeJsonLossless(sum.toJsonNumber()))
    expect(reread).toHaveProperty('ok')
    expect(writeJsonLossless(sum.toJsonNumber())).toBe('0.1234567890123456789012345679')
  })
  it('compares equivalent exponents and negative zero by exact numeric value', () => {
    expect(exact('1.00e2').compare(exact('100'))).toBe(0)
    expect(exact('-0').compare(exact('0'))).toBe(0)
    expect(exact('-1e500').compare(exact('-2e500'))).toBe(1)
    expect(exact('1e999999999999999999').compare(exact('1e400'))).toBe(1)
    expect(exact('1e-400').compare(exact('0'))).toBe(1)
    expect(exact('1e400').add(exact('2e400')).compare(exact('3e400'))).toBe(0)
  })
  it.each(['1e400', '1.00', '100e-2'])(
    'accepts exact integer token %s without a Number conversion',
    source => {
      const usage = {
        input_tokens: new LosslessNumber(source),
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        source: 'upstream',
      }
      expect(validate('Usage', usage)).toEqual({ valid: true })
      expect(judgeAccountValue('Usage', usage)).toEqual({ ok: true })
    },
  )
  it.each(['1e-400', '1.00000000000000000001'])('rejects exact fractional token %s', source => {
    const usage = {
      input_tokens: new LosslessNumber(source),
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      source: 'upstream',
    }
    expect(validate('Usage', usage)).toEqual({ valid: false })
    expect(judgeAccountValue('Usage', usage)).toEqual({ rejected: 'malformed' })
  })
  it('retains a subnormal negative amount rather than underflowing it to zero', () => {
    expect(
      judgeAccountValue('Cost', {
        cost_usd: new LosslessNumber('-1e-4000'),
        source: 'upstream_usage',
      }),
    ).toEqual({ rejected: 'negative_amount' })
  })
  it.each([
    '{"cost_usd":0.1,"cost_usd":0.2,"source":"upstream_usage"}',
    '{"cost_usd":0.1,"cost_\\u0075sd":0.2,"source":"upstream_usage"}',
  ])('rejects duplicate decoded member before account interpretation %s', source => {
    expect(readJsonStrict(source)).toEqual({ failed: 'duplicate_member' })
  })
  it('fails on an already invalid native nonfinite number', () => {
    expect(() => ExactDecimal.from(Infinity)).toThrow(TypeError)
    expect(judgeAccountValue('Cost', { cost_usd: Infinity, source: 'upstream_usage' })).toEqual({
      rejected: 'malformed',
    })
  })
})

// Independent fixed-scale oracle: it never calls ExactDecimal to produce expected digits.
let seed = 0x6c41
function next() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return seed
}
function literal(coefficient: bigint) {
  const digits = coefficient.toString().padStart(31, '0')
  return `${digits.slice(0, -30)}.${digits.slice(-30)}`
}
function oracleScientific(coefficient: bigint): string {
  if (coefficient === 0n) return '0'
  let exponent = -30n
  while (coefficient % 10n === 0n) {
    coefficient /= 10n
    exponent++
  }
  return `${coefficient}e${exponent}`
}
const trials = Array.from({ length: 200 }, (_, index) => {
  const a = BigInt(next()) * 1000000000000000000n + BigInt(next())
  const b = BigInt(next()) * 1000000000000000000n + BigInt(next())
  return { index, a, b, expected: literal(a + b), comparison: a < b ? -1 : a > b ? 1 : 0 }
})
describe('independent decimal oracle seed 0x6c41', () => {
  it.each(trials)('trial $index exact sum and comparison', ({ a, b, expected, comparison }) => {
    expect(
      exact(literal(a))
        .add(exact(literal(b)))
        .compare(exact(expected)),
    ).toBe(0)
    expect(exact(literal(a)).compare(exact(literal(b)))).toBe(comparison)
    expect(
      writeJsonLossless(
        exact(literal(a))
          .add(exact(literal(b)))
          .toJsonNumber(),
      ),
    ).toBe(oracleScientific(a + b))
  })
})

it('canonical decimal spelling preserves exact equality and leaves exchange spelling unchanged', () => {
  for (const values of [
    ['100', '1e2', '1.000e+2'],
    ['-0', '0.000', '0e400'],
    ['1e4000000', '10e3999999'],
  ]) {
    const first = values[0]
    if (!first) throw new Error('missing fixture')
    for (const source of values) {
      expect(exact(source).compare(exact(first))).toBe(0)
      expect(exact(source).toCanonicalString()).toBe(exact(first).toCanonicalString())
      expect(exact(source).toString()).toBe(source)
    }
  }
  expect(exact('9007199254740992').toCanonicalString()).not.toBe(
    exact('9007199254740993').toCanonicalString(),
  )
})
