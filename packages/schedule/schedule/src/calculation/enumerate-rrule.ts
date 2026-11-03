import { Temporal } from '@js-temporal/polyfill'
import { ScheduleCivilSchema } from '@omne-harness/schedule-contract'
import { EnumerationState } from './enumeration-state.ts'
import { civilFromDate, fakeUtc } from './civil.ts'
import { rruleBetween } from './rrule.ts'
import type { ParsedRrule } from './rrule.ts'

function hasNoPossibleMonthDay(parsed: ParsedRrule): boolean {
  const months =
    parsed.options.bymonth === undefined || parsed.options.bymonth === null
      ? []
      : [parsed.options.bymonth].flat()
  const days =
    parsed.options.bymonthday === undefined || parsed.options.bymonthday === null
      ? []
      : [parsed.options.bymonthday].flat()
  return (
    months.length > 0 &&
    days.length > 0 &&
    months.every(month =>
      days.every(
        day => Math.abs(day) > Temporal.PlainDate.from({ year: 2000, month, day: 1 }).daysInMonth,
      ),
    )
  )
}
export function enumerateRrule(parsed: ParsedRrule, state: EnumerationState): void {
  if (hasNoPossibleMonthDay(parsed)) {
    state.page.exhausted = true
    return
  }
  if (parsed.easter !== null) {
    enumerateEaster(parsed, parsed.easter, state)
    return
  }
  const from = fakeUtc(state.lower)
  if (state.input.after === state.lower && !state.input.inclusive)
    from.setTime(from.getTime() + 1000)
  rruleBetween(parsed.options, from, fakeUtc(state.through), date => {
    if (!state.charge()) return false
    const local = civilFromDate(date)
    state.page.scannedPeriods = date.getUTCFullYear() - Number(state.lower.slice(0, 4)) + 1
    state.observe(local)
    if (state.accepts(local)) state.emit({ kind: 'civil', local }, local)
    return !state.stopped
  })
  if (!state.stopped)
    state.page.scannedPeriods = Math.max(
      0,
      Number(state.through.slice(0, 4)) - Number(state.lower.slice(0, 4)) + 1,
    )
}
function enumerateEaster(parsed: ParsedRrule, offsets: number[], state: EnumerationState): void {
  const begin = fakeUtc(state.begin)
  const interval = parsed.options.interval ?? 1
  const startYear = begin.getUTCFullYear()
  const lowerYear = Number(state.lower.slice(0, 4))
  const firstYear =
    startYear + Math.max(0, Math.floor((lowerYear - startYear) / interval)) * interval
  const positions = parsed.options.bysetpos == null ? null : [parsed.options.bysetpos].flat()
  for (
    let year = firstYear;
    year <= Number(state.through.slice(0, 4)) && !state.stopped;
    year += interval
  ) {
    state.page.scannedPeriods++
    const yearStart = fakeUtc(`${String(year).padStart(4, '0')}-01-01T00:00:00`)
    const yearEnd = fakeUtc(`${String(year).padStart(4, '0')}-12-31T23:59:59`)
    const union = new Map<number, Date>()
    for (const offset of offsets) {
      rruleBetween(
        {
          ...parsed.options,
          byeaster: offset,
          bysetpos: null,
          interval: 1,
          dtstart: yearStart,
          byhour: parsed.options.byhour ?? begin.getUTCHours(),
          byminute: parsed.options.byminute ?? begin.getUTCMinutes(),
          bysecond: parsed.options.bysecond ?? begin.getUTCSeconds(),
        },
        yearStart,
        yearEnd,
        date => {
          if (!state.charge()) return false
          union.set(date.getTime(), date)
          return true
        },
      )
      if (state.page.limitReason !== null) return
    }
    const ordered = [...union.values()].sort((a, b) => a.getTime() - b.getTime())
    const selected =
      positions === null
        ? ordered
        : [
            ...new Set(
              positions.flatMap(position => {
                const date = ordered[position > 0 ? position - 1 : ordered.length + position]
                return date ? [date] : []
              }),
            ),
          ].sort((a, b) => a.getTime() - b.getTime())
    for (const date of selected) {
      const local = civilFromDate(date)
      if (state.accepts(local)) state.emit({ kind: 'civil', local }, local)
      if (state.stopped) {
        state.observe(local)
        return
      }
    }
    const cursor = ScheduleCivilSchema.parse(`${String(year).padStart(4, '0')}-12-31T23:59:59`)
    state.observe(cursor > state.through ? state.through : cursor)
    state.page.resumeAfter = state.page.observedThrough
  }
}
