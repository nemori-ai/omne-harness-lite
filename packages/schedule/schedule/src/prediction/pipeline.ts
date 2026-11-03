import { Temporal } from '@js-temporal/polyfill'
import { ScheduleCivilSchema, ScheduleInstantSchema } from '@omne-harness/schedule-contract'
import type {
  ScheduleAdoptedBasis,
  ScheduleCandidate,
  ScheduleCivil,
  ScheduleDateExplanation,
  ScheduleExcludedCandidate,
  ScheduleInstant,
  SchedulePreviewView,
  ScheduleRecurrence,
} from '@omne-harness/schedule-contract'
import { materializeScheduleCivil } from '../calculation/index.ts'
import type { SchedulePredictionInput } from './types.ts'
import { PredictionBudget, PredictionFailure, PredictionLimit } from './budget.ts'
import { dateAfter, FixedCalendar } from './calendar.ts'
import { expandSources } from './sources.ts'
import type { PredictionSource } from './sources.ts'

function civilAt(instant: ScheduleInstant, timezone: string): ScheduleCivil {
  return ScheduleCivilSchema.parse(
    Temporal.Instant.from(instant)
      .toZonedDateTimeISO(timezone)
      .toPlainDateTime()
      .toString({ smallestUnit: 'second' }),
  )
}
function materialize(civil: ScheduleCivil, basis: ScheduleAdoptedBasis) {
  const result = materializeScheduleCivil({ civil, timezone: basis.timezone })
  if (result.kind === 'invalid')
    throw new PredictionFailure('invalid_input', 'Civil time cannot be materialized')
  return result
}
const minimumInstant = ScheduleInstantSchema.parse('0000-01-01T00:00:00.000Z')
function conservativeInstant(date: string): ScheduleInstant {
  const value = Temporal.PlainDate.from(date)
    .toPlainDateTime()
    .toZonedDateTime('UTC')
    .toInstant()
    .subtract({ hours: 24 })
  if (Temporal.Instant.compare(value, minimumInstant) < 0) return minimumInstant
  return ScheduleInstantSchema.parse(value.toString({ smallestUnit: 'millisecond' }))
}
export class PredictionPipeline {
  private readonly pending = new Map<ScheduleInstant, ScheduleCandidate>()
  private readonly candidates: ScheduleCandidate[] = []
  private readonly excluded: ScheduleExcludedCandidate[] = []
  private rank = 0
  private futureRank: number
  private observedThrough: ScheduleInstant
  private readonly activationCivil: ScheduleCivil | null
  private readonly recurrence: ScheduleRecurrence
  private readonly begin: ScheduleCivil
  private readonly until: ScheduleCivil | null
  private readonly input: SchedulePredictionInput
  private readonly basis: ScheduleAdoptedBasis
  private readonly calendar: FixedCalendar | null
  private readonly budget: PredictionBudget
  constructor(
    input: SchedulePredictionInput,
    basis: ScheduleAdoptedBasis,
    calendar: FixedCalendar | null,
    budget: PredictionBudget,
  ) {
    this.input = input
    this.basis = basis
    this.calendar = calendar
    this.budget = budget
    this.observedThrough = input.after
    this.futureRank = input.eligibleConsumed
    this.activationCivil =
      input.activationExclusive === null ? null : civilAt(input.activationExclusive, basis.timezone)
    this.recurrence = input.definition.recurrence
    this.begin = this.recurrence.kind === 'once' ? this.recurrence.localAt : this.recurrence.begin
    this.until = this.recurrence.kind === 'once' ? this.recurrence.localAt : this.recurrence.until
  }
  private exclude(
    source: PredictionSource,
    adjustedLocal: ScheduleCivil | null,
    reason: ScheduleExcludedCandidate['reason'],
    explanation = source.explanation,
  ): void {
    this.budget.explain(1 + explanation.length)
    this.excluded.push({
      sourceKeys: [source.key],
      originalLocals: [source.local],
      adjustedLocal,
      reason,
      dateExplanation: explanation,
    })
  }
  private boundary(
    local: ScheduleCivil,
    adjusted: boolean,
  ): ScheduleExcludedCandidate['reason'] | null {
    if (local < this.begin) return 'beforeBegin'
    if (this.until !== null && local > this.until) return 'afterUntil'
    if (this.activationCivil !== null) {
      if (local <= this.activationCivil) return 'beforeActivation'
      const original = materialize(local, this.basis)
      if (
        original.kind === 'instant' &&
        this.input.activationExclusive !== null &&
        original.instant <= this.input.activationExclusive
      )
        return 'beforeActivation'
    }
    if (this.input.definition.limits.excludeDates.some(date => local.startsWith(date)))
      return adjusted ? 'excludedAdjustedDate' : 'excludedOriginalDate'
    return null
  }
  private async adjust(
    source: PredictionSource,
  ): Promise<{ local: ScheduleCivil; explanation: ScheduleDateExplanation[] } | null> {
    const overlay = this.input.definition.calendarOverlay
    if (overlay === null) return { local: source.local, explanation: source.explanation }
    if (this.calendar === null)
      throw new PredictionFailure('missing_environment', 'Calendar predicate needs a calendar')
    const day = await this.calendar.day(source.local.slice(0, 10))
    const matched =
      overlay.predicate === 'workingDay'
        ? day.working
        : overlay.predicate === 'holiday'
          ? day.holiday
          : !day.working
    let local = source.local
    let basis = day.basis
    if (!matched && overlay.adjust !== 'skip') {
      const shifted = await this.calendar.shift(
        day.date,
        overlay.adjust === 'previousWorkingDay' ? -1 : 1,
      )
      local = ScheduleCivilSchema.parse(`${shifted.date}${source.local.slice(10)}`)
      basis = shifted.basis
    }
    const explanation: ScheduleDateExplanation[] = [
      ...source.explanation,
      {
        kind: 'calendarCondition',
        originalLocal: source.local,
        resultLocal: !matched && overlay.adjust === 'skip' ? null : local,
        predicate: overlay.predicate,
        action: matched ? 'kept' : overlay.adjust === 'skip' ? 'skipped' : overlay.adjust,
        matched,
        basis,
      },
    ]
    if (!matched && overlay.adjust === 'skip') {
      this.exclude(source, null, 'calendarPredicate', explanation)
      return null
    }
    return { local, explanation }
  }
  private async process(source: PredictionSource): Promise<void> {
    this.budget.remaining()
    if (source.absent) {
      this.exclude(source, null, 'positionAbsent')
      return
    }
    const originalBoundary = this.boundary(source.local, false)
    if (originalBoundary !== null) {
      this.exclude(source, null, originalBoundary)
      return
    }
    const adjusted = await this.adjust(source)
    if (adjusted === null) return
    const adjustedBoundary = this.boundary(adjusted.local, true)
    if (adjustedBoundary !== null) {
      this.exclude(source, adjusted.local, adjustedBoundary, adjusted.explanation)
      return
    }
    const result = materialize(adjusted.local, this.basis)
    if (result.kind === 'gap') {
      this.exclude(source, adjusted.local, 'dstGap', adjusted.explanation)
      return
    }
    if (
      this.input.activationExclusive !== null &&
      result.instant <= this.input.activationExclusive
    ) {
      this.exclude(source, adjusted.local, 'beforeActivation', adjusted.explanation)
      return
    }
    this.budget.explain(1 + adjusted.explanation.length)
    const existing = this.pending.get(result.instant)
    if (existing !== undefined) {
      if (!existing.sourceKeys.includes(source.key)) {
        const pairs = [
          ...existing.sourceKeys.map((key, index) => ({
            key,
            local: existing.originalLocals[index],
          })),
          { key: source.key, local: source.local },
        ].sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0))
        existing.sourceKeys = pairs.map(pair => pair.key)
        existing.originalLocals = pairs.map(pair => {
          if (pair.local === undefined)
            throw new PredictionFailure('provider_failure', 'Source pairing failed')
          return pair.local
        })
        existing.dateExplanation.push(...adjusted.explanation)
      }
      return
    }
    this.pending.set(result.instant, {
      sourceKeys: [source.key],
      originalLocals: [source.local],
      adjustedLocal: adjusted.local,
      scheduledAt: result.instant,
      utcOffset: result.utcOffset,
      dstDisposition: result.dstDisposition,
      dateExplanation: adjusted.explanation,
      basis: this.basis,
      eligibleOrdinal: 1,
    })
  }
  private excludeCandidate(
    candidate: ScheduleCandidate,
    reason: ScheduleExcludedCandidate['reason'],
  ): void {
    this.excluded.push({
      sourceKeys: candidate.sourceKeys,
      originalLocals: candidate.originalLocals,
      adjustedLocal: candidate.adjustedLocal,
      reason,
      dateExplanation: candidate.dateExplanation,
    })
  }
  private seal(frontier: ScheduleInstant | null): boolean {
    const sorted = [...this.pending.values()]
      .filter(candidate => frontier === null || candidate.scheduledAt < frontier)
      .sort((left, right) => (left.scheduledAt < right.scheduledAt ? -1 : 1))
    for (const candidate of sorted) {
      this.pending.delete(candidate.scheduledAt)
      this.rank++
      const limit = this.input.definition.limits.eligibleLimit
      if (candidate.scheduledAt <= this.input.after) {
        this.excludeCandidate(candidate, 'beforeReference')
        if (limit !== null && this.rank >= limit) return true
        continue
      }
      this.futureRank = Math.max(this.rank, this.futureRank + 1)
      candidate.eligibleOrdinal = this.futureRank
      if (limit !== null && this.futureRank > limit) {
        this.excludeCandidate(candidate, 'eligibleLimit')
        return true
      }
      const jobLimit = this.input.definition.limits.jobLimit
      if (jobLimit !== null && this.input.acceptedJobCount >= jobLimit) {
        this.excludeCandidate(candidate, 'jobLimit')
        return true
      }
      this.candidates.push(candidate)
      this.observedThrough = candidate.scheduledAt
      if (
        this.candidates.length >= this.input.count ||
        (limit !== null && this.futureRank >= limit)
      )
        return true
    }
    if (frontier !== null && frontier > minimumInstant) {
      const closed = ScheduleInstantSchema.parse(
        Temporal.Instant.from(frontier)
          .subtract({ milliseconds: 1 })
          .toString({ smallestUnit: 'millisecond' }),
      )
      if (closed > this.observedThrough) this.observedThrough = closed
    }
    return false
  }
  private view(reason: SchedulePreviewView['reason']): SchedulePreviewView {
    const { eligibleLimit, jobLimit } = this.input.definition.limits
    return {
      candidates: this.candidates,
      excluded: this.excluded,
      basis: this.basis,
      complete: reason === null,
      reason,
      observedThrough: this.observedThrough,
      remainingEligible:
        eligibleLimit === null ? null : Math.max(0, eligibleLimit - this.input.eligibleConsumed),
      remainingJobs: jobLimit === null ? null : Math.max(0, jobLimit - this.input.acceptedJobCount),
    }
  }
  private async startingPoint(): Promise<ScheduleCivil> {
    let start = this.begin
    if (this.activationCivil !== null && this.activationCivil > start) start = this.activationCivil
    if (this.input.definition.limits.eligibleLimit !== null) return start
    let date = civilAt(this.input.after, this.basis.timezone).slice(0, 10)
    if (date <= start.slice(0, 10)) return start
    if (
      this.input.definition.calendarOverlay?.adjust === 'nextWorkingDay' &&
      this.calendar !== null
    ) {
      if (date <= this.calendar.version.coverageStart) return start
      date = await this.calendar.previousBound(date)
    }
    const safe = ScheduleCivilSchema.parse(`${date}T00:00:00`)
    return safe > start ? safe : start
  }
  async run(): Promise<SchedulePreviewView> {
    const remaining = this.view(null)
    if (remaining.remainingEligible === 0 || remaining.remainingJobs === 0) return remaining
    try {
      let after = await this.startingPoint()
      let inclusive = true
      const start = Temporal.PlainDateTime.from(after)
      const horizon = ScheduleCivilSchema.parse(
        start.year + this.budget.dependencies.limits.maxYears > 9999
          ? '9999-12-31T23:59:59'
          : start
              .add({ years: this.budget.dependencies.limits.maxYears })
              .subtract({ seconds: 1 })
              .toString({ smallestUnit: 'second' }),
      )
      const finite =
        this.recurrence.kind === 'once' ||
        (this.until !== null && this.until <= horizon) ||
        horizon === '9999-12-31T23:59:59'
      const recurrence =
        this.recurrence.kind === 'once'
          ? this.recurrence
          : {
              ...this.recurrence,
              until: this.until !== null && this.until < horizon ? this.until : horizon,
            }
      while (true) {
        const available = this.budget.availableCandidates()
        const result = await this.budget.read(() =>
          this.budget.dependencies.calculator.enumerate(
            {
              recurrence,
              after,
              inclusive,
              take: Math.min(64, available),
              budget: {
                maxCandidates: available,
                maxYears: this.budget.dependencies.limits.maxYears,
              },
            },
            { timeoutMs: this.budget.remaining() },
          ),
        )
        if (result.kind === 'unavailable') {
          if (result.reason === 'deadline') throw new PredictionLimit('deadline_exceeded')
          throw new PredictionFailure(
            result.reason === 'capacity' ? 'capacity_exceeded' : 'provider_failure',
            `Recurrence worker unavailable: ${result.reason}`,
            {},
            true,
          )
        }
        const page = result.value
        if (page.kind === 'invalid')
          throw new PredictionFailure(
            'unsupported_rule',
            'Recurrence calculation rejected the rule',
          )
        this.budget.chargeCandidates(page.scannedCandidates)
        for (const raw of page.candidates) {
          if (this.pending.size > 0) {
            const cursor =
              raw.kind === 'civil'
                ? raw.local
                : ScheduleCivilSchema.parse(`${raw.periodStart}T00:00:00`)
            if (this.seal(await this.frontier(cursor, false))) return this.view(null)
          }
          const sources = await expandSources(raw, this.recurrence, this.calendar, this.budget)
          for (const source of sources) await this.process(source)
        }
        if (page.exhausted) {
          if (finite) {
            this.seal(null)
            return this.view(null)
          }
          // The worker exhausted the bounded window, not the original rule.
          const frontier = await this.frontier(horizon, false)
          if (this.seal(frontier)) return this.view(null)
          return this.view('search_limit')
        }
        if (page.resumeAfter !== null) {
          const last = page.candidates.at(-1)
          const frontier = await this.frontier(
            page.resumeAfter,
            last?.kind === 'workingDayPosition',
          )
          if (this.seal(frontier)) return this.view(null)
        }
        if (page.limitReason !== null) return this.view('search_limit')
        if (page.resumeAfter === null || (page.resumeAfter <= after && !inclusive))
          throw new PredictionFailure('provider_failure', 'Recurrence worker made no progress')
        after = page.resumeAfter
        inclusive = false
      }
    } catch (error) {
      if (error instanceof PredictionLimit) return this.view(error.reason)
      throw error
    }
  }
  private async frontier(cursor: ScheduleCivil, wholePeriod: boolean): Promise<ScheduleInstant> {
    let date = cursor.slice(0, 10)
    if (wholePeriod) date = dateAfter(date)
    if (
      this.input.definition.calendarOverlay?.adjust === 'previousWorkingDay' &&
      this.calendar !== null
    )
      date = await this.calendar.previousBound(date)
    // All supported offsets are within 24 hours. This lower bound also covers folds and date-line changes.
    return conservativeInstant(date)
  }
}
