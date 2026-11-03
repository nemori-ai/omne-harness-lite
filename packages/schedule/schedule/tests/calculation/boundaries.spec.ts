import { describe, expect, it, vi } from 'vitest'
import { ScheduleCivilSchema, ScheduleRecurrenceSchema } from '@omne-harness/schedule-contract'
import {
  enumerateScheduleRecurrence,
  materializeScheduleCivil,
  validateScheduleRecurrence,
} from '@omne-harness/schedule'
import type { ScheduleRecurrence } from '@omne-harness/schedule-contract'

const civil = (text: string) => ScheduleCivilSchema.parse(text)
function run(
  recurrence: ScheduleRecurrence,
  options: {
    take?: number
    after?: string
    inclusive?: boolean
    maxCandidates?: number
    maxYears?: number
  } = {},
) {
  return enumerateScheduleRecurrence({
    recurrence,
    after: options.after === undefined ? null : civil(options.after),
    inclusive: options.inclusive ?? false,
    take: options.take ?? 8,
    budget: { maxCandidates: options.maxCandidates ?? 1000, maxYears: options.maxYears ?? 100 },
  })
}
const recurring = (kind: 'cron' | 'rrule', value: string, until: string | null = null) =>
  ScheduleRecurrenceSchema.parse({
    kind,
    ...(kind === 'cron' ? { expression: value } : { rule: value }),
    begin: '2026-01-01T00:00:00',
    until,
  })
const position = (
  period: 'month' | 'quarter' | 'year',
  ordinal: number | 'last',
  working = false,
) =>
  ScheduleRecurrenceSchema.parse({
    kind: 'position',
    period,
    ordinal,
    interval: 2,
    begin: '2026-02-10T00:00:00',
    until: null,
    selector: working ? { kind: 'workingDay' } : { kind: 'weekday', weekday: 1 },
    times: ['09:00:00', '17:00:00'],
  })

describe('explicit target policy', () => {
  it('unions W with restricted DOW after the named OR decision', () => {
    const result = run(recurring('cron', '0 9 15W * MON'), { take: 6 })
    expect(result).toMatchObject({
      kind: 'ok',
      candidates: [
        '2026-01-05T09:00:00',
        '2026-01-12T09:00:00',
        '2026-01-15T09:00:00',
        '2026-01-19T09:00:00',
        '2026-01-26T09:00:00',
        '2026-02-02T09:00:00',
      ].map(local => ({ kind: 'civil', local })),
    })
  })
  it.each(['0 0 31 2 *', '0 0 30,31 2 *'])(
    'treats legal impossible cron %s as exhausted',
    expression => {
      const rule = recurring('cron', expression)
      expect(validateScheduleRecurrence(rule)).toEqual({ kind: 'valid' })
      expect(run(rule)).toMatchObject({
        kind: 'ok',
        candidates: [],
        exhausted: true,
        limitReason: null,
      })
    },
  )
  it('does not let an impossible DOM suppress the DOW OR branch', () => {
    expect(run(recurring('cron', '0 0 31 2 MON'), { take: 1 })).toMatchObject({
      kind: 'ok',
      candidates: [{ kind: 'civil', local: '2026-02-02T00:00:00' }],
    })
  })
  it('treats impossible RRULE month dates as exhausted', () => {
    expect(run(recurring('rrule', 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30'))).toMatchObject({
      kind: 'ok',
      candidates: [],
      exhausted: true,
      limitReason: null,
    })
  })
  it.each([
    'FREQ=DAILY;INTERVAL=0',
    'FREQ=DAILY;INTERVAL=-1',
    'FREQ=DAILY;BYMONTH=13',
    'FREQ=DAILY;BYDAY=0MO',
    'FREQ=DAILY;BYSECOND=60',
    'FREQ=DAILY;BYMINUTE=60',
    'FREQ=DAILY;BYHOUR=24',
    'FREQ=YEARLY;BYSETPOS=0',
    'FREQ=YEARLY;BYWEEKNO=54',
    'FREQ=YEARLY;BYYEARDAY=367',
    'FREQ=MONTHLY;BYMONTHDAY=32',
  ])('rejects invalid %s', value => {
    expect(validateScheduleRecurrence(recurring('rrule', value)).kind).toBe('invalid')
  })
  it.each([
    '0 0 * * R',
    '0 0 * * H',
    '0 0 * * 5L',
    '0 0 * * *#2',
    '0 0 * * L',
    '0 9 15W,20 * *',
    '0 0 * * * *',
    '0 0 * * * * *',
    '60 0 * * *',
    '0 24 * * *',
    '0 0 0 * *',
    '0 0 * 13 *',
    '0 0 * * 8',
    '*/0 * * * *',
  ])('rejects invalid cron %s', value => {
    expect(validateScheduleRecurrence(recurring('cron', value)).kind).toBe('invalid')
  })
  it.each([
    'FREQ=DAILY;COUNT=1',
    'FREQ=DAILY;UNTIL=20260102T000000',
    'DTSTART=20260101T000000;FREQ=DAILY',
    'FREQ=DAILY\nEXDATE:20260102T000000',
    'RDATE:20260102T000000',
    'FREQ=DAILY;FREQ=WEEKLY',
  ])('rejects rule structure %s', rule => {
    const input = {
      kind: 'rrule',
      rule,
      begin: civil('2026-01-01T00:00:00'),
      until: null,
    } satisfies ScheduleRecurrence
    expect(validateScheduleRecurrence(input).kind).toBe('invalid')
  })
})

it('shares the raw budget across Easter offsets before selecting a yearly position', () => {
  expect(
    run(recurring('rrule', 'FREQ=YEARLY;BYEASTER=-2,0,1;BYSETPOS=-1'), { maxCandidates: 2 }),
  ).toMatchObject({
    kind: 'ok',
    candidates: [],
    scannedCandidates: 2,
    exhausted: false,
    limitReason: 'candidateBudget',
    resumeAfter: null,
  })
})
it('retains full yearly BYSETPOS when DTSTART is after the first Easter', () => {
  const recurrence = ScheduleRecurrenceSchema.parse({
    kind: 'rrule',
    rule: 'FREQ=YEARLY;BYEASTER=0,1;BYSETPOS=1',
    begin: '2026-04-06T00:00:00',
    until: null,
  })
  expect(run(recurrence, { take: 1 })).toMatchObject({
    kind: 'ok',
    candidates: [{ kind: 'civil', local: '2027-03-28T00:00:00' }],
  })
})
it('includes until, then exhausts without emitting a later candidate', () => {
  expect(run(recurring('rrule', 'FREQ=DAILY', '2026-01-02T00:00:00'))).toMatchObject({
    kind: 'ok',
    candidates: [
      { kind: 'civil', local: '2026-01-01T00:00:00' },
      { kind: 'civil', local: '2026-01-02T00:00:00' },
    ],
    exhausted: true,
    limitReason: null,
  })
})
it('reports the year search boundary instead of claiming empty', () => {
  expect(
    run(recurring('rrule', 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29'), { maxYears: 1 }),
  ).toMatchObject({ kind: 'ok', candidates: [], exhausted: false, limitReason: 'yearBudget' })
})
it('resumes an RRULE without reanchoring its interval', () => {
  const recurrence = recurring('rrule', 'FREQ=DAILY;INTERVAL=3')
  const first = run(recurrence, { take: 2 })
  expect(first.kind).toBe('ok')
  if (first.kind !== 'ok' || !first.resumeAfter) return
  expect(run(recurrence, { take: 2, after: first.resumeAfter })).toMatchObject({
    kind: 'ok',
    candidates: [
      { kind: 'civil', local: '2026-01-07T00:00:00' },
      { kind: 'civil', local: '2026-01-10T00:00:00' },
    ],
  })
})
it('anchors a natural quarter and interval at begin', () => {
  expect(run(position('quarter', 1), { take: 2 })).toMatchObject({
    kind: 'ok',
    candidates: [
      { kind: 'civil', local: '2026-07-06T09:00:00' },
      { kind: 'civil', local: '2026-07-06T17:00:00' },
    ],
  })
})
it('returns the full working-day period containing begin and resumes after its end', () => {
  const recurrence = position('quarter', 1, true)
  const page = run(recurrence, { take: 1 })
  expect(page).toMatchObject({
    kind: 'ok',
    candidates: [
      {
        kind: 'workingDayPosition',
        periodStart: '2026-01-01',
        periodEnd: '2026-03-31',
        ordinal: 1,
        times: ['09:00:00', '17:00:00'],
      },
    ],
    resumeAfter: '2026-03-31T23:59:59',
  })
  expect(run(recurrence, { take: 1, after: '2026-03-31T23:59:59' })).toMatchObject({
    kind: 'ok',
    candidates: [
      { kind: 'workingDayPosition', periodStart: '2026-07-01', periodEnd: '2026-09-30' },
    ],
  })
})
it('skips absent positions without overflowing into another month', () => {
  expect(run(position('month', 6), { maxYears: 1 })).toMatchObject({
    kind: 'ok',
    candidates: [],
    limitReason: 'yearBudget',
  })
})
it('handles a very large valid absent ordinal without throwing', () => {
  expect(run(position('year', Number.MAX_SAFE_INTEGER), { maxYears: 1 })).toMatchObject({
    kind: 'ok',
    candidates: [],
    limitReason: 'yearBudget',
  })
})
it('keeps input immutable and never reads wall time', () => {
  const recurrence = recurring('rrule', 'FREQ=DAILY')
  Object.freeze(recurrence)
  const clock = vi.spyOn(Date, 'now').mockImplementation(() => {
    throw new Error('Unexpected wall clock read')
  })
  try {
    expect(run(recurrence, { take: 1 })).toEqual(run(recurrence, { take: 1 }))
    expect(run(recurring('cron', '0 9 * * MON'), { take: 1 }).kind).toBe('ok')
    expect(clock).not.toHaveBeenCalled()
  } finally {
    clock.mockRestore()
  }
})

it.each([
  ['Australia/Lord_Howe', '2026-10-04T02:15:00', 'gap', null, null],
  ['Pacific/Apia', '2011-12-30T12:00:00', 'gap', null, null],
  [
    'Australia/Lord_Howe',
    '2026-04-05T01:45:00',
    'foldEarlier',
    '2026-04-04T14:45:00.000Z',
    '+11:00',
  ],
  ['America/New_York', '2026-01-10T09:00:00', 'unique', '2026-01-10T14:00:00.000Z', '-05:00'],
])('materializes %s %s', (timezone, local, disposition, instant, utcOffset) => {
  const result = materializeScheduleCivil({
    civil: civil(String(local)),
    timezone: String(timezone),
  })
  expect(result).toEqual(
    disposition === 'gap'
      ? { kind: 'gap', civil: local }
      : { kind: 'instant', instant, utcOffset, dstDisposition: disposition },
  )
})

it('deduplicates repeated time values before applying BYSETPOS', () => {
  const recurrence = recurring('rrule', 'FREQ=DAILY;BYHOUR=9,9,17;BYSETPOS=2')
  expect(run(recurrence, { take: 2 })).toMatchObject({
    kind: 'ok',
    candidates: [
      { kind: 'civil', local: '2026-01-01T17:00:00' },
      { kind: 'civil', local: '2026-01-02T17:00:00' },
    ],
  })
})
it.each(['*/1', '1-31', '1-1', Array.from({ length: 31 }, (_, index) => index + 1).join(',')])(
  'preserves restricted full DOM %s in the source OR rule',
  days => {
    expect(run(recurring('cron', `0 9 ${days} * MON`), { take: 1 })).toMatchObject({
      kind: 'ok',
      candidates: [{ kind: 'civil', local: '2026-01-01T09:00:00' }],
    })
  },
)
it('preserves a restricted full DOW range in the source OR rule', () => {
  expect(
    run(recurring('cron', '0 0 1 * SUN-SUN'), { take: 1, after: '2026-01-01T00:00:00' }),
  ).toMatchObject({ kind: 'ok', candidates: [{ kind: 'civil', local: '2026-01-02T00:00:00' }] })
})
it('does not throw when a valid civil would materialize outside the wire instant range', () => {
  expect(
    materializeScheduleCivil({ civil: civil('0000-01-01T00:00:00'), timezone: 'Asia/Tokyo' }).kind,
  ).toBe('invalid')
})

it('does not consume the next page budget on the excluded reference itself', () => {
  expect(
    run(recurring('rrule', 'FREQ=DAILY'), {
      take: 1,
      after: '2026-01-01T00:00:00',
      maxCandidates: 1,
    }),
  ).toMatchObject({
    kind: 'ok',
    candidates: [{ kind: 'civil', local: '2026-01-02T00:00:00' }],
    limitReason: null,
    scannedCandidates: 1,
  })
})

it('does not mistake a budget ending inside year 9999 for domain exhaustion', () => {
  const recurrence = ScheduleRecurrenceSchema.parse({
    kind: 'rrule',
    rule: 'FREQ=YEARLY;BYMONTH=12;BYMONTHDAY=1',
    begin: '9998-06-01T00:00:00',
    until: null,
  })
  expect(run(recurrence, { maxYears: 1 })).toMatchObject({
    kind: 'ok',
    exhausted: false,
    limitReason: 'yearBudget',
  })
})
