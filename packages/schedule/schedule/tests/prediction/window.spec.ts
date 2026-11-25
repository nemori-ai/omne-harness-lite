import { Temporal } from '@js-temporal/polyfill'
import { expect, test } from 'vitest'
import { enumerateScheduleRecurrence } from '@omne-harness/schedule'
import type { SchedulePredictionInput } from '@omne-harness/schedule'
import { ScheduleCivilSchema, ScheduleLocalDateSchema } from '@omne-harness/schedule-contract'
import type { ScheduleDefinition, ScheduleRecurrence } from '@omne-harness/schedule-contract'
import {
  calendarFixture,
  context,
  definition,
  harness,
  input,
  instant,
  selected,
  value,
} from './fixtures.ts'

const LIMITS = {
  maxCandidates: 100000,
  maxYears: 10,
  maxExplanations: 1000000,
  maxCalendarCalls: 1000000,
  timeoutMs: 100000,
}
type Overrides = Record<string, 'workingDay' | 'holiday' | 'nonWorkingDay'>
type Slot = { at: string; local: string; originals: string[]; ordinal: number }

function metered(overrides: Overrides = {}, timezone = 'UTC') {
  let scanned = 0
  const made = harness({
    limits: LIMITS,
    calendar: calendarFixture({ overrides, timezone }).queries,
    calculator: {
      async enumerate(request) {
        const page = enumerateScheduleRecurrence(request)
        if (page.kind === 'ok') scanned += page.scannedCandidates
        return { kind: 'completed', value: page }
      },
    },
  })
  return { service: made.service, scanned: () => scanned }
}

async function scannedFor(rule: ScheduleDefinition, patch: Partial<SchedulePredictionInput>) {
  const { service, scanned } = metered()
  const preview = value(await service.preview(context, input(rule, { count: 1, ...patch })))
  return { scanned: scanned(), next: preview.candidates[0]?.scheduledAt, reason: preview.reason }
}

const everyMinute = (begin: string) => ({
  kind: 'cron',
  expression: '* * * * *',
  begin,
  until: null,
})

test('predicting the next slot of an every-minute rule scans the same at 00:01 and at 23:59', async () => {
  const rule = definition(everyMinute('2026-01-01T00:00:00'))
  const early = await scannedFor(rule, { after: instant('2026-06-10T00:01:00.000Z') })
  const late = await scannedFor(rule, { after: instant('2026-06-10T23:59:00.000Z') })
  expect(early.next).toBe('2026-06-10T00:02:00.000Z')
  expect(late.next).toBe('2026-06-11T00:00:00.000Z')
  expect(late.scanned).toBe(early.scanned)
  expect(early.scanned).toBeLessThanOrEqual(64)
})

test('a rule in effect for a year with an eligible limit scans no more than a new one', async () => {
  const limited = definition(everyMinute('2025-06-10T00:00:00'), {
    limits: { eligibleLimit: 10000000, jobLimit: null, excludeDates: [] },
  })
  const consumed = 365 * 24 * 60 + 23 * 60 + 59
  const aged = await scannedFor(limited, {
    after: instant('2026-06-10T23:59:00.000Z'),
    activationExclusive: instant('2025-06-10T00:00:00.000Z'),
    eligibleConsumed: consumed,
  })
  const fresh = await scannedFor(definition(everyMinute('2026-06-10T23:00:00')), {
    after: instant('2026-06-10T23:59:00.000Z'),
  })
  expect(aged.reason).toBeNull()
  expect(aged.next).toBe('2026-06-11T00:00:00.000Z')
  expect(aged.scanned).toBe(fresh.scanned)
})

test('sources carried onto a repeated hour still merge with the sources of that day', async () => {
  const timezone = 'America/New_York'
  const overrides = { '2026-11-01': 'workingDay' } as const
  const rule = definition(
    {
      kind: 'cron',
      expression: '30,50 1 * * *',
      begin: '2026-10-31T00:00:00',
      until: '2026-11-01T23:59:59',
    },
    {
      binding: { ...selected, timezone },
      calendarOverlay: { predicate: 'workingDay', adjust: 'nextWorkingDay' },
    },
  )
  const { service } = metered(overrides, timezone)
  const preview = value(
    await service.preview(context, input(rule, { after: instant('2026-10-31T04:00:00.000Z') })),
  )
  expect(
    preview.candidates.map(item => [item.scheduledAt, [...item.originalLocals].sort()]),
  ).toEqual([
    ['2026-11-01T05:30:00.000Z', ['2026-10-31T01:30:00', '2026-11-01T01:30:00']],
    ['2026-11-01T05:50:00.000Z', ['2026-10-31T01:50:00', '2026-11-01T01:50:00']],
  ])
})

test('sources carried past a skipped hour still merge with the sources of that day', async () => {
  const timezone = 'America/New_York'
  const rule = definition(
    {
      kind: 'cron',
      expression: '0,15 2,3 * * *',
      begin: '2026-03-07T00:00:00',
      until: '2026-03-08T23:59:59',
    },
    {
      binding: { ...selected, timezone },
      calendarOverlay: { predicate: 'workingDay', adjust: 'nextWorkingDay' },
    },
  )
  const { service } = metered({ '2026-03-08': 'workingDay' }, timezone)
  const preview = value(
    await service.preview(context, input(rule, { after: instant('2026-03-07T05:00:00.000Z') })),
  )
  expect(
    preview.candidates.map(item => [item.scheduledAt, [...item.originalLocals].sort()]),
  ).toEqual([
    ['2026-03-08T07:00:00.000Z', ['2026-03-07T03:00:00', '2026-03-08T03:00:00']],
    ['2026-03-08T07:15:00.000Z', ['2026-03-07T03:15:00', '2026-03-08T03:15:00']],
  ])
})

test('east of UTC at year zero the closed bound stays inside the instant range', async () => {
  const { service } = metered({}, 'Asia/Shanghai')
  const rule = definition(
    {
      kind: 'cron',
      expression: '0 9,10 * * *',
      begin: '0000-01-01T00:00:00',
      until: '0000-01-01T23:59:59',
    },
    { binding: { kind: 'explicit', timezone: 'Asia/Shanghai', calendar: null } },
  )
  const preview = value(
    await service.preview(context, input(rule, { after: instant('0000-01-01T00:00:00.000Z') })),
  )
  expect(preview.complete).toBe(true)
  expect(preview.candidates.map(item => item.adjustedLocal)).toEqual([
    '0000-01-01T09:00:00',
    '0000-01-01T10:00:00',
  ])
})

test('a bound carried back before the first instant of the range closes at that instant', async () => {
  const timezone = 'Asia/Shanghai'
  const made = harness({
    limits: LIMITS,
    calendar: calendarFixture({
      timezone,
      coverageStart: '0000-01-01',
      coverageEnd: '0000-12-31',
      overrides: { '0000-01-01': 'workingDay' },
    }).queries,
  })
  const rule = definition(
    {
      kind: 'cron',
      expression: '0 9 * * *',
      begin: '0000-01-01T00:00:00',
      until: '0000-01-04T23:59:59',
    },
    {
      binding: { ...selected, timezone },
      calendarOverlay: { predicate: 'workingDay', adjust: 'previousWorkingDay' },
    },
  )
  const preview = value(
    await made.service.preview(
      context,
      input(rule, { after: instant('0000-01-01T00:00:00.000Z') }),
    ),
  )
  expect(preview.complete).toBe(true)
  expect(preview.candidates.map(item => item.adjustedLocal)).toEqual([
    '0000-01-01T09:00:00',
    '0000-01-03T09:00:00',
    '0000-01-04T09:00:00',
  ])
  expect(preview.candidates[0]?.originalLocals).toHaveLength(2)
})

test('a working-day position rule read across pages gives each month once, in order', async () => {
  const made = harness({
    limits: LIMITS,
    calendar: calendarFixture({ coverageEnd: '2040-12-31' }).queries,
  })
  const rule = definition(
    {
      kind: 'position',
      period: 'month',
      interval: 1,
      begin: '2026-01-01T00:00:00',
      until: null,
      ordinal: 1,
      selector: { kind: 'workingDay' },
      times: ['09:00:00'],
    },
    { binding: selected },
  )
  const preview = value(
    await made.service.preview(
      context,
      input(rule, { after: instant('2026-01-01T00:00:00.000Z'), count: 100 }),
    ),
  )
  expect(made.enumerations.length).toBeGreaterThan(1)
  const months = preview.candidates.map(item => item.adjustedLocal.slice(0, 7))
  expect(months).toHaveLength(100)
  expect(new Set(months).size).toBe(100)
  expect(months).toEqual([...months].sort())
  expect(months.slice(0, 2)).toEqual(['2026-01', '2026-02'])
  expect(months.at(-1)).toBe('2034-04')
  for (const item of preview.candidates) {
    const day = Temporal.PlainDate.from(item.adjustedLocal.slice(0, 10))
    expect(day.dayOfWeek).toBeLessThanOrEqual(5)
    expect(day.day).toBeLessThanOrEqual(3)
  }
})

const weekday = { binding: selected, calendarOverlay: null } as const
async function firstScan(rule: ScheduleDefinition, patch: Partial<SchedulePredictionInput>) {
  const made = harness({ limits: LIMITS, calendar: calendarFixture().queries })
  const preview = value(await made.service.preview(context, input(rule, { count: 1, ...patch })))
  return { from: made.enumerations[0]?.[0].after, preview }
}

test.each([
  ['workingDay', '2026-06-08T10:00:00.000Z', '2026-06-06T10:00:00'],
  ['nonWorkingDay', '2026-06-08T10:00:00.000Z', '2026-06-05T10:00:00'],
  ['holiday', '2026-06-08T10:00:00.000Z', '2026-06-05T10:00:00'],
  ['workingDay', '2026-06-07T10:00:00.000Z', '2026-06-06T00:00:00'],
  ['nonWorkingDay', '2026-06-07T10:00:00.000Z', '2026-06-05T00:00:00'],
] as const)(
  'with %s carried to the next working day, asking at %s scans from %s: as far back as a carried source can be',
  async (predicate, after, from) => {
    const rule = definition(everyMinute('2026-01-01T00:00:00'), {
      ...weekday,
      calendarOverlay: { predicate, adjust: 'nextWorkingDay' },
    })
    expect((await firstScan(rule, { after: instant(after) })).from).toBe(from)
  },
)

test('the scan never starts before the rule or its activation', async () => {
  const carried = { predicate: 'workingDay', adjust: 'nextWorkingDay' } as const
  const activation = instant('2026-06-08T09:00:00.000Z')
  const active = { activationExclusive: activation }
  const plain = definition(everyMinute('2026-01-01T00:00:00'))
  expect(
    (await firstScan(plain, { ...active, after: instant('2026-06-01T00:00:00.000Z') })).from,
  ).toBe('2026-06-08T09:00:00')
  const overlaid = definition(everyMinute('2026-01-01T00:00:00'), {
    ...weekday,
    calendarOverlay: carried,
  })
  const asked = await firstScan(overlaid, {
    ...active,
    after: instant('2026-06-08T09:30:00.000Z'),
  })
  expect(asked.from).toBe('2026-06-08T09:00:00')
  expect(asked.preview.candidates[0]?.adjustedLocal).toBe('2026-06-08T09:31:00')
  const fixture = calendarFixture()
  const early = harness({ limits: LIMITS, calendar: fixture.queries })
  value(
    await early.service.preview(
      context,
      input(overlaid, { ...active, count: 1, after: instant('2026-06-03T12:00:00.000Z') }),
    ),
  )
  expect(early.enumerations[0]?.[0].after).toBe('2026-06-08T09:00:00')
  const asksAbout = (date: string) =>
    fixture.requests.filter(request => 'date' in request.query && request.query.date === date)
  expect(asksAbout('2026-06-03')).toEqual([])
})

test('a carried rule in effect for a year scans no more than one in effect for a week', async () => {
  const carried = (begin: string) =>
    definition(everyMinute(begin), {
      ...weekday,
      calendarOverlay: { predicate: 'workingDay', adjust: 'nextWorkingDay' },
    })
  const scanned = async (begin: string) => {
    const made = metered()
    value(
      await made.service.preview(
        context,
        input(carried(begin), { count: 1, after: instant('2026-06-08T00:01:00.000Z') }),
      ),
    )
    return made.scanned()
  }
  const week = await scanned('2026-06-01T00:00:00')
  expect(await scanned('2025-06-09T00:00:00')).toBe(week)
  expect(week).toBeLessThan(3 * 24 * 60)
})

test('where the count stands is read only with an eligible limit, and only when it is not after the reference', async () => {
  const daily = { kind: 'cron', expression: '0 9 * * *', begin: '2026-04-01T00:00:00', until: null }
  const limited = definition(daily, {
    limits: { eligibleLimit: 9, jobLimit: null, excludeDates: [] },
  })
  const after = instant('2026-04-03T09:00:00.000Z')
  const ordinals = (shown: Awaited<ReturnType<typeof firstScan>>) =>
    shown.preview.candidates.map(item => [item.adjustedLocal, item.eligibleOrdinal])
  const unlimited = await firstScan(definition(daily), {
    after,
    eligibleConsumed: 2,
    eligibleFrom: instant('2026-04-02T09:00:00.000Z'),
  })
  expect(unlimited.from).toBe('2026-04-03T09:00:00')
  expect(ordinals(unlimited)).toEqual([['2026-04-04T09:00:00', 3]])
  const ahead = await firstScan(limited, {
    after,
    eligibleConsumed: 3,
    eligibleFrom: instant('2026-04-05T09:00:00.000Z'),
  })
  expect(ahead.from).toBe('2026-04-03T09:00:00')
  expect(ordinals(ahead)).toEqual([['2026-04-04T09:00:00', 4]])
  const onTheSlot = await firstScan(limited, { after, eligibleConsumed: 2, eligibleFrom: after })
  expect(ordinals(onTheSlot)).toEqual([['2026-04-04T09:00:00', 4]])
})

function generator(seed: number) {
  let state = seed >>> 0
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = state
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
  const below = (bound: number) => Math.floor(next() * bound)
  const pick = <T>(values: readonly T[]): T => values[below(values.length)] as T
  return { next, below, pick }
}

/** The whole rule counted from its beginning by the stated order: bounds, activation, exclusion, the
 * calendar shift, the same checks again, the instant, same-instant merging, then the rank. */
function fromOrigin(
  rule: ScheduleDefinition,
  timezone: string,
  overrides: Overrides,
  activation: string | null,
): Slot[] {
  const recurrence = rule.recurrence as Exclude<ScheduleRecurrence, { kind: 'once' }>
  const working = (date: string) =>
    (overrides[date] ??
      (Temporal.PlainDate.from(date).dayOfWeek <= 5 ? 'workingDay' : 'nonWorkingDay')) ===
    'workingDay'
  const shift = (date: string, step: -1 | 1) => {
    let day = Temporal.PlainDate.from(date)
    do day = day.add({ days: step })
    while (!working(day.toString()))
    return day.toString()
  }
  const at = (local: string) => {
    const zoned = Temporal.PlainDateTime.from(local).toZonedDateTime(timezone, {
      disambiguation: 'earlier',
    })
    if (zoned.toPlainDateTime().toString({ smallestUnit: 'second' }) !== local) return null
    return zoned.toInstant().toString({ smallestUnit: 'millisecond' })
  }
  const activationLocal =
    activation === null
      ? null
      : Temporal.Instant.from(activation)
          .toZonedDateTimeISO(timezone)
          .toPlainDateTime()
          .toString({ smallestUnit: 'second' })
  const out = (local: string) => {
    if (local < recurrence.begin) return true
    if (recurrence.until !== null && local > recurrence.until) return true
    if (activationLocal !== null) {
      if (local <= activationLocal) return true
      const original = at(local)
      if (original !== null && activation !== null && original <= activation) return true
    }
    return rule.limits.excludeDates.some(date => local.startsWith(date))
  }
  const locals: string[] = []
  let after: string | null = null
  for (;;) {
    const page = enumerateScheduleRecurrence({
      recurrence,
      after: after === null ? null : ScheduleCivilSchema.parse(after),
      inclusive: false,
      take: 64,
      budget: { maxCandidates: 100000, maxYears: 10 },
    })
    if (page.kind !== 'ok') throw new Error('reference rule is invalid')
    for (const raw of page.candidates) {
      if (raw.kind === 'civil') locals.push(raw.local)
      else {
        const days: string[] = []
        for (
          let day = Temporal.PlainDate.from(raw.periodStart);
          day.toString() <= raw.periodEnd;
          day = day.add({ days: 1 })
        )
          if (working(day.toString())) days.push(day.toString())
        const chosen = raw.ordinal === 'last' ? days.at(-1) : days[raw.ordinal - 1]
        if (chosen !== undefined) for (const time of raw.times) locals.push(`${chosen}T${time}`)
      }
    }
    if (page.exhausted || page.resumeAfter === null) break
    after = page.resumeAfter
  }
  const merged = new Map<string, Slot>()
  for (const local of locals) {
    if (out(local)) continue
    let adjusted = local
    const overlay = rule.calendarOverlay
    if (overlay !== null) {
      const date = local.slice(0, 10)
      const kind =
        overrides[date] ??
        (Temporal.PlainDate.from(date).dayOfWeek <= 5 ? 'workingDay' : 'nonWorkingDay')
      const matched =
        overlay.predicate === 'workingDay'
          ? kind === 'workingDay'
          : overlay.predicate === 'holiday'
            ? kind === 'holiday'
            : kind !== 'workingDay'
      if (!matched) {
        if (overlay.adjust === 'skip') continue
        adjusted = `${shift(date, overlay.adjust === 'previousWorkingDay' ? -1 : 1)}${local.slice(10)}`
      }
    }
    if (out(adjusted)) continue
    const moment = at(adjusted)
    if (moment === null) continue
    if (activation !== null && moment <= activation) continue
    const existing = merged.get(moment)
    if (existing === undefined)
      merged.set(moment, { at: moment, local: adjusted, originals: [local], ordinal: 0 })
    else if (!existing.originals.includes(local)) existing.originals.push(local)
  }
  const slots = [...merged.values()].sort((left, right) => (left.at < right.at ? -1 : 1))
  slots.forEach((slot, index) => {
    slot.ordinal = index + 1
    slot.originals.sort()
  })
  const limit = rule.limits.eligibleLimit
  return limit === null ? slots : slots.slice(0, limit)
}

const ZONES = [
  ['UTC', '2026-06-10'],
  ['America/New_York', '2026-03-06'],
  ['America/New_York', '2026-10-30'],
  ['Europe/London', '2026-03-27'],
  ['Europe/London', '2026-10-23'],
  ['Australia/Lord_Howe', '2026-04-03'],
  ['Asia/Shanghai', '2026-02-13'],
] as const
const CRONS = [
  '*/7 * * * *',
  '*/13 * * * *',
  '*/30 * * * *',
  '15 */3 * * *',
  '30 1,2,3 * * *',
  '0 9 * * *',
  '0 0 * * *',
  '59 23 * * *',
  '0 9,18 * * 1-5',
  '0 10 * * 6,0',
]
const KINDS = ['workingDay', 'holiday', 'nonWorkingDay'] as const
const ADJUSTS = ['skip', 'previousWorkingDay', 'nextWorkingDay'] as const

function scenario(random: ReturnType<typeof generator>) {
  const [timezone, origin] = random.pick(ZONES)
  const start = Temporal.PlainDate.from(origin).add({ days: random.below(3) })
  const position = random.below(6) === 0
  const span = position ? 70 : 3 + random.below(9)
  const begin = `${position ? start.with({ day: 1 }) : start}T00:00:00`
  const until = `${Temporal.PlainDate.from(begin.slice(0, 10)).add({ days: span })}T23:59:59`
  const recurrence = position
    ? {
        kind: 'position',
        period: 'month',
        interval: 1,
        begin,
        until,
        ordinal: random.pick([1, 2, 'last'] as const),
        selector:
          random.below(2) === 0
            ? { kind: 'workingDay' }
            : { kind: 'weekday', weekday: 1 + random.below(7) },
        times: ['09:00:00', '10:30:00'],
      }
    : { kind: 'cron', expression: random.pick(CRONS), begin, until }
  const overlay =
    random.below(3) === 0 ? null : { predicate: random.pick(KINDS), adjust: random.pick(ADJUSTS) }
  const day = () =>
    Temporal.PlainDate.from(begin.slice(0, 10))
      .add({ days: random.below(span + 1) })
      .toString()
  const overrides: Overrides = {}
  for (let index = random.below(4); index > 0; index -= 1) overrides[day()] = random.pick(KINDS)
  const excludeDates = [...new Set(Array.from({ length: random.below(3) }, day))]
    .sort()
    .map(date => ScheduleLocalDateSchema.parse(date))
  const moment = () => {
    const base = Temporal.PlainDateTime.from(begin)
      .toZonedDateTime(timezone)
      .toInstant()
      .add({ seconds: random.below((span + 2) * 86400) - 86400 })
    return instant(base.toString({ smallestUnit: 'millisecond' }))
  }
  return {
    timezone,
    overrides,
    recurrence,
    overlay,
    excludeDates,
    activation: random.below(4) === 0 ? moment() : null,
    after: moment(),
    anchor: random.below(3) === 0 ? moment() : null,
    count: random.pick([1, 3, 10]),
    limitDraw: random.next(),
    onSlot: random.below(4) === 0,
    slotDraw: random.next(),
  }
}

test('the next slots from the window equal the rule counted from its beginning', async () => {
  const random = generator(20261125)
  const seen = new Set<string>()
  let compared = 0
  let produced = 0
  for (let round = 0; round < 400; round += 1) {
    const drawn = scenario(random)
    const base = definition(drawn.recurrence, {
      binding: { ...selected, timezone: drawn.timezone },
      calendarOverlay: drawn.overlay,
      limits: { eligibleLimit: null, jobLimit: null, excludeDates: drawn.excludeDates },
    })
    const unlimited = fromOrigin(base, drawn.timezone, drawn.overrides, drawn.activation)
    const eligibleLimit =
      drawn.limitDraw < 0.5 ? null : 1 + Math.floor(drawn.limitDraw * (unlimited.length + 3))
    const rule = definition(drawn.recurrence, {
      binding: { ...selected, timezone: drawn.timezone },
      calendarOverlay: drawn.overlay,
      limits: { eligibleLimit, jobLimit: null, excludeDates: drawn.excludeDates },
    })
    const all = eligibleLimit === null ? unlimited : unlimited.slice(0, eligibleLimit)
    const after =
      drawn.onSlot && unlimited.length > 0
        ? instant(unlimited[Math.floor(drawn.slotDraw * unlimited.length)]!.at)
        : drawn.after
    const anchor =
      eligibleLimit !== null && drawn.anchor !== null && drawn.anchor <= after ? drawn.anchor : null
    const consumed = unlimited.filter(slot =>
      anchor === null ? slot.at <= after : slot.at < anchor,
    ).length
    const expected = all.filter(slot => slot.at > after).slice(0, drawn.count)
    seen.add(JSON.stringify([rule, drawn.overrides, drawn.activation, after, anchor, drawn.count]))
    const { service } = metered(drawn.overrides, drawn.timezone)
    const preview = value(
      await service.preview(
        context,
        input(rule, {
          after,
          count: drawn.count,
          activationExclusive: drawn.activation,
          eligibleConsumed: consumed,
          eligibleFrom: anchor,
        }),
      ),
    )
    expect(preview.reason, JSON.stringify(drawn)).toBeNull()
    expect(
      preview.candidates.map(candidate => ({
        at: candidate.scheduledAt,
        local: candidate.adjustedLocal,
        originals: [...candidate.originalLocals].sort(),
        ordinal: candidate.eligibleOrdinal,
      })),
      JSON.stringify(drawn),
    ).toEqual(expected)
    compared += 1
    produced += expected.length
  }
  console.info(
    `window property: ${compared} cases, ${seen.size} distinct inputs, ${produced} slots compared`,
  )
  expect(seen.size).toBeGreaterThan(380)
  expect(produced).toBeGreaterThan(400)
})
