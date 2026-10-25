import { describe, expect, it } from 'vitest'
import {
  encodeInstant,
  parseDuration,
  parseInstant,
  type Duration,
  type Instant,
} from '@omne-harness/utc-instant'
import type { IdentityClock, LoginTermsSource } from '@omne-harness/identity'
import {
  adjustableLoginTerms,
  inProcessIdentityOperations,
  manualIdentityClock,
} from '@omne-harness/identity/testing'

function instant(text: string): Instant {
  const parsed = parseInstant(text)
  if (!parsed.ok) throw new Error(`fixture instant ${text}`)
  return parsed.value
}

function duration(text: string): Duration {
  const parsed = parseDuration(text)
  if (!parsed.ok) throw new Error(`fixture duration ${text}`)
  return parsed.value
}

async function issuedUnder(start: string, maxLifetime: string, idlePeriod: string) {
  const clock = manualIdentityClock(instant(start))
  const terms = adjustableLoginTerms({
    maxLifetime: duration(maxLifetime),
    idlePeriod: duration(idlePeriod),
  })
  const operations = inProcessIdentityOperations({ clock: clock.clock, terms: terms.source })
  await operations.registerAndActivate({ loginIdentifier: 'ada', credential: 'secret' })
  const login = await operations.issueLogin({ loginIdentifier: 'ada', credential: 'secret' })
  if (login.kind !== 'succeeded') throw new Error(`login was ${login.kind}`)
  return login
}

describe('the deadlines of the double come from the injected terms', () => {
  it.each([
    ['2026-10-25T12:00:00Z', 'PT3600S', 'PT600S', '2026-10-25T13:00:00Z', '2026-10-25T12:10:00Z'],
    ['2026-10-25T12:00:00Z', 'PT60S', 'PT90S', '2026-10-25T12:01:00Z', '2026-10-25T12:01:30Z'],
    [
      '2026-12-31T23:59:59.5Z',
      'PT0.75S',
      'PT86400S',
      '2027-01-01T00:00:00.25Z',
      '2027-01-01T23:59:59.5Z',
    ],
    [
      '2028-02-28T23:00:00Z',
      'PT3600.000001S',
      'PT7200S',
      '2028-02-29T00:00:00.000001Z',
      '2028-02-29T01:00:00Z',
    ],
  ])('from %s with %s and %s', async (start, max, idle, maxDeadline, idleDeadline) => {
    const login = await issuedUnder(start, max, idle)
    expect(encodeInstant(login.issuedAt)).toBe(start)
    expect(encodeInstant(login.maxDeadline)).toBe(maxDeadline)
    // Fractions keep the finer scale of the two operands; trailing zeros are kept as written.
    expect(encodeInstant(login.idleDeadline).replace(/\.0+Z$/u, 'Z')).toBe(idleDeadline)
  })

  it('counts an inserted leap second as an ordinary second, a documented limit', async () => {
    const login = await issuedUnder('2016-12-31T23:59:59Z', 'PT2S', 'PT2S')
    // SI-exact arithmetic would give 00:00:00; the double gives 00:00:01.
    expect(encodeInstant(login.maxDeadline)).toBe('2017-01-01T00:00:01Z')
  })

  it('does not issue when a deadline would leave year 9999', async () => {
    const clock = manualIdentityClock(instant('9999-12-31T23:59:00Z'))
    const terms = adjustableLoginTerms({
      maxLifetime: duration('PT120S'),
      idlePeriod: duration('PT1S'),
    })
    const operations = inProcessIdentityOperations({ clock: clock.clock, terms: terms.source })
    await operations.registerAndActivate({ loginIdentifier: 'ada', credential: 'secret' })
    await expect(
      operations.issueLogin({ loginIdentifier: 'ada', credential: 'secret' }),
    ).resolves.toMatchObject({ kind: 'basis-unavailable' })
  })

  it('answers invalid for a login it saw end, without reading the clock again', async () => {
    const clock = manualIdentityClock(instant('2026-10-25T12:00:00Z'))
    const terms = adjustableLoginTerms({
      maxLifetime: duration('PT60S'),
      idlePeriod: duration('PT60S'),
    })
    const operations = inProcessIdentityOperations({ clock: clock.clock, terms: terms.source })
    await operations.registerAndActivate({ loginIdentifier: 'ada', credential: 'secret' })
    const login = await operations.issueLogin({ loginIdentifier: 'ada', credential: 'secret' })
    if (login.kind !== 'succeeded') throw new Error('no login')
    clock.advanceBy(duration('PT60S'))
    await expect(operations.recognizeLogin({ loginProof: login.loginProof })).resolves.toEqual({
      kind: 'invalid',
    })
    clock.makeUnavailable('clock down')
    await expect(operations.recognizeLogin({ loginProof: login.loginProof })).resolves.toEqual({
      kind: 'invalid',
    })
  })
})

describe('injected ports that fail', () => {
  it('treats a clock or terms source that throws as an unavailable basis', async () => {
    const throwingClock: IdentityClock = { now: () => Promise.reject(new Error('down')) }
    const throwingTerms: LoginTermsSource = { read: () => Promise.reject(new Error('down')) }
    const terms = adjustableLoginTerms({
      maxLifetime: duration('PT60S'),
      idlePeriod: duration('PT60S'),
    })
    const clock = manualIdentityClock(instant('2026-10-25T12:00:00Z'))
    for (const options of [
      { clock: throwingClock, terms: terms.source },
      { clock: clock.clock, terms: throwingTerms },
    ]) {
      const operations = inProcessIdentityOperations(options)
      await operations.registerAndActivate({ loginIdentifier: 'ada', credential: 'secret' })
      const outcome = await operations.issueLogin({ loginIdentifier: 'ada', credential: 'secret' })
      expect(outcome.kind).toBe('basis-unavailable')
    }
  })

  it('keeps the proof and the credential out of every diagnostic', async () => {
    const clock = manualIdentityClock(instant('2026-10-25T12:00:00Z'))
    const terms = adjustableLoginTerms({
      maxLifetime: duration('PT60S'),
      idlePeriod: duration('PT60S'),
    })
    const operations = inProcessIdentityOperations({ clock: clock.clock, terms: terms.source })
    await operations.registerAndActivate({
      loginIdentifier: 'ada',
      credential: 'secret-credential',
    })
    const login = await operations.issueLogin({
      loginIdentifier: 'ada',
      credential: 'secret-credential',
    })
    if (login.kind !== 'succeeded') throw new Error('no login')
    clock.makeUnavailable('clock down')
    const recognition = await operations.recognizeLogin({ loginProof: login.loginProof })
    const issue = await operations.issueLogin({
      loginIdentifier: 'ada',
      credential: 'secret-credential',
    })
    for (const outcome of [recognition, issue]) {
      expect(outcome.kind).toBe('basis-unavailable')
      if (outcome.kind !== 'basis-unavailable') continue
      expect(outcome.diagnostic).not.toContain(login.loginProof)
      expect(outcome.diagnostic).not.toContain('secret-credential')
      expect(outcome.diagnostic).not.toContain('ada')
    }
  })
})

describe('the manual clock', () => {
  it('moves by signed durations and refuses to leave year 9999', () => {
    const clock = manualIdentityClock(instant('2026-10-25T12:00:00Z'))
    clock.advanceBy(duration('PT90.5S'))
    expect(encodeInstant(clock.current())).toBe('2026-10-25T12:01:30.5Z')
    clock.advanceBy(duration('-PT0.5S'))
    expect(encodeInstant(clock.current())).toBe('2026-10-25T12:01:30.0Z')
    clock.setTo(instant('9999-12-31T23:59:59Z'))
    expect(() => clock.advanceBy(duration('PT1S'))).toThrow(RangeError)
  })

  it('answers unavailable until it is restored', async () => {
    const clock = manualIdentityClock(instant('2026-10-25T12:00:00Z'))
    clock.makeUnavailable('maintenance')
    await expect(clock.clock.now()).resolves.toEqual({
      kind: 'unavailable',
      diagnostic: 'maintenance',
    })
    clock.restore()
    await expect(clock.clock.now()).resolves.toMatchObject({ kind: 'read' })
  })
})
