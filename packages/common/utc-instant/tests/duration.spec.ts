import { describe, expect, it } from 'vitest'
import { encodeDuration, parseDuration } from '@omne-harness/utc-instant'

function duration(text: string) {
  const parsed = parseDuration(text)
  if (!parsed.ok) throw new Error(`${text} failed as ${parsed.failure.kind}`)
  return parsed.value
}

describe('SI second durations', () => {
  it('keeps all 16 fraction digits of PT1.0000000000000001S', () => {
    expect(encodeDuration(duration('PT1.0000000000000001S'))).toBe('PT1.0000000000000001S')
  })

  it.each(['PT0S', 'PT5S', '-PT5S', 'PT90S', 'PT0.000000001S', '-PT86400.25S'])(
    'encodes %s back to the same text',
    text => {
      expect(encodeDuration(duration(text))).toBe(text)
    },
  )

  it.each(['P1D', 'PT1M', 'PT1H', 'P1Y', 'P1M', 'P1W', 'P1DT1S', 'PT1H30S', 'PT1M0.5S', '-P1D'])(
    'refuses the calendar or clock unit in %s',
    text => {
      expect(parseDuration(text)).toEqual({ ok: false, failure: { kind: 'calendar-unit' } })
    },
  )

  it.each([
    '',
    'P',
    'PT',
    'PTS',
    'PT.5S',
    'PT1.S',
    'PT5',
    '5S',
    'pt5s',
    'PT5s',
    '+PT5S',
    'PT 5S',
    'PT-5S',
    'PT5S5S',
    'PT0.5S0.5S',
  ])('refuses the malformed text %j as syntax', text => {
    expect(parseDuration(text)).toEqual({ ok: false, failure: { kind: 'syntax' } })
  })

  it('has no JSON form, so serialising one cannot silently emit {}', () => {
    expect(() => JSON.stringify({ timeout: duration('PT5S') })).toThrow(TypeError)
  })

  it('has no string form, so String() and a template cannot silently emit [object Object]', () => {
    const timeout = duration('PT5S')
    expect(() => String(timeout)).toThrow(TypeError)
    expect(() => `${timeout}`).toThrow(TypeError)
  })

  it('refuses a value that parseDuration did not produce', () => {
    const forged = {} as Parameters<typeof encodeDuration>[0]
    expect(() => encodeDuration(forged)).toThrow(TypeError)
  })

  it('cannot be minted through .constructor', () => {
    const Hidden = duration('PT5S').constructor as new (...args: unknown[]) => unknown
    expect(() => new Hidden(false, '5', '')).toThrow(TypeError)
    expect(() => new Hidden('PT5S')).toThrow(TypeError)
  })
})
