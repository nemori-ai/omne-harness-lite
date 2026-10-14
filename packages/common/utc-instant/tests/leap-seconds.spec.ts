import { describe, expect, it } from 'vitest'
import {
  compareInstants,
  encodeInstant,
  leapSecondData,
  parseInstant,
  readLeapSecondData,
} from '@omne-harness/utc-instant'

function instant(text: string) {
  const parsed = parseInstant(text)
  if (!parsed.ok) throw new Error(`${text} failed as ${parsed.failure.kind}`)
  return parsed.value
}

describe('second 60 with the bundled IERS table', () => {
  it('accepts 2016-12-31T23:59:60Z and orders it before the next midnight', () => {
    const leap = instant('2016-12-31T23:59:60Z')
    expect(encodeInstant(leap)).toBe('2016-12-31T23:59:60Z')
    expect(compareInstants(leap, instant('2017-01-01T00:00:00Z'))).toBe(-1)
    expect(compareInstants(instant('2016-12-31T23:59:59.999Z'), leap)).toBe(-1)
  })

  it.each(['1972-06-30T23:59:60Z', '1981-06-30T23:59:60.5Z', '2015-06-30T23:59:60Z'])(
    'accepts the listed insertion %s',
    text => {
      expect(encodeInstant(instant(text))).toBe(text)
    },
  )

  it.each([
    ['2016-06-30T23:59:60Z', 'a June end the table does not list'],
    ['1971-12-31T23:59:60Z', 'the day before the 1972-01-01 base offset'],
    ['1972-12-30T23:59:60Z', 'the day before a listed insertion day'],
    ['2026-12-31T23:59:60Z', 'the last unlisted month end before expiry'],
  ])('refuses %s, %s', text => {
    expect(parseInstant(text)).toEqual({
      ok: false,
      failure: { kind: 'leap-second', detail: 'not-inserted' },
    })
  })

  it('reads 1972-01-01T00:00:00Z as an ordinary midnight', () => {
    expect(encodeInstant(instant('1972-01-01T00:00:00Z'))).toBe('1972-01-01T00:00:00Z')
  })
})

describe('the bundled table expiry', () => {
  it('names its IERS source, file version, and expiry', () => {
    expect(leapSecondData.source).toBe(
      'https://hpiers.obspm.fr/iers/bul/bulc/ntp/leap-seconds.list',
    )
    expect(encodeInstant(leapSecondData.version)).toBe('2026-07-06T07:44:57Z')
    expect(encodeInstant(leapSecondData.expires)).toBe('2027-06-28T00:00:00Z')
  })

  it('still answers no for an unlisted second 60 the day before expiry', () => {
    expect(parseInstant('2027-06-27T23:59:60Z')).toEqual({
      ok: false,
      failure: { kind: 'leap-second', detail: 'not-inserted' },
    })
  })

  it.each(['2027-06-28T23:59:60Z', '2027-06-30T23:59:60Z', '2040-12-31T23:59:60.25Z'])(
    'cannot judge %s because the table has expired',
    text => {
      expect(parseInstant(text)).toEqual({ ok: false, failure: { kind: 'leap-data-expired' } })
    },
  )

  it.each(['2027-06-28T00:00:00Z', '2027-06-30T23:59:59Z', '2040-12-31T23:59:59.5Z'])(
    'still reads the ordinary instant %s after expiry',
    text => {
      expect(encodeInstant(instant(text))).toBe(text)
    },
  )
})

function table(text: string, source: string) {
  const read = readLeapSecondData(text, source)
  if (!read.ok) throw new Error(`test table failed as ${read.failure.kind}`)
  return read.value
}

describe('a caller-supplied table', () => {
  const negativeLeap = table(
    [
      '#$\t3992312697',
      '#@\t4133980800',
      '2272060800\t10\t# 1 Jan 1972',
      '2287785600\t11\t# 1 Jul 1972',
      '4118083200\t10\t# 1 Jul 2030',
    ].join('\n'),
    'test data, not IERS: a rule-derived negative leap second on 2030-06-30',
  )

  it('keeps the source label, version, and expiry it was read with', () => {
    expect(negativeLeap.source).toBe(
      'test data, not IERS: a rule-derived negative leap second on 2030-06-30',
    )
    expect(encodeInstant(negativeLeap.version)).toBe('2026-07-06T07:44:57Z')
    expect(encodeInstant(negativeLeap.expires)).toBe('2031-01-01T00:00:00Z')
  })

  it('replaces the bundled table for that parse', () => {
    expect(parseInstant('2016-12-31T23:59:60Z', negativeLeap)).toEqual({
      ok: false,
      failure: { kind: 'leap-second', detail: 'not-inserted' },
    })
    expect(encodeInstant(instant('2016-12-31T23:59:60Z'))).toBe('2016-12-31T23:59:60Z')
  })

  it('refuses the deleted second 23:59:59 on a negative leap day', () => {
    expect(parseInstant('2030-06-30T23:59:59Z', negativeLeap)).toEqual({
      ok: false,
      failure: { kind: 'leap-second', detail: 'deleted' },
    })
    expect(parseInstant('2030-06-30T23:59:59.5Z', negativeLeap)).toEqual({
      ok: false,
      failure: { kind: 'leap-second', detail: 'deleted' },
    })
  })

  it('keeps the seconds around a negative leap', () => {
    for (const text of ['2030-06-30T23:59:58.999Z', '2030-07-01T00:00:00Z', '2030-07-01T23:59:59Z'])
      expect(parseInstant(text, negativeLeap)).toMatchObject({ ok: true })
  })

  it('accepts a listed insertion that falls after the table expiry', () => {
    const expiredEarly = table(
      ['#$\t2272060800', '#@\t2277244800', '2272060800\t10', '2287785600\t11'].join('\n'),
      'test data, not IERS: expires before its listed insertion',
    )
    expect(parseInstant('1972-06-30T23:59:60Z', expiredEarly)).toMatchObject({ ok: true })
    expect(parseInstant('1972-12-31T23:59:60Z', expiredEarly)).toEqual({
      ok: false,
      failure: { kind: 'leap-data-expired' },
    })
  })
})

describe('leap-second table values', () => {
  it('have no JSON form, so serialising one cannot silently emit {}', () => {
    expect(() => JSON.stringify({ table: leapSecondData })).toThrow(TypeError)
  })

  it('have no string form, so String() and a template cannot silently emit [object Object]', () => {
    expect(() => String(leapSecondData)).toThrow(TypeError)
    expect(() => `${leapSecondData}`).toThrow(TypeError)
  })
})

describe('readLeapSecondData', () => {
  it('reads CRLF line ends like LF, comments on data rows included', () => {
    const crlf = table(
      [
        '#$\t3992312697',
        '#@\t4133980800',
        '2272060800\t10\t# 1 Jan 1972',
        '2287785600\t11\t# 1 Jul 1972',
      ].join('\r\n'),
      'test data: CRLF',
    )
    expect(encodeInstant(crlf.version)).toBe('2026-07-06T07:44:57Z')
    expect(encodeInstant(crlf.expires)).toBe('2031-01-01T00:00:00Z')
    expect(parseInstant('1972-06-30T23:59:60Z', crlf)).toMatchObject({ ok: true })
  })

  it.each([
    ['no version line', ['#@\t4133980800', '2272060800\t10']],
    ['no expiry line', ['#$\t3992312697', '2272060800\t10']],
    ['two version lines', ['#$\t3992312697', '#$\t3992312697', '#@\t4133980800', '2272060800\t10']],
    [
      'an unreadable second expiry line',
      ['#$\t3992312697', '#@\t4133980800', '#@\t28 June 2027', '2272060800\t10'],
    ],
    ['no data rows', ['#$\t3992312697', '#@\t4133980800']],
    [
      'a line that is neither comment nor data',
      ['#$\t3992312697', '#@\t4133980800', '2272060800\tten'],
    ],
  ])('refuses a file with %s as syntax', (_, lines) => {
    expect(readLeapSecondData(lines.join('\n'), 'test data')).toEqual({
      ok: false,
      failure: { kind: 'syntax' },
    })
  })

  it.each([
    ['a step of two seconds', ['2272060800\t10', '2287785600\t12']],
    ['a row that does not advance', ['2272060800\t10', '2272060800\t11']],
    ['a row that is not at midnight', ['2272060800\t10', '2287785601\t11']],
    ['a first row at 1972-07-01 instead of 1972-01-01', ['2287785600\t10', '2303683200\t11']],
    ['a first row at 1972-01-01 with offset 11', ['2272060800\t11', '2287785600\t12']],
  ])('refuses a file with %s as step', (_, rows) => {
    const lines = ['#$\t3992312697', '#@\t4133980800', ...rows]
    expect(readLeapSecondData(lines.join('\n'), 'test data')).toEqual({
      ok: false,
      failure: { kind: 'step' },
    })
  })

  it('refuses a table truncated to start at 2017-01-01 as step instead of forgetting 2016-12-31T23:59:60Z', () => {
    const truncated = ['#$\t3992312697', '#@\t4133980800', '3692217600\t37', '3707856000\t38']
    expect(readLeapSecondData(truncated.join('\n'), 'test data: truncated')).toEqual({
      ok: false,
      failure: { kind: 'step' },
    })
  })
})
