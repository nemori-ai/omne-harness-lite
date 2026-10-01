import { describe, expect, it } from 'vitest'
import {
  compareInstants,
  compareRfc3339Instants,
  instantFromRfc3339,
  validate,
} from '../src/index.ts'
import { unwrap } from '@omne-harness-lite/identity-values'

describe('D089 B/R1 exact conditional RFC 3339 ordering', () => {
  it('TO-V1: preserves the sub-millisecond distinction while the old API still rounds', () => {
    const left = '2026-09-27T00:00:00.0004Z'
    const right = '2026-09-27T00:00:00.0003Z'
    expect(compareRfc3339Instants(left, right)).toEqual({ ok: 1 })
    expect(
      compareInstants(unwrap(instantFromRfc3339(left)), unwrap(instantFromRfc3339(right))),
    ).toBe(0)
    expect(left).toBe('2026-09-27T00:00:00.0004Z')
    expect(right).toBe('2026-09-27T00:00:00.0003Z')
  })

  it.each(['', '.0', '.0000000000000000000000000000000000000000'])(
    'TO-V2: missing fraction and tail zeros are the same instant (%s)',
    fraction => {
      expect(
        compareRfc3339Instants(`1970-01-01T00:00:00${fraction}Z`, '1970-01-01T00:00:00Z'),
      ).toEqual({ ok: 0 })
    },
  )
  it.each(['1969-12-31T23:59:59', '1970-01-01T00:00:00', '0000-02-29T00:00:00'])(
    'TO-V2: all fractional digits matter on both sides of epoch (%s)',
    prefix => {
      const common = '12345678901234567890'.repeat(2000)
      expect(compareRfc3339Instants(`${prefix}.${common}2Z`, `${prefix}.${common}1Z`)).toEqual({
        ok: 1,
      })
      expect(compareRfc3339Instants(`${prefix}.1Z`, `${prefix}.1000000000000000000001Z`)).toEqual({
        ok: -1,
      })
    },
  )

  it.each([
    ['0000-02-29T00:00:00Z', '0001-02-29T00:00:00Z'],
    ['0400-02-29T00:00:00Z', '0400-03-01T00:00:00+24:00'],
  ])('TO-V3: checks real calendar fields independently of shape (%s)', (good, bad) => {
    expect(compareRfc3339Instants(good, good)).toEqual({ ok: 0 })
    expect('invalidInput' in compareRfc3339Instants(bad, good)).toBe(true)
  })

  it.each([
    '0001-02-29T00:00:00Z',
    '0100-02-29T00:00:00Z',
    '1900-02-29T00:00:00Z',
    '0400-04-31T00:00:00Z',
    '0000-02-30T00:00:00Z',
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
    '0000-01-01',
    '0000-01-01T00:00:00',
    '0000-01-01 00:00:00Z',
    '0000-01-01T00:00:00.Z',
    '0000-01-01T00:00:00.1e1Z',
    '0000-01-01T00:00:00Z\n',
    '0000-01-01T00:00:00+00:00\n',
    '0000-01-01T00:00:00Zgarbage',
    ' 0000-01-01T00:00:00Z',
    '0000-01-01T00:00:00Z ',
    '0000-01-01T00:00:00+0:00',
    '0000-01-01T00:00:00+00:0',
    '0000-01-01T00:00:00+00:000',
    '0000-01-01T00:00:00+0000',
    '0000-01-01T00:00:00.١Z',
  ])('TO-V3/V6: either side rejects static invalid text without disclosure (%s)', bad => {
    const fixed = { invalidInput: 'invalid RFC 3339 instant representation' }
    expect(compareRfc3339Instants(bad, '1970-01-01T00:00:00Z')).toEqual(fixed)
    expect(compareRfc3339Instants('1970-01-01T00:00:00Z', bad)).toEqual(fixed)
    expect(compareRfc3339Instants(bad, bad)).toEqual(fixed)
  })

  it('TO-V3: schema pattern success does not replace the calendar check', () => {
    const impossible = '2026-02-30T00:00:00Z'
    expect(validate('Instant', impossible).valid).toBe(true)
    expect('invalidInput' in compareRfc3339Instants(impossible, impossible)).toBe(true)
  })
  it('TO-V6: nonstrings do not invoke coercion or access getters', () => {
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error('must not read object')
        },
      },
    )
    for (const value of [
      hostile,
      undefined,
      null,
      42,
      NaN,
      true,
      1n,
      Symbol('secret'),
      [],
      () => 'x',
    ]) {
      expect(compareRfc3339Instants(value, '1970-01-01T00:00:00Z')).toEqual({
        invalidInput: 'invalid RFC 3339 instant representation',
      })
      expect(compareRfc3339Instants('1970-01-01T00:00:00Z', value)).toEqual({
        invalidInput: 'invalid RFC 3339 instant representation',
      })
    }
  })

  it.each([
    ['2026-09-22T17:00:00+08:00', '2026-09-22t09:00:00z'],
    ['1970-01-01T00:00:00-00:00', '1970-01-01T00:00:00+00:00'],
    ['0000-01-01T00:00:00+01:00', '0000-01-01T01:00:00+02:00'],
    ['9999-12-31T23:59:59-01:00', '9999-12-31T22:59:59-02:00'],
    ['0000-01-01T00:00:00+23:59', '0000-01-01T00:00:00+23:59'],
    ['9999-12-31T23:59:59-23:59', '9999-12-31T23:59:59-23:59'],
    ['0000-01-01T01:00:00+23:59', '0000-01-01T00:59:00+23:58'],
    ['9999-12-31T23:58:59-23:59', '9999-12-31T23:59:59-23:58'],
    ['0100-03-01T00:00:00+00:01', '0100-02-28T23:59:00Z'],
    ['0400-03-01T00:00:00+00:01', '0400-02-29T23:59:00Z'],
    ['0001-01-01T00:00:00+00:01', '0000-12-31T23:59:00Z'],
  ])('TO-V4: normalized offsets retain identical instants (%s)', (left, right) => {
    expect(compareRfc3339Instants(left, right)).toEqual({ ok: 0 })
    expect(compareRfc3339Instants(right, left)).toEqual({ ok: 0 })
  })
  it('TO-V4: UTC order differs from string order', () => {
    expect(compareRfc3339Instants('2026-09-22T23:00:00-05:00', '2026-09-23T01:00:00Z')).toEqual({
      ok: 1,
    })
  })

  it('TO-V5: known 2016 positive leap keeps its second label before the next minute', () => {
    const sequence = [
      '2016-12-31T23:59:59.999999999999Z',
      '2016-12-31T23:59:60Z',
      '2016-12-31T23:59:60.999999999999Z',
      '2017-01-01T00:00:00Z',
    ]
    for (let i = 1; i < sequence.length; i++)
      expect(compareRfc3339Instants(sequence[i - 1], sequence[i])).toEqual({ ok: -1 })
  })
  it.each([
    ['2017-01-01T00:59:60+01:00', '2016-12-31T23:59:60.000Z'],
    ['2017-01-01T23:58:60+23:59', '2016-12-31T23:59:60Z'],
    ['2016-12-31T00:00:60-23:59', '2016-12-31T23:59:60Z'],
    ['2015-07-01T00:59:60+01:00', '2015-06-30T23:59:60Z'],
  ])('TO-V5: known leap aliases normalize the minute, not second60 (%s)', (left, right) => {
    expect(compareRfc3339Instants(left, right)).toEqual({ ok: 0 })
  })
  it.each([
    '2016-12-31T23:58:60Z',
    '2016-12-30T23:59:60Z',
    '2016-12-31T23:59:60+01:00',
    '2017-01-01T23:59:60Z',
  ])('TO-V5: statically impossible leap position rejects (%s)', text => {
    expect('invalidInput' in compareRfc3339Instants(text, text)).toBe(true)
  })
  it('TO-V5: conditional synthetic shape is not announcement authentication', () => {
    // Only tests the R1 ordering kernel: these are not asserted as historical leaps.
    expect(compareRfc3339Instants('2030-01-31T23:59:60Z', '2030-02-01T00:00:00Z')).toEqual({
      ok: -1,
    })
    expect(compareRfc3339Instants('0000-01-01T00:00:60+00:01', '0000-01-01T00:00:00Z')).toEqual({
      ok: -1,
    })
    // An actual negative leap's missing59 requires external facts. No blanket rejection.
    expect(compareRfc3339Instants('2030-01-31T23:59:59Z', '2030-02-01T00:00:00Z')).toEqual({
      ok: -1,
    })
  })
})
