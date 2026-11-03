import { expect, test } from 'vitest'
import { ScheduleCivilSchema, ScheduleLocalDateSchema } from '@omne-harness/schedule-contract'
import {
  calendarFixture,
  context,
  daily,
  definition,
  harness,
  input,
  instant,
  selected,
  value,
} from './fixtures.ts'

test('public once is strictly future and explicit has no external reads', async () => {
  const { service } = harness()
  const first = value(await service.preview(context, input(definition(), { count: 1 })))
  expect(first).toMatchObject({
    complete: true,
    candidates: [{ scheduledAt: '2026-11-05T09:00:00.000Z', eligibleOrdinal: 1 }],
    remainingEligible: null,
    remainingJobs: null,
  })
  expect(
    value(
      await service.preview(
        context,
        input(definition(), { after: first.candidates[0]!.scheduledAt }),
      ),
    ).candidates,
  ).toEqual([])
})

test('Chinese holiday Monday and make-up Saturday follow Calendar facts', async () => {
  const calendar = calendarFixture({
    overrides: { '2026-02-16': 'holiday', '2026-02-21': 'workingDay' },
  })
  const { service } = harness({ calendar: calendar.queries })
  const rule = definition(daily('2026-02-16T00:00:00', '2026-02-22T23:59:59'), {
    binding: selected,
    calendarOverlay: { predicate: 'workingDay', adjust: 'skip' },
  })
  const preview = value(await service.preview(context, input(rule)))
  expect(preview.candidates.map(item => item.adjustedLocal)).toEqual([
    '2026-02-17T09:00:00',
    '2026-02-18T09:00:00',
    '2026-02-19T09:00:00',
    '2026-02-20T09:00:00',
    '2026-02-21T09:00:00',
  ])
  expect(preview.excluded.filter(item => item.reason === 'calendarPredicate')).toHaveLength(2)
  expect(preview.basis.publicationGeneration).toBe(3)
})

test.each(['nextWorkingDay', 'previousWorkingDay'] as const)(
  '%s sorts all times and merges later sources across worker pages',
  async adjust => {
    const calendar = calendarFixture()
    const { service, enumerations } = harness({ calendar: calendar.queries })
    const rule = definition(
      {
        kind: 'cron',
        expression: '0-59 9 * * *',
        begin: '2026-04-03T00:00:00',
        until: '2026-04-06T23:59:59',
      },
      { binding: selected, calendarOverlay: { predicate: 'workingDay', adjust } },
    )
    const preview = value(
      await service.preview(
        context,
        input(rule, {
          after: instant(
            adjust === 'nextWorkingDay' ? '2026-04-03T23:59:59.000Z' : '2026-04-02T00:00:00.000Z',
          ),
          count: 2,
        }),
      ),
    )
    expect(preview.complete).toBe(true)
    expect(preview.candidates.map(item => item.adjustedLocal)).toEqual(
      adjust === 'nextWorkingDay'
        ? ['2026-04-06T09:00:00', '2026-04-06T09:01:00']
        : ['2026-04-03T09:00:00', '2026-04-03T09:01:00'],
    )
    expect(preview.candidates.map(item => item.sourceKeys.length)).toEqual([3, 3])
    expect(preview.candidates[0]!.sourceKeys).toEqual([...preview.candidates[0]!.sourceKeys].sort())
    expect(new Set(preview.candidates[0]!.originalLocals).size).toBe(3)
    expect(enumerations.length).toBeGreaterThan(1)
  },
)

test('moves once across a month, drops excluded result, and checks both original and adjusted boundaries', async () => {
  const calendar = calendarFixture()
  const { service } = harness({ calendar: calendar.queries })
  const recurrence = {
    kind: 'cron',
    expression: '0 9 31 * *',
    begin: '2026-01-31T00:00:00',
    until: '2026-02-02T23:59:59',
  }
  const rule = definition(recurrence, {
    binding: selected,
    calendarOverlay: { predicate: 'workingDay', adjust: 'nextWorkingDay' },
  })
  expect(value(await service.preview(context, input(rule))).candidates[0]?.adjustedLocal).toBe(
    '2026-02-02T09:00:00',
  )
  const excluded = {
    ...rule,
    limits: { ...rule.limits, excludeDates: [ScheduleLocalDateSchema.parse('2026-02-02')] },
  }
  expect(value(await service.preview(context, input(excluded)))).toMatchObject({
    complete: true,
    candidates: [],
    excluded: [{ reason: 'excludedAdjustedDate' }],
  })
  const before = {
    ...rule,
    calendarOverlay: { predicate: 'workingDay', adjust: 'previousWorkingDay' } as const,
  }
  expect(value(await service.preview(context, input(before))).excluded[0]?.reason).toBe(
    'beforeBegin',
  )
  const original = {
    ...rule,
    limits: { ...rule.limits, excludeDates: [ScheduleLocalDateSchema.parse('2026-01-31')] },
  }
  expect(value(await service.preview(context, input(original))).excluded[0]?.reason).toBe(
    'excludedOriginalDate',
  )
  const until = definition(
    { ...recurrence, until: '2026-02-01T23:59:59' },
    { binding: selected, calendarOverlay: rule.calendarOverlay },
  )
  expect(value(await service.preview(context, input(until))).excluded[0]?.reason).toBe('afterUntil')
})

test.each(['month', 'quarter', 'year'] as const)(
  'working-day position uses the whole natural %s and stable source identity',
  async period => {
    const calendar = calendarFixture()
    const { service } = harness({ calendar: calendar.queries })
    const rule = definition(
      {
        kind: 'position',
        period,
        interval: 1,
        begin: '2026-01-15T00:00:00',
        until: '2026-12-31T23:59:59',
        ordinal: 1,
        selector: { kind: 'workingDay' },
        times: ['09:00:00', '10:00:00'],
      },
      { binding: selected },
    )
    const preview = value(await service.preview(context, input(rule, { count: 1 })))
    expect(preview.excluded[0]?.reason).toBe('beforeBegin')
    const query = calendar.requests.find(item => item.query.kind === 'nth')
    expect(query?.query).toMatchObject({
      periodStart: '2026-01-01',
      periodEnd:
        period === 'month' ? '2026-01-31' : period === 'quarter' ? '2026-03-31' : '2026-12-31',
    })
    if (period === 'year') expect(preview.candidates).toEqual([])
    else
      expect(preview.candidates[0]?.adjustedLocal).toBe(
        period === 'month' ? '2026-02-02T09:00:00' : '2026-04-01T09:00:00',
      )
  },
)

test('position source remains stable when calendar selects a different date and definition revision changes', async () => {
  const rule = definition(
    {
      kind: 'position',
      period: 'month',
      interval: 1,
      begin: '2026-02-01T00:00:00',
      until: '2026-02-28T23:59:59',
      ordinal: 1,
      selector: { kind: 'workingDay' },
      times: ['09:00:00'],
    },
    { binding: selected },
  )
  const one = value(
    await harness({ calendar: calendarFixture().queries }).service.preview(context, input(rule)),
  )
  const two = value(
    await harness({
      calendar: calendarFixture({ version: 'v2', overrides: { '2026-02-02': 'holiday' } }).queries,
    }).service.preview(
      context,
      input({ ...rule, label: 'Changed text' }, { definitionRevision: 3 }),
    ),
  )
  expect(one.candidates[0]?.sourceKeys).toEqual(two.candidates[0]?.sourceKeys)
  expect(one.candidates[0]?.adjustedLocal).not.toEqual(two.candidates[0]?.adjustedLocal)
})

test('DST gaps skip without consuming eligibility; folds use the earlier instant', async () => {
  const { service } = harness()
  const binding = { kind: 'explicit', timezone: 'America/New_York', calendar: null } as const
  const gap = definition(daily('2026-03-07T00:00:00', '2026-03-10T23:59:59', '2'), {
    binding,
    limits: { eligibleLimit: 2, jobLimit: null, excludeDates: [] },
  })
  const preview = value(await service.preview(context, input(gap)))
  expect(preview.candidates.map(item => [item.adjustedLocal, item.eligibleOrdinal])).toEqual([
    ['2026-03-07T02:00:00', 1],
    ['2026-03-09T02:00:00', 2],
  ])
  expect(preview.excluded.some(item => item.reason === 'dstGap')).toBe(true)
  const fold = definition({ kind: 'once', localAt: '2026-11-01T01:30:00' }, { binding })
  expect(value(await service.preview(context, input(fold))).candidates[0]).toMatchObject({
    scheduledAt: '2026-11-01T05:30:00.000Z',
    dstDisposition: 'foldEarlier',
  })
  expect(
    value(
      await service.preview(
        context,
        input(fold, { activationExclusive: instant('2026-11-01T05:30:00.000Z') }),
      ),
    ).candidates,
  ).toEqual([])
})

test('a DST gap original can move to a real civil time, but activation applies before movement', async () => {
  const calendar = calendarFixture({ timezone: 'America/New_York' })
  const rule = definition(
    {
      kind: 'cron',
      expression: '30 2 * * *',
      begin: '2026-03-08T00:00:00',
      until: '2026-03-09T23:59:59',
    },
    {
      binding: { ...selected, timezone: 'America/New_York' },
      calendarOverlay: { predicate: 'workingDay', adjust: 'nextWorkingDay' },
    },
  )
  const { service } = harness({ calendar: calendar.queries })
  const preview = value(await service.preview(context, input(rule)))
  expect(preview.candidates[0]).toMatchObject({
    adjustedLocal: '2026-03-09T02:30:00',
    sourceKeys: expect.any(Array),
  })
  expect(preview.candidates[0]?.sourceKeys).toHaveLength(2)
  const active = value(
    await service.preview(
      context,
      input(rule, { activationExclusive: instant('2026-03-08T07:00:00.000Z') }),
    ),
  )
  expect(active.candidates[0]?.sourceKeys).toHaveLength(1)
})

test('eligible rank counts merged valid slots from origin and uses consumed as a floor, independently from jobs', async () => {
  const { service } = harness({ calendar: calendarFixture().queries })
  const rule = definition(daily('2026-04-03T00:00:00', '2026-04-09T23:59:59'), {
    binding: selected,
    calendarOverlay: { predicate: 'workingDay', adjust: 'nextWorkingDay' },
    limits: {
      eligibleLimit: 4,
      jobLimit: 5,
      excludeDates: [ScheduleLocalDateSchema.parse('2026-04-07')],
    },
  })
  const preview = value(
    await service.preview(
      context,
      input(rule, {
        after: instant('2026-04-06T12:00:00.000Z'),
        eligibleConsumed: 2,
        acceptedJobCount: 4,
      }),
    ),
  )
  expect(preview.candidates.map(item => [item.adjustedLocal, item.eligibleOrdinal])).toEqual([
    ['2026-04-08T09:00:00', 3],
    ['2026-04-09T09:00:00', 4],
  ])
  expect(preview.remainingEligible).toBe(2)
  expect(preview.remainingJobs).toBe(1)
  const floor = value(
    await service.preview(
      context,
      input(rule, { after: instant('2026-04-03T12:00:00.000Z'), eligibleConsumed: 3 }),
    ),
  )
  expect(floor.candidates.map(item => item.eligibleOrdinal)).toEqual([4])
  const jobs = value(await service.preview(context, input(rule, { acceptedJobCount: 5 })))
  expect(jobs.candidates).toEqual([])
  expect(jobs).toMatchObject({ complete: true, remainingJobs: 0, excluded: [] })
})

test('absent positions do not consume eligibility', async () => {
  const overrides = Object.fromEntries(
    Array.from({ length: 28 }, (_, index) => [
      `2026-02-${String(index + 1).padStart(2, '0')}`,
      'holiday' as const,
    ]),
  )
  const { service } = harness({ calendar: calendarFixture({ overrides }).queries })
  const rule = definition(
    {
      kind: 'position',
      period: 'month',
      interval: 1,
      begin: '2026-02-01T00:00:00',
      until: '2026-03-31T23:59:59',
      ordinal: 1,
      selector: { kind: 'workingDay' },
      times: ['09:00:00'],
    },
    { binding: selected, limits: { eligibleLimit: 1, jobLimit: null, excludeDates: [] } },
  )
  const preview = value(await service.preview(context, input(rule)))
  expect(preview.excluded[0]?.reason).toBe('positionAbsent')
  expect(preview.candidates[0]).toMatchObject({
    adjustedLocal: ScheduleCivilSchema.parse('2026-03-02T09:00:00'),
    eligibleOrdinal: 1,
  })
})
