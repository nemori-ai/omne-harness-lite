import { date, finding, isoDate, sourceDay, sourceParser } from './common.ts'
import type { CalendarSupplyPolicy, SourceParseResult, SupplyDay } from './types.ts'

const statute = '5 U.S.C. §6103(a)'
type HolidayRule = { readonly name: string; readonly since: number; readonly month: number } & (
  | { readonly kind: 'fixed'; readonly day: number }
  | { readonly kind: 'nth'; readonly weekday: number; readonly nth: number }
)
const rules: readonly HolidayRule[] = [
  { kind: 'fixed', name: 'new_year', month: 1, day: 1, since: 1971 },
  { kind: 'nth', name: 'mlk', month: 1, weekday: 1, nth: 3, since: 1986 },
  { kind: 'nth', name: 'washington', month: 2, weekday: 1, nth: 3, since: 1971 },
  { kind: 'nth', name: 'memorial', month: 5, weekday: 1, nth: -1, since: 1971 },
  { kind: 'fixed', name: 'juneteenth', month: 6, day: 19, since: 2021 },
  { kind: 'fixed', name: 'independence', month: 7, day: 4, since: 1971 },
  { kind: 'nth', name: 'labor', month: 9, weekday: 1, nth: 1, since: 1971 },
  { kind: 'nth', name: 'columbus', month: 10, weekday: 1, nth: 2, since: 1971 },
  { kind: 'fixed', name: 'veterans', month: 11, day: 11, since: 1971 },
  { kind: 'nth', name: 'thanksgiving', month: 11, weekday: 4, nth: 4, since: 1971 },
  { kind: 'fixed', name: 'christmas', month: 12, day: 25, since: 1971 },
]
function legalDateFor(rule: HolidayRule, year: number): ReturnType<typeof date> {
  if (rule.kind === 'fixed')
    return date(
      `${year}-${String(rule.month).padStart(2, '0')}-${String(rule.day).padStart(2, '0')}`,
    )
  const first = date(`${year}-${String(rule.month).padStart(2, '0')}-01`)
  if (rule.nth === -1) {
    const last = first.add({ months: 1 }).subtract({ days: 1 })
    return last.subtract({ days: (last.dayOfWeek - rule.weekday + 7) % 7 })
  }
  return first.add({ days: ((rule.weekday - first.dayOfWeek + 7) % 7) + (rule.nth - 1) * 7 })
}
export function usFederalObservances(
  start: string,
  end: string,
): { date: string; legalDate: string; name: string; basis: string }[] {
  const entries = []
  for (let year = date(start).year; year <= date(end).year + 1; year++)
    for (const rule of rules) {
      if (year < rule.since) continue
      const legalDate = legalDateFor(rule, year)
      const observed =
        legalDate.dayOfWeek === 6
          ? legalDate.subtract({ days: 1 })
          : legalDate.dayOfWeek === 7
            ? legalDate.add({ days: 1 })
            : legalDate
      const value = observed.toString()
      if (value < start || value > end) continue
      const shift =
        legalDate.dayOfWeek === 6
          ? '; 5 U.S.C. §6103(b)(1)'
          : legalDate.dayOfWeek === 7
            ? '; Executive Order 11582 §3(a)'
            : ''
      entries.push({
        date: value,
        legalDate: legalDate.toString(),
        name: rule.name,
        basis: statute + shift,
      })
    }
  return entries
}
export function computeUsFederalCalendar(input: {
  readonly start: string
  readonly end: string
  readonly acquiredAt: string
  readonly knowledgeAsOf: string
  readonly reference: string
}): SourceParseResult {
  const sourceId = 'usc-6103-computed-rules'
  return sourceParser(
    sourceId,
    {
      ...input,
      content: new TextEncoder().encode(
        JSON.stringify({ rulesBasis: statute, start: input.start, end: input.end, rules }),
      ),
    },
    material => {
      isoDate.parse(input.start)
      isoDate.parse(input.end)
      if (input.start > input.end || date(input.start).year < 1971 || date(input.end).year > 9998)
        throw new Error(
          'US statutory support starts in 1971 and needs the following year for observed spillover',
        )
      const days: SupplyDay[] = usFederalObservances(input.start, input.end).map(entry =>
        sourceDay(
          sourceId,
          material,
          entry.date,
          'holiday',
          `${entry.basis}; legal_date=${entry.legalDate}; holiday=${entry.name}`,
          entry.name,
        ),
      )
      const inaugurationDays = days.filter(
        day => day.date.endsWith('-01-20') && (date(day.date).year - 1965) % 4 === 0,
      )
      for (const day of inaugurationDays)
        days.push(
          sourceDay(
            sourceId,
            material,
            day.date,
            'holiday',
            '5 U.S.C. §6103(c)',
            'Regional Inauguration Day coincides with an existing nationwide holiday; no separate national closure',
          ),
        )
      return {
        days,
        coverageIntervals: [{ start: input.start, end: input.end }],
        checks: [
          finding(
            'us.statutory_holidays_present',
            'passed',
            'Computed each historical statutory identity with observed spillover',
          ),
        ],
      }
    },
  )
}
export function classifyRemainingCoverageDays(input: {
  readonly remainingCoverageDays: number
  readonly warningFloorDays: number
  readonly criticalFloorDays: number
}): 'ok' | 'warning' | 'critical' | 'unknown' {
  if (
    ![input.remainingCoverageDays, input.warningFloorDays, input.criticalFloorDays].every(
      Number.isFinite,
    ) ||
    input.criticalFloorDays > input.warningFloorDays
  )
    return 'unknown'
  return input.remainingCoverageDays <= input.criticalFloorDays
    ? 'critical'
    : input.remainingCoverageDays <= input.warningFloorDays
      ? 'warning'
      : 'ok'
}

export function classifyCalendarSupplyHorizon(input: {
  readonly policy: CalendarSupplyPolicy
  readonly remainingCoverageDays: number
}): 'ok' | 'warning' | 'critical' | 'unknown' {
  const { horizon } = input.policy
  if (
    !Number.isFinite(input.remainingCoverageDays) ||
    horizon.criticalFloorDays > horizon.warningFloorDays
  )
    return 'unknown'
  const critical =
    horizon.criticalComparison === 'exclusive'
      ? input.remainingCoverageDays < horizon.criticalFloorDays
      : input.remainingCoverageDays <= horizon.criticalFloorDays
  return critical
    ? 'critical'
    : input.remainingCoverageDays <= horizon.warningFloorDays
      ? 'warning'
      : 'ok'
}
