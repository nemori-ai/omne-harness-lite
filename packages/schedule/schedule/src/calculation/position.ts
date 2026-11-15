import { Temporal } from '@js-temporal/polyfill'
import { ScheduleCivilSchema, ScheduleLocalDateSchema } from '@omne-harness/schedule-contract'
import type { ScheduleRecurrence } from '@omne-harness/schedule-contract'
import { EnumerationState } from './enumeration-state.ts'

type Position = Extract<ScheduleRecurrence, { kind: 'position' }>
export function enumeratePosition(recurrence: Position, state: EnumerationState): void {
  const begin = Temporal.PlainDateTime.from(recurrence.begin).toPlainDate()
  const width = recurrence.period === 'month' ? 1 : recurrence.period === 'quarter' ? 3 : 12
  const month =
    recurrence.period === 'year'
      ? 1
      : recurrence.period === 'quarter'
        ? 1 + 3 * Math.floor((begin.month - 1) / 3)
        : begin.month
  const anchor = begin.with({ month, day: 1 })
  const lower = Temporal.PlainDateTime.from(state.lower).toPlainDate()
  const distance = (lower.year - anchor.year) * 12 + lower.month - anchor.month
  const stride = width * recurrence.interval
  let period = anchor.add({ months: Math.max(0, Math.floor(distance / stride)) * stride })
  while (period.year <= 9999 && `${period}T00:00:00` <= state.through && !state.stopped) {
    const end = period.add({ months: width }).subtract({ days: 1 })
    state.page.scannedPeriods++
    if (recurrence.selector.kind === 'workingDay') {
      const cursor = ScheduleCivilSchema.parse(`${end}T23:59:59`)
      if (state.input.after === null || cursor > state.input.after) {
        if (!state.charge()) break
        state.emit(
          {
            kind: 'workingDayPosition',
            periodStart: ScheduleLocalDateSchema.parse(period.toString()),
            periodEnd: ScheduleLocalDateSchema.parse(end.toString()),
            ordinal: recurrence.ordinal,
            times: [...recurrence.times],
          },
          cursor,
        )
        state.observe(cursor)
      }
    } else {
      const weekday = recurrence.selector.weekday
      if (
        recurrence.ordinal !== 'last' &&
        recurrence.ordinal > Math.ceil(period.until(end).days / 7) + 1
      ) {
        if (period.year + Math.floor((period.month - 1 + stride) / 12) > 9999) break
        period = period.add({ months: stride })
        continue
      }
      const selected =
        recurrence.ordinal === 'last'
          ? end.subtract({ days: (end.dayOfWeek - weekday + 7) % 7 })
          : period.add({
              days: ((weekday - period.dayOfWeek + 7) % 7) + 7 * (recurrence.ordinal - 1),
            })
      if (Temporal.PlainDate.compare(selected, end) <= 0) {
        for (const time of recurrence.times) {
          const local = ScheduleCivilSchema.parse(`${selected}T${time}`)
          if (!state.accepts(local)) continue
          if (!state.charge()) break
          state.emit({ kind: 'civil', local }, local)
          state.observe(local)
          if (state.stopped) break
        }
      }
    }
    if (period.year + Math.floor((period.month - 1 + stride) / 12) > 9999) break
    period = period.add({ months: stride })
  }
}
