import { expect, test, vi } from 'vitest'
import { enumerateScheduleRecurrence } from '@omne-harness/schedule'
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

const defaults = {
  maxCandidates: 10000,
  maxYears: 10,
  maxExplanations: 10000,
  maxCalendarCalls: 10000,
  timeoutMs: 10000,
}

test('candidate exhaustion never exposes unsealed collision sources', async () => {
  const fixture = calendarFixture()
  const { service } = harness({
    calendar: fixture.queries,
    limits: { ...defaults, maxCandidates: 2 },
  })
  const rule = definition(daily('2026-04-04T00:00:00', '2026-04-08T23:59:59'), {
    binding: selected,
    calendarOverlay: { predicate: 'workingDay', adjust: 'nextWorkingDay' },
  })
  const preview = value(
    await service.preview(
      context,
      input(rule, { after: instant('2026-04-03T00:00:00.000Z'), count: 1 }),
    ),
  )
  expect(preview).toMatchObject({ complete: false, reason: 'search_limit', candidates: [] })
  expect(preview.observedThrough >= '2026-04-03T00:00:00.000Z').toBe(true)
  expect(preview.observedThrough < '2026-04-06T09:00:00.000Z').toBe(true)
})

test('candidate exhaustion preserves only a sealed time prefix', async () => {
  const { service } = harness({ limits: { ...defaults, maxCandidates: 4 } })
  const preview = value(
    await service.preview(
      context,
      input(definition(daily('2026-04-01T00:00:00', null)), { count: 10 }),
    ),
  )
  expect(preview.complete).toBe(false)
  expect(preview.reason).toBe('search_limit')
  expect(preview.candidates.map(candidate => candidate.adjustedLocal)).toEqual([
    '2026-04-01T09:00:00',
    '2026-04-02T09:00:00',
  ])
})

test('year window is global across worker pages and empty impossible rules stay incomplete', async () => {
  const { service, enumerations } = harness({ limits: { ...defaults, maxYears: 1 } })
  const preview = value(
    await service.preview(
      context,
      input(
        definition({
          kind: 'cron',
          expression: '0 9 31 2 *',
          begin: '2000-01-01T00:00:00',
          until: null,
        }),
        { after: instant('2026-01-01T00:00:00.000Z') },
      ),
    ),
  )
  expect(preview).toMatchObject({ complete: false, reason: 'search_limit', candidates: [] })
  expect(enumerations[0]?.[0].after).toBe('2026-01-01T00:00:00')
  expect(enumerations[0]?.[0].recurrence).toMatchObject({ until: '2026-12-31T23:59:59' })
})

test('explanations and Calendar calls have cumulative limits, including capture and frontier', async () => {
  const noCalendar = harness({ limits: { ...defaults, maxExplanations: 1 } })
  const preview = value(
    await noCalendar.service.preview(
      context,
      input(definition(daily('2026-04-01T00:00:00', '2026-04-10T23:59:59'))),
    ),
  )
  expect(preview).toMatchObject({ complete: false, reason: 'explanation_limit' })
  const fixture = calendarFixture()
  const rule = definition(daily('2026-04-01T00:00:00', '2026-04-10T23:59:59'), {
    binding: selected,
    calendarOverlay: { predicate: 'workingDay', adjust: 'skip' },
  })
  const afterBasis = harness({
    calendar: fixture.queries,
    limits: { ...defaults, maxCalendarCalls: 2 },
  })
  expect(value(await afterBasis.service.preview(context, input(rule)))).toMatchObject({
    complete: false,
    reason: 'search_limit',
    candidates: [],
  })
  const beforeBasis = harness({
    calendar: fixture.queries,
    limits: { ...defaults, maxCalendarCalls: 1 },
  })
  expect(await beforeBasis.service.preview(context, input(rule))).toMatchObject({
    kind: 'error',
    error: { code: 'search_limit', details: { reason: 'search_limit' } },
  })
})

test('one deadline covers environment, Calendar and worker; worker receives only the remainder', async () => {
  let now = 0
  const timeouts: number[] = []
  const fixture = calendarFixture()
  const get = fixture.queries.get
  const resolve = fixture.queries.resolve
  fixture.queries.get = async (...args) => {
    now += 10
    return get(...args)
  }
  fixture.queries.resolve = async (...args) => {
    now += 10
    return resolve(...args)
  }
  const { service } = harness({
    limits: { ...defaults, timeoutMs: 100 },
    calendar: fixture.queries,
    monotonicClock: { now: () => now },
    environment: {
      observe: async () => {
        now += 30
        return {
          kind: 'ok',
          value: {
            owner: context.owner,
            revision: 'env:1',
            timezone: 'UTC',
            calendar: selected.calendar,
          },
        }
      },
    },
    calculator: {
      enumerate: async (request, options) => {
        timeouts.push(options.timeoutMs)
        now += 51
        return { kind: 'completed', value: enumerateScheduleRecurrence(request) }
      },
    },
  })
  expect(
    value(
      await service.preview(
        context,
        input(definition(undefined, { binding: { kind: 'followUserEnvironment' } })),
      ),
    ),
  ).toMatchObject({ complete: false, reason: 'deadline_exceeded', candidates: [] })
  expect(timeouts).toEqual([50])
})

test('worker pagination cannot reset the total deadline', async () => {
  let now = 0
  const timeouts: number[] = []
  const { service } = harness({
    limits: { ...defaults, timeoutMs: 100 },
    monotonicClock: { now: () => now },
    calculator: {
      enumerate: async (request, options) => {
        timeouts.push(options.timeoutMs)
        now += 60
        return { kind: 'completed', value: enumerateScheduleRecurrence({ ...request, take: 1 }) }
      },
    },
  })
  expect(
    value(
      await service.preview(
        context,
        input(definition(daily('2026-01-01T00:00:00', null)), { count: 5 }),
      ),
    ),
  ).toMatchObject({ complete: false, reason: 'deadline_exceeded' })
  expect(timeouts).toEqual([100, 40])
})

test('a late rejecting environment does not leave an unhandled rejection', async () => {
  vi.useFakeTimers()
  try {
    const { service } = harness({
      limits: { ...defaults, timeoutMs: 10 },
      environment: {
        observe: () =>
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('late provider failure')), 20),
          ),
      },
    })
    const pending = service.preview(
      context,
      input(definition(undefined, { binding: { kind: 'followUserEnvironment' } })),
    )
    await vi.advanceTimersByTimeAsync(10)
    expect(await pending).toMatchObject({
      kind: 'error',
      error: { code: 'search_limit', details: { reason: 'deadline_exceeded' } },
    })
    await vi.advanceTimersByTimeAsync(20)
  } finally {
    vi.useRealTimers()
  }
})

test('position times consume the same candidate budget as civil sources', async () => {
  const fixture = calendarFixture()
  const { service } = harness({
    calendar: fixture.queries,
    limits: { ...defaults, maxCandidates: 1 },
  })
  const rule = definition(
    {
      kind: 'position',
      period: 'month',
      interval: 1,
      begin: '2026-01-01T00:00:00',
      until: '2026-01-31T23:59:59',
      ordinal: 1,
      selector: { kind: 'workingDay' },
      times: ['09:00:00', '10:00:00'],
    },
    { binding: selected },
  )
  expect(value(await service.preview(context, input(rule)))).toMatchObject({
    complete: false,
    reason: 'search_limit',
    candidates: [],
  })
})

test('unlimited future lookahead avoids ancient history while finite eligibility retains its semantic cost', async () => {
  const { service, enumerations } = harness()
  const rule = definition(daily('1900-01-01T00:00:00', null))
  value(
    await service.preview(
      context,
      input(rule, { after: instant('2026-04-01T00:00:00.000Z'), count: 1 }),
    ),
  )
  expect(enumerations[0]?.[0].after).toBe('2026-04-01T00:00:00')
  enumerations.length = 0
  value(
    await service.preview(
      context,
      input({ ...rule, limits: { ...rule.limits, eligibleLimit: 2 } }, { count: 1 }),
    ),
  )
  expect(enumerations[0]?.[0].after).toBe('1900-01-01T00:00:00')
})

test.each(['eligibleLimit', 'jobLimit'] as const)(
  'known exhausted %s returns complete without enumerating or inventing sources',
  async axis => {
    const enumerate = vi.fn(async (): Promise<never> => {
      throw new Error('Exhausted rules need no search')
    })
    const { service } = harness({ calculator: { enumerate } })
    const rule = definition(daily('1900-01-01T00:00:00', null), {
      limits: { eligibleLimit: null, jobLimit: null, excludeDates: [], [axis]: 1000000 },
    })
    const preview = value(
      await service.preview(
        context,
        input(rule, { eligibleConsumed: 1000000, acceptedJobCount: 1000000 }),
      ),
    )
    expect(preview).toMatchObject({ complete: true, candidates: [], excluded: [] })
    expect(enumerate).not.toHaveBeenCalled()
  },
)
