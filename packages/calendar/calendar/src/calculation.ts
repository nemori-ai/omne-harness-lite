import { Temporal } from '@js-temporal/polyfill'
import {
  calculationBasisSchema,
  localDateSchema,
  type CalendarSnapshot,
  type LocalDate,
  type CalculationBasis,
  type CalculationFailure,
  type ClassifyDayInput,
  type ClassifyDayResult,
  type CountWorkingDaysInput,
  type CountWorkingDaysResult,
  type ShiftWorkingDaysInput,
  type ShiftWorkingDaysResult,
  type ListWorkingDaysInput,
  type ListWorkingDaysResult,
  type SelectNthWorkingDayInput,
  type SelectNthWorkingDayResult,
} from '@omne-harness/calendar-contract'

/** A civil-day computation budget, independent of business scheduling limits. */
export const DEFAULT_SCAN_BUDGET = 36600

function invalid(message: string): CalculationFailure {
  return { kind: 'invalid', message }
}
function budgetFor(input: { readonly scanBudget?: number }): number | CalculationFailure {
  const budget = input.scanBudget ?? DEFAULT_SCAN_BUDGET
  return Number.isSafeInteger(budget) && budget > 0
    ? budget
    : invalid('scanBudget must be a positive safe integer')
}
function dateFor(value: string): LocalDate | CalculationFailure {
  const result = localDateSchema.safeParse(value)
  return result.success ? result.data : invalid('Expected a valid four digit ISO calendar date')
}
function coverageFailure(snapshot: CalendarSnapshot, date: LocalDate): CalculationFailure | null {
  return date < snapshot.coverageStart || date > snapshot.coverageEnd
    ? {
        kind: 'coverageInsufficient',
        date,
        coverage: { from: snapshot.coverageStart, to: snapshot.coverageEnd },
      }
    : null
}
function basisFor(snapshot: CalendarSnapshot, from: LocalDate, to: LocalDate): CalculationBasis {
  return calculationBasisSchema.parse({
    calendarId: snapshot.calendarId,
    versionId: snapshot.versionId,
    publicationGeneration: snapshot.publicationGeneration,
    coverage: { from: snapshot.coverageStart, to: snapshot.coverageEnd },
    inspectedRange: { from, to },
    knowledgeAsOf: snapshot.knowledgeAsOf,
    contentHash: snapshot.contentHash,
    provenanceRefs: snapshot.provenanceRefs,
  })
}
function dayReader(snapshot: CalendarSnapshot) {
  const overrides = new Map(snapshot.overrides.map(override => [override.date, override]))
  return (date: LocalDate) => {
    const override = overrides.get(date)
    const weekday = Temporal.PlainDate.from(date).dayOfWeek
    const classification = override?.classification ?? snapshot.weeklyDefault[weekday - 1]
    if (classification === undefined) throw new RangeError('Invalid weekday in validated snapshot')
    return {
      classification,
      working: classification === 'workingDay',
      holiday: classification === 'holiday',
      override: override !== undefined,
      provenanceRefs: override?.provenanceRefs ?? snapshot.provenanceRefs,
    }
  }
}
function move(
  snapshot: CalendarSnapshot,
  date: LocalDate,
  direction: number,
): LocalDate | CalculationFailure {
  const next = Temporal.PlainDate.from(date).add({ days: direction })
  if (next.year < 0 || next.year > 9999) {
    return {
      kind: 'coverageInsufficient',
      date: null,
      boundary: next.year < 0 ? 'beforeMinimum' : 'afterMaximum',
      coverage: { from: snapshot.coverageStart, to: snapshot.coverageEnd },
    }
  }
  return dateFor(next.toString())
}

type ScanInput = {
  readonly snapshot: CalendarSnapshot
  readonly from: LocalDate
  readonly to?: LocalDate
  readonly direction: 1 | -1
  readonly budget: number
  readonly wanted?: number
}
type ScanSuccess = { kind: 'ok'; dates: readonly LocalDate[]; basis: CalculationBasis }
function scan(input: ScanInput): ScanSuccess | CalculationFailure {
  const read = dayReader(input.snapshot)
  const dates: LocalDate[] = []
  let current = input.from
  let inspectedDays = 0
  while (true) {
    const missing = coverageFailure(input.snapshot, current)
    if (missing) return missing
    inspectedDays += 1
    if (read(current).working) dates.push(current)
    if (dates.length === input.wanted || current === input.to) {
      const from = input.direction === 1 ? input.from : current
      const to = input.direction === 1 ? current : input.from
      return { kind: 'ok', dates, basis: basisFor(input.snapshot, from, to) }
    }
    if (inspectedDays >= input.budget)
      return { kind: 'searchLimit', scanBudget: input.budget, inspectedDays }
    const next = move(input.snapshot, current, input.direction)
    if (typeof next !== 'string') return next
    current = next
  }
}
function rangeFor(
  fromValue: string,
  toValue: string,
): { from: LocalDate; to: LocalDate } | CalculationFailure {
  const from = dateFor(fromValue)
  if (typeof from !== 'string') return from
  const to = dateFor(toValue)
  if (typeof to !== 'string') return to
  return from <= to ? { from, to } : invalid('Range endpoints must be ordered')
}

export function classifyDay(input: ClassifyDayInput): ClassifyDayResult {
  const date = dateFor(input.date)
  if (typeof date !== 'string') return date
  const budget = budgetFor(input)
  if (typeof budget !== 'number') return budget
  const missing = coverageFailure(input.snapshot, date)
  if (missing) return missing
  return {
    kind: 'ok',
    date,
    ...dayReader(input.snapshot)(date),
    basis: basisFor(input.snapshot, date, date),
  }
}
export function countWorkingDays(input: CountWorkingDaysInput): CountWorkingDaysResult {
  const range = rangeFor(input.from, input.to)
  if ('kind' in range) return range
  const budget = budgetFor(input)
  if (typeof budget !== 'number') return budget
  const result = scan({ snapshot: input.snapshot, ...range, direction: 1, budget })
  return result.kind === 'ok'
    ? { kind: 'ok', ...range, count: result.dates.length, basis: result.basis }
    : result
}
export function shiftWorkingDays(input: ShiftWorkingDaysInput): ShiftWorkingDaysResult {
  const date = dateFor(input.date)
  if (typeof date !== 'string') return date
  if (!Number.isSafeInteger(input.offset)) return invalid('offset must be a safe integer')
  const budget = budgetFor(input)
  if (typeof budget !== 'number') return budget
  const missing = coverageFailure(input.snapshot, date)
  if (missing) return missing
  if (input.offset === 0) return { kind: 'ok', date, basis: basisFor(input.snapshot, date, date) }
  const direction = input.offset > 0 ? 1 : -1
  const from = move(input.snapshot, date, direction)
  if (typeof from !== 'string') return from
  const result = scan({
    snapshot: input.snapshot,
    from,
    direction,
    budget,
    wanted: Math.abs(input.offset),
  })
  if (result.kind !== 'ok') return result
  return {
    kind: 'ok',
    date: result.basis.inspectedRange[direction === 1 ? 'to' : 'from'],
    basis: result.basis,
  }
}
export function listWorkingDays(input: ListWorkingDaysInput): ListWorkingDaysResult {
  const after = dateFor(input.after)
  if (typeof after !== 'string') return after
  if (!Number.isSafeInteger(input.count) || input.count < 1 || input.count > 366)
    return invalid('count must be an integer in 1..366')
  const budget = budgetFor(input)
  if (typeof budget !== 'number') return budget
  const missing = coverageFailure(input.snapshot, after)
  if (missing) return missing
  const from = move(input.snapshot, after, 1)
  if (typeof from !== 'string') return from
  const result = scan({ snapshot: input.snapshot, from, direction: 1, budget, wanted: input.count })
  return result.kind === 'ok'
    ? { kind: 'ok', after, dates: result.dates, basis: result.basis }
    : result
}
export function selectNthWorkingDay(input: SelectNthWorkingDayInput): SelectNthWorkingDayResult {
  const range = rangeFor(input.periodStart, input.periodEnd)
  if ('kind' in range) return range
  if (input.ordinal !== 'last' && (!Number.isSafeInteger(input.ordinal) || input.ordinal < 1))
    return invalid('ordinal must be a positive safe integer or last')
  const budget = budgetFor(input)
  if (typeof budget !== 'number') return budget
  const wanted = input.ordinal === 'last' ? undefined : input.ordinal
  const result = scan({
    snapshot: input.snapshot,
    ...range,
    direction: 1,
    budget,
    ...(wanted === undefined ? {} : { wanted }),
  })
  if (result.kind !== 'ok') return result
  const date =
    (input.ordinal === 'last' ? result.dates.at(-1) : result.dates[input.ordinal - 1]) ?? null
  return { kind: 'ok', date, basis: result.basis }
}
