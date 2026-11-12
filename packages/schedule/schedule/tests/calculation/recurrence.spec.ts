import { describe, expect, it } from 'vitest'
import { ScheduleCivilSchema, ScheduleRecurrenceSchema } from '@omne-harness/schedule-contract'
import {
  enumerateScheduleRecurrence,
  materializeScheduleCivil,
  validateScheduleRecurrence,
} from '@omne-harness/schedule'
import corpus from './source-corpus.json' with { type: 'json' }
import additionalCron from './additional-cron.json' with { type: 'json' }

const civil = (value: string) => ScheduleCivilSchema.parse(value)
function enumerate(recurrence: unknown, take = 8, after: string | null = null) {
  return enumerateScheduleRecurrence({
    recurrence: ScheduleRecurrenceSchema.parse(recurrence),
    after: after === null ? null : civil(after),
    inclusive: after === null,
    take,
    budget: { maxCandidates: 10000, maxYears: 100 },
  })
}

describe('fixed source recurrence corpus', () => {
  it.each(corpus.rrules)('$id', row => {
    const result = enumerate({ kind: 'rrule', rule: row.rule, begin: row.dtstart, until: null })
    expect(result.kind).toBe('ok')
    if (result.kind === 'ok')
      expect(result.candidates).toEqual(row.expected.map(local => ({ kind: 'civil', local })))
  })
  it.each(corpus.cron.filter(row => row.valid && !row.error && row.expression !== '0 9 15W * MON'))(
    'cron $expression',
    row => {
      const result = enumerate(
        { kind: 'cron', expression: row.expression, begin: '2026-01-01T00:00:00', until: null },
        6,
        '2026-01-01T00:00:00',
      )
      expect(result.kind).toBe('ok')
      if (result.kind === 'ok')
        expect(result.candidates).toEqual(row.expected.map(local => ({ kind: 'civil', local })))
    },
  )
})

it('distinguishes a DST gap from a fold and retains the earlier offset', () => {
  expect(
    materializeScheduleCivil({ civil: civil('2026-03-08T02:30:00'), timezone: 'America/New_York' }),
  ).toEqual({ kind: 'gap', civil: '2026-03-08T02:30:00' })
  expect(
    materializeScheduleCivil({ civil: civil('2026-11-01T01:30:00'), timezone: 'America/New_York' }),
  ).toEqual({
    kind: 'instant',
    instant: '2026-11-01T05:30:00.000Z',
    utcOffset: '-04:00',
    dstDisposition: 'foldEarlier',
  })
})

it('rejects permissive library hour and second values', () => {
  for (const rule of ['FREQ=DAILY;BYHOUR=24', 'FREQ=DAILY;BYSECOND=60']) {
    expect(
      validateScheduleRecurrence(
        ScheduleRecurrenceSchema.parse({
          kind: 'rrule',
          rule,
          begin: '2026-01-01T00:00:00',
          until: null,
        }),
      ).kind,
    ).toBe('invalid')
  }
})

it.each(additionalCron)('retains the fixed croniter dialect for $expression', row => {
  const recurrence = ScheduleRecurrenceSchema.parse({
    kind: 'cron',
    expression: row.expression,
    begin: '2026-01-01T00:00:00',
    until: null,
  })
  if (!row.valid) {
    expect(validateScheduleRecurrence(recurrence).kind).toBe('invalid')
    return
  }
  const result = enumerate(recurrence, 8, '2026-01-01T00:00:00')
  expect(result.kind).toBe('ok')
  if (result.kind === 'ok')
    expect(result.candidates).toEqual(row.expected?.map(local => ({ kind: 'civil', local })))
})
