import { describe, expect, it } from 'vitest'
import { ianaZoneOf, RANGE_LABELS, RANGES, windowOf } from '../src/model/range.ts'

describe('the zone the panel asks in is an IANA name, as the usage protocol requires', () => {
  it('keeps a name the host already gives', () => {
    expect(ianaZoneOf('Asia/Shanghai')).toBe('Asia/Shanghai')
    expect(ianaZoneOf('UTC')).toBe('UTC')
  })

  it('names a fixed offset of whole hours by its Etc zone, whose sign is the other way round', () => {
    expect(ianaZoneOf('+00:00')).toBe('UTC')
    expect(ianaZoneOf('-00:00')).toBe('UTC')
    expect(ianaZoneOf('+08:00')).toBe('Etc/GMT-8')
    expect(ianaZoneOf('-05:00')).toBe('Etc/GMT+5')
    expect(ianaZoneOf('+14:00')).toBe('Etc/GMT-14')
    expect(ianaZoneOf('-12:00')).toBe('Etc/GMT+12')
  })

  it('asks in UTC for an offset no IANA zone names', () => {
    for (const offset of ['+05:30', '-03:30', '+15:00', '-13:00'])
      expect(ianaZoneOf(offset)).toBe('UTC')
  })

  it('gives only names the host itself can resolve', () => {
    for (const offset of ['+00:00', '+08:00', '-05:00', '+14:00', '-12:00', '+05:30'])
      expect(() => new Intl.DateTimeFormat('en', { timeZone: ianaZoneOf(offset) })).not.toThrow()
  })
})

describe('the window of a range is whole local days ending with today', () => {
  const now = new Date(2026, 10, 19, 15, 30)

  it('reads today by the hour and the others by the day', () => {
    expect(windowOf('today', now)).toEqual({
      since: new Date(2026, 10, 19),
      before: new Date(2026, 10, 20),
      bucket: 'hour',
    })
    expect(windowOf('week', now)).toEqual({
      since: new Date(2026, 10, 13),
      before: new Date(2026, 10, 20),
      bucket: 'day',
    })
    expect(windowOf('month', now).since).toEqual(new Date(2026, 9, 21))
    expect(windowOf('quarter', now).since).toEqual(new Date(2026, 7, 22))
    expect(RANGES.map(range => RANGE_LABELS[range])).toEqual(['今天', '7 天', '30 天', '90 天'])
  })
})
