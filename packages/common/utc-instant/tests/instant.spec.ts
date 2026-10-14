import { describe, expect, it } from 'vitest'
import { compareInstants, encodeInstant, parseInstant } from '@omne-harness/utc-instant'

function instant(text: string) {
  const parsed = parseInstant(text)
  if (!parsed.ok) throw new Error(`${text} failed as ${parsed.failure.kind}`)
  return parsed.value
}

describe('instant text', () => {
  it('encodes an accepted instant back to its own text, fraction digits included', () => {
    expect(encodeInstant(instant('2026-10-14T12:00:00.500Z'))).toBe('2026-10-14T12:00:00.500Z')
  })

  it.each([
    '2016-12-31T23:59:60+00:00',
    '2026-10-14T20:00:00+08:00',
    '2026-10-14T12:00:00.5-05:00',
  ])('refuses the offset form %s', text => {
    expect(parseInstant(text)).toEqual({ ok: false, failure: { kind: 'offset' } })
  })

  it.each([
    '2026-10-14t12:00:00Z',
    '2026-10-14T12:00:00z',
    '2026-10-14 12:00:00Z',
    '2026-10-14T12:00:00',
    '2026-10-14T12:00:00.Z',
    '2026-10-14T12:00Z',
    '26-10-14T12:00:00Z',
    '2026-10-14T12:00:00+0800',
    ' 2026-10-14T12:00:00Z',
  ])('refuses the malformed text %j as syntax', text => {
    expect(parseInstant(text)).toEqual({ ok: false, failure: { kind: 'syntax' } })
  })

  it.each([
    '2026-13-01T00:00:00Z',
    '2026-00-01T00:00:00Z',
    '2026-01-00T00:00:00Z',
    '2026-04-31T00:00:00Z',
    '2026-02-29T00:00:00Z',
    '1900-02-29T00:00:00Z',
    '2026-10-14T24:00:00Z',
    '2026-10-14T12:60:00Z',
    '2026-10-14T12:00:61Z',
    '2026-10-14T12:00:60Z',
  ])('refuses the impossible calendar fields in %s as range', text => {
    expect(parseInstant(text)).toEqual({ ok: false, failure: { kind: 'range' } })
  })

  it.each([
    '2024-02-29T00:00:00Z',
    '2000-02-29T23:59:59Z',
    '0000-01-01T00:00:00Z',
    '9999-12-31T23:59:59.999Z',
  ])('accepts the calendar edge %s', text => {
    expect(encodeInstant(instant(text))).toBe(text)
  })
})

describe('instant values', () => {
  it('has no JSON form, so serialising one cannot silently emit {}', () => {
    expect(() => JSON.stringify({ at: instant('2026-10-14T12:00:00Z') })).toThrow(TypeError)
  })

  it('has no string form, so String() and a template cannot silently emit [object Object]', () => {
    const at = instant('2026-10-14T12:00:00Z')
    expect(() => String(at)).toThrow(TypeError)
    expect(() => `${at}`).toThrow(TypeError)
  })

  it('refuses a value that parseInstant did not produce', () => {
    const forged = {} as Parameters<typeof encodeInstant>[0]
    expect(() => encodeInstant(forged)).toThrow(TypeError)
    expect(() => compareInstants(forged, instant('2026-10-14T12:00:00Z'))).toThrow(TypeError)
  })
})

describe('compareInstants', () => {
  it('orders a longer fraction after its shorter prefix when the extra digit is not zero', () => {
    const later = instant('2026-10-14T12:00:00.5005Z')
    const earlier = instant('2026-10-14T12:00:00.500Z')
    expect(compareInstants(later, earlier)).toBe(1)
    expect(compareInstants(earlier, later)).toBe(-1)
  })

  it('keeps fractions 0004 and 00049 apart', () => {
    expect(
      compareInstants(instant('2026-10-14T12:00:00.0004Z'), instant('2026-10-14T12:00:00.00049Z')),
    ).toBe(-1)
  })

  it('treats 0.5 and 0.500 as the same instant while each keeps its own text', () => {
    const short = instant('2026-10-14T12:00:00.5Z')
    const padded = instant('2026-10-14T12:00:00.500Z')
    expect(compareInstants(short, padded)).toBe(0)
    expect(encodeInstant(short)).toBe('2026-10-14T12:00:00.5Z')
    expect(encodeInstant(padded)).toBe('2026-10-14T12:00:00.500Z')
  })

  it('orders by calendar fields before the fraction', () => {
    expect(
      compareInstants(instant('2026-10-14T12:00:00.9Z'), instant('2026-10-14T12:00:01Z')),
    ).toBe(-1)
    expect(compareInstants(instant('2025-12-31T23:59:59Z'), instant('2026-01-01T00:00:00Z'))).toBe(
      -1,
    )
  })
})
