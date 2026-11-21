import { describe, expect, it } from 'vitest'
import { calendarProtocol } from '@omne-harness/calendar-protocol'
import { expectRoundTrip, readSample, tenant } from './fixtures/samples.ts'

const { operations } = calendarProtocol

describe('calendar/v1', () => {
  it('is calendar major 1 with four reads and no observation', () => {
    expect(calendarProtocol.name).toBe('calendar')
    expect(calendarProtocol.major).toBe(1)
    expect(Object.keys(operations)).toEqual([
      'list-calendars',
      'read-environment',
      'read-supply-health',
      'answer',
    ])
    expect(Object.keys(calendarProtocol.observations)).toEqual([])
    for (const operation of Object.values(operations))
      expect([operation.identity, operation.effect, operation.countsAsAccess]).toEqual([
        'login',
        'read',
        true,
      ])
  })

  it('lists calendars with their zone, current version and coverage', () => {
    expectRoundTrip(operations['list-calendars'].body, { tenant })
    expectRoundTrip(operations['list-calendars'].outcomes.succeeded, {
      calendars: [
        {
          calendar: 'cn-legal-holidays',
          timezone: 'Asia/Shanghai',
          version: 'v-1',
          coverageStart: '2020-01-01',
          coverageEnd: '2026-12-31',
        },
        {
          calendar: 'us-federal-holidays',
          timezone: 'America/New_York',
          version: null,
          coverageStart: null,
          coverageEnd: null,
        },
      ],
    })
  })

  it('reads the supply health of each calendar', () => {
    expectRoundTrip(operations['read-supply-health'].body, { tenant })
    expectRoundTrip(operations['read-supply-health'].outcomes.succeeded, {
      calendars: [
        {
          calendar: 'jp-legal-holidays',
          queryAvailability: 'available',
          supply: 'failed',
          horizon: 'warning',
          coverageStart: '1955-01-01',
          coverageEnd: '2027-12-31',
          knowledgeAsOf: '2026-02-02T00:30:17.000Z',
          remainingCoverageDays: 298,
          consecutiveFailures: 2,
          lastSuccess: null,
          pendingRuns: 0,
          sources: [
            {
              source: 'cao-syukujitsu-csv',
              observation: 'failed',
              reason: 'fetch failed',
              consecutiveFailures: 2,
            },
            {
              source: 'vacanza-holidays-library',
              observation: 'unchanged',
              reason: null,
              consecutiveFailures: 0,
            },
          ],
          reasons: [],
        },
      ],
    })
    const negative = readSample(operations['read-supply-health'].outcomes.succeeded, {
      calendars: [{ calendar: 'x', remainingCoverageDays: -1 }],
    })
    expect(negative.ok).toBe(false)
    const unnamed = readSample(operations['read-supply-health'].outcomes.succeeded, {
      calendars: [{ calendar: 'x', sources: [{ observation: 'lost' }] }],
    })
    expect(unnamed.ok).toBe(false)
  })

  it('answers on a named calendar and version, both optional', () => {
    const question = { kind: 'day', date: '2026-11-03' }
    expectRoundTrip(operations.answer.body, { tenant, question, calendar: 'jp-legal-holidays' })
    expectRoundTrip(operations.answer.body, {
      tenant,
      question,
      calendar: 'jp-legal-holidays',
      version: 'v-0',
    })
  })

  it('reads the environment the settings select', () => {
    expectRoundTrip(operations['read-environment'].outcomes.succeeded, {
      calendar: 'cn-legal-holidays',
      timezone: 'Asia/Shanghai',
      revision: '3',
      version: 'v-1',
    })
    expectRoundTrip(operations['read-environment'].outcomes.unsupported, { reason: 'environment' })
  })

  it.each([
    { kind: 'day', date: '2026-10-11' },
    { kind: 'count', from: '2026-09-28', to: '2026-10-09' },
    { kind: 'shift', date: '2026-09-30', direction: 'forward', days: 5 },
    { kind: 'shift', date: '2026-10-08', direction: 'backward', days: 0 },
    { kind: 'next', after: '2026-09-30', count: 3 },
    { kind: 'nth', periodStart: '2026-10-01', periodEnd: '2026-10-31', ordinal: 'last' },
    { kind: 'nth', periodStart: '2026-10-01', periodEnd: '2026-10-31', ordinal: 2 },
  ])('carries the question %o', question => {
    expectRoundTrip(operations.answer.body, { tenant, question })
  })

  it.each([
    [
      'a calendar of the caller',
      { kind: 'day', date: '2026-10-11', calendar: 'jp-legal-holidays' },
    ],
    ['a version of the caller', { kind: 'day', date: '2026-10-11', version: 'v-1' }],
    ['a day the month does not have', { kind: 'day', date: '2026-02-30' }],
    ['a signed offset', { kind: 'shift', date: '2026-09-30', direction: 'forward', days: -1 }],
    ['no days to list', { kind: 'next', after: '2026-09-30', count: 0 }],
  ])('refuses %s', (_label, question) => {
    expect(readSample(operations.answer.body, { tenant, question })).toEqual({ ok: false })
  })

  it.each([
    {
      kind: 'day',
      date: '2026-10-11',
      classification: 'workingDay',
      working: true,
      adjusted: true,
    },
    { kind: 'count', from: '2026-09-28', to: '2026-10-09', count: 5 },
    { kind: 'shift', date: '2026-10-13' },
    { kind: 'next', dates: ['2026-10-09', '2026-10-10'] },
    { kind: 'nth', date: null },
  ])('answers %o with its basis', result => {
    expectRoundTrip(operations.answer.outcomes.succeeded, {
      calendar: 'cn-legal-holidays',
      version: 'v-1',
      coverageStart: '2020-01-01',
      coverageEnd: '2026-12-31',
      result,
    })
  })

  it('names why a question has no answer', () => {
    expectRoundTrip(operations.answer.outcomes.invalid, { reason: 'timezone' })
    expectRoundTrip(operations.answer.outcomes.unsupported, { reason: 'coverage' })
    expect(Object.keys(operations.answer.outcomes).sort()).toEqual(
      [
        'basis-unavailable',
        'denied',
        'invalid',
        'protocol-rejected',
        'succeeded',
        'unsupported',
      ].sort(),
    )
  })
})
