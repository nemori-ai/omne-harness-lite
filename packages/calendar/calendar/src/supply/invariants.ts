import { addDays, categoryAt, date, finding, inCoverage } from './common.ts'
import { usFederalObservances } from './us-rules.ts'
import type {
  CalendarSupplyCandidate,
  CalendarSupplyPolicy,
  SupplyDay,
  SupplyFinding,
  SupplyValidationInput,
} from './types.ts'

type Invariant = CalendarSupplyPolicy['validation']['invariants'][number]
type InvariantContext = {
  candidate: CalendarSupplyCandidate
  invariant: Invariant
  regular: readonly SupplyDay[]
  exceptions: ReadonlySet<string>
  years: readonly number[]
}
export function exceptionDates(candidate: CalendarSupplyCandidate): Set<string> {
  return new Set(
    candidate.contributions
      .filter(source => source.role === 'exceptionFeed')
      .flatMap(source => source.days.map(day => day.date)),
  )
}
function fullYears(candidate: CalendarSupplyCandidate): number[] {
  const years = new Set<number>()
  for (const interval of candidate.coverageIntervals)
    for (let year = date(interval.start).year; year <= date(interval.end).year; year++) {
      if (
        inCoverage(`${year}-01-01`, candidate.coverageIntervals) &&
        inCoverage(`${year}-12-31`, candidate.coverageIntervals)
      )
        years.add(year)
    }
  return [...years]
}
function checked(
  context: InvariantContext,
  badDates: readonly string[],
  detail: string,
): SupplyFinding[] {
  return [
    finding(
      context.invariant.invariantId,
      badDates.length ? 'failed' : 'passed',
      detail,
      badDates,
      context.candidate.contributions.map(source => source.material.reference),
      context.invariant.severity,
    ),
  ]
}
function countBand(
  context: InvariantContext,
  category: 'holiday' | 'workingDay',
  min = 0,
  max = Infinity,
  effectiveFrom = 1,
): SupplyFinding[] {
  const applicableYears = context.years.filter(year => year >= effectiveFrom)
  const bad = applicableYears.filter(year => {
    const count = context.regular.filter(
      day => day.date.startsWith(`${year}-`) && day.category === category,
    ).length
    return count < min || count > max
  })
  return checked(
    context,
    bad.map(year => `${year}-01-01`),
    `Annual ${category} count in [${min},${max}]; fully covered applicable years: ${applicableYears.join(',') || 'none'}`,
  )
}
function sourceEvidence(context: InvariantContext): SupplyFinding[] {
  const evidence = context.candidate.contributions
    .filter(source => source.role === 'truth')
    .map(source => source.checks.find(check => check.code === context.invariant.invariantId))
  const status = evidence.some(check => check?.status === 'failed')
    ? 'failed'
    : evidence.length && evidence.every(check => check?.status === 'passed')
      ? 'passed'
      : 'unknown'
  return [
    finding(
      context.invariant.invariantId,
      status,
      evidence.map(check => check?.detail ?? 'No executed source check exists').join('; '),
      [],
      context.candidate.contributions.map(source => source.material.reference),
      context.invariant.severity,
    ),
  ]
}
function disjointDays(context: InvariantContext): SupplyFinding[] {
  const raw = context.candidate.contributions
    .filter(source => source.role === 'truth')
    .flatMap(source => source.days)
  const workdays = new Set(raw.filter(day => day.category === 'workingDay').map(day => day.date))
  return checked(
    context,
    raw.filter(day => day.category === 'holiday' && workdays.has(day.date)).map(day => day.date),
    'Holiday and compensatory sets must not intersect',
  )
}
function longestBlock(context: InvariantContext): SupplyFinding[] {
  let length = 0
  let previous: string | undefined
  const bad: string[] = []
  for (const day of context.regular
    .filter(day => day.category === 'holiday')
    .sort((a, b) => a.date.localeCompare(b.date))) {
    length = previous && addDays(previous, 1) === day.date ? length + 1 : 1
    previous = day.date
    if (length > (context.invariant.params.max ?? Infinity)) bad.push(day.date)
  }
  return checked(context, bad, 'Consecutive holiday overrides must stay within the policy band')
}
function statutoryDays(context: InvariantContext): SupplyFinding[] {
  const missing = context.candidate.coverageIntervals
    .flatMap(interval => usFederalObservances(interval.start, interval.end))
    .filter(entry => categoryAt(context.candidate, entry.date) !== 'holiday')
    .map(entry => entry.date)
  return checked(
    context,
    missing,
    'Every historically active statutory identity must be present at its observed date, including spillover',
  )
}
function exceptionBand(context: InvariantContext): SupplyFinding[] {
  const bad = context.years.filter(year => {
    const count = [...context.exceptions].filter(
      day =>
        day.startsWith(`${year}-`) &&
        context.candidate.days.find(entry => entry.date === day)?.category === 'holiday',
    ).length
    return (
      count < (context.invariant.params.min ?? 0) ||
      count > (context.invariant.params.max ?? Infinity)
    )
  })
  return checked(
    context,
    bad.map(year => `${year}-01-01`),
    'Exception closure count is separate from statutory holidays',
  )
}
const evaluators: Readonly<Record<string, (context: InvariantContext) => SupplyFinding[]>> = {
  'cn.compensatory_workday_on_weekend': context =>
    checked(
      context,
      context.regular
        .filter(day => day.category === 'workingDay' && date(day.date).dayOfWeek < 6)
        .map(day => day.date),
      'Compensatory workdays fall on Saturday/Sunday',
    ),
  'cn.holiday_and_compensatory_disjoint': disjointDays,
  'cn.entry_self_consistency': sourceEvidence,
  'cn.in_lieu_subset_of_holidays': sourceEvidence,
  'cn.compensatory_in_lieu_near_zero_sum': sourceEvidence,
  'cn.annual_holiday_days_floor': context =>
    countBand(context, 'holiday', context.invariant.params.min),
  'cn.annual_holiday_days_band': context =>
    countBand(context, 'holiday', context.invariant.params.min, context.invariant.params.max),
  'cn.annual_compensatory_days_band': context =>
    countBand(context, 'workingDay', context.invariant.params.min, context.invariant.params.max),
  'cn.longest_holiday_block': longestBlock,
  'jp.annual_holiday_count_floor': context =>
    countBand(
      context,
      'holiday',
      context.invariant.params.min,
      Infinity,
      context.invariant.params.effectiveFromYear,
    ),
  'jp.no_working_day_overrides': context =>
    checked(
      context,
      context.candidate.days.filter(day => day.category === 'workingDay').map(day => day.date),
      'JP has no working-day overrides',
    ),
  'jp.oracle_daily_diff_zero_baseline': () => [],
  'us.statutory_holidays_present': statutoryDays,
  'us.annual_observed_count_band': context =>
    countBand(context, 'holiday', context.invariant.params.min, context.invariant.params.max, 2021),
  'us.annual_exception_days_band': exceptionBand,
}
export function invariantFindings(input: SupplyValidationInput): SupplyFinding[] {
  const exceptions = exceptionDates(input.candidate)
  const regular = input.candidate.days.filter(day => !exceptions.has(day.date))
  const years = fullYears(input.candidate)
  return input.policy.validation.invariants.flatMap(invariant => {
    const evaluate = evaluators[invariant.invariantId]
    if (!evaluate)
      return [
        finding(
          invariant.invariantId,
          'unknown',
          'No implementation for declared invariant',
          [],
          [],
          invariant.severity,
        ),
      ]
    return evaluate({ candidate: input.candidate, invariant, regular, exceptions, years })
  })
}
