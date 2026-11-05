import { Temporal } from '@js-temporal/polyfill'
import {
  calendarGetResultSchema,
  calendarResolveResultSchema,
  calendarIdSchema,
  calendarVersionIdSchema,
  localDateSchema,
} from '@omne-harness/calendar-contract'
import type {
  CalendarQueries,
  CalendarResolve,
  CalendarResolution,
  CalendarVersionInfo,
  CalculationBasis,
} from '@omne-harness/calendar-contract'
import type {
  ScheduleCalendarSelection,
  ScheduleCallContext,
} from '@omne-harness/schedule-contract'
import { PredictionBudget, PredictionFailure } from './budget.ts'

function coherent(condition: boolean): void {
  if (!condition)
    throw new PredictionFailure('provider_failure', 'Calendar returned an inconsistent resolution')
}
function basisIdentity(basis: CalculationBasis) {
  return JSON.stringify([
    basis.calendarId,
    basis.versionId,
    basis.publicationGeneration,
    basis.coverage,
    basis.knowledgeAsOf,
    basis.contentHash,
    basis.provenanceRefs,
  ])
}
export class FixedCalendar {
  private fixedBasis: CalculationBasis | null = null
  readonly version: CalendarVersionInfo
  private readonly calendarId: CalendarResolve['selection'] & { kind: 'explicit' }
  private readonly queries: CalendarQueries
  private readonly context: ScheduleCallContext
  private readonly budget: PredictionBudget
  private constructor(
    version: CalendarVersionInfo,
    calendarId: CalendarResolve['selection'] & { kind: 'explicit' },
    queries: CalendarQueries,
    context: ScheduleCallContext,
    budget: PredictionBudget,
  ) {
    this.version = version
    this.calendarId = calendarId
    this.queries = queries
    this.context = context
    this.budget = budget
  }
  static async capture(
    selection: ScheduleCalendarSelection,
    timezone: string,
    queries: CalendarQueries,
    context: ScheduleCallContext,
    budget: PredictionBudget,
  ): Promise<FixedCalendar> {
    let cursor: string | null = null
    let versionId = selection.version.kind === 'pinned' ? selection.version.versionId : null
    const seen = new Set<string>()
    const calendarId = calendarIdSchema.parse(selection.calendarId)
    do {
      budget.calendar()
      const parsed = calendarGetResultSchema.safeParse(
        await budget.read(() =>
          queries.get(context, { calendarId, versionsAfter: cursor, versionsLimit: 100 }),
        ),
      )
      if (!parsed.success)
        throw new PredictionFailure('provider_failure', 'Malformed Calendar directory')
      const result = parsed.data
      if (result.kind === 'error')
        throw new PredictionFailure(
          result.error.code,
          result.error.message,
          result.error.details,
          result.error.retryable,
        )
      coherent(result.value.calendarId === calendarId)
      const canonicalZone = (zone: string) =>
        new Intl.DateTimeFormat('en', { timeZone: zone }).resolvedOptions().timeZone
      if (canonicalZone(result.value.timezone) !== canonicalZone(timezone))
        throw new PredictionFailure(
          'environment_incoherent',
          'Calendar and recurrence timezones differ',
        )
      if (versionId === null) versionId = result.value.publishedVersionId
      if (versionId === null)
        throw new PredictionFailure('unknown_calendar_version', 'Calendar has no published version')
      const version = result.value.versions.items.find(item => item.versionId === versionId)
      if (version) {
        coherent(version.coverageStart <= version.coverageEnd)
        const fixed = new FixedCalendar(
          version,
          { kind: 'explicit', calendarId },
          queries,
          context,
          budget,
        )
        await fixed.query({ kind: 'day', date: version.coverageStart })
        return fixed
      }
      cursor = result.value.versions.nextCursor
      if (cursor !== null) {
        coherent(!seen.has(cursor))
        seen.add(cursor)
      }
    } while (cursor !== null)
    throw new PredictionFailure(
      'unknown_calendar_version',
      'The selected calendar version is absent',
    )
  }
  get basis(): CalculationBasis {
    if (this.fixedBasis === null)
      throw new PredictionFailure('provider_failure', 'Calendar basis is missing')
    return this.fixedBasis
  }
  async query(query: CalendarResolve['query']): Promise<CalendarResolution['result']> {
    this.budget.calendar()
    const parsed = calendarResolveResultSchema.safeParse(
      await this.budget.read(() =>
        this.queries.resolve(this.context, {
          selection: this.calendarId,
          version: {
            kind: 'pinned',
            versionId: calendarVersionIdSchema.parse(this.version.versionId),
          },
          query,
        }),
      ),
    )
    if (!parsed.success)
      throw new PredictionFailure('provider_failure', 'Malformed Calendar resolution')
    const response = parsed.data
    if (response.kind === 'error')
      throw new PredictionFailure(
        response.error.code,
        response.error.message,
        response.error.details,
        response.error.retryable,
      )
    const { result } = response.value
    const basis = result.value.basis
    coherent(
      response.value.calendarId === this.calendarId.calendarId &&
        response.value.versionId === this.version.versionId &&
        response.value.coverageStart === this.version.coverageStart &&
        response.value.coverageEnd === this.version.coverageEnd &&
        result.kind === query.kind,
    )
    coherent(
      basis.calendarId === this.calendarId.calendarId &&
        basis.versionId === this.version.versionId &&
        basis.coverage.from === this.version.coverageStart &&
        basis.coverage.to === this.version.coverageEnd &&
        basis.contentHash === this.version.contentHash &&
        basis.knowledgeAsOf === this.version.knowledgeAsOf &&
        JSON.stringify(basis.provenanceRefs) === JSON.stringify(this.version.provenanceRefs),
    )
    if (this.fixedBasis !== null) coherent(basisIdentity(basis) === basisIdentity(this.fixedBasis))
    const range = basis.inspectedRange
    if (query.kind === 'day' && result.kind === 'day')
      coherent(
        result.value.date === query.date &&
          range.from <= query.date &&
          range.to >= query.date &&
          result.value.working === (result.value.classification === 'workingDay') &&
          result.value.holiday === (result.value.classification === 'holiday'),
      )
    if (query.kind === 'shift' && result.kind === 'shift') {
      const firstInspected = Temporal.PlainDate.from(query.date)
        .add({ days: Math.sign(query.offset) })
        .toString()
      coherent(
        range.from <= firstInspected &&
          range.to >= firstInspected &&
          range.from <= result.value.date &&
          range.to >= result.value.date &&
          (query.offset < 0
            ? result.value.date < query.date
            : query.offset > 0
              ? result.value.date > query.date
              : result.value.date === query.date),
      )
    }
    if (query.kind === 'nth' && result.kind === 'nth')
      coherent(
        range.from <= query.periodStart &&
          range.to >=
            (query.ordinal === 'last' || result.value.date === null
              ? query.periodEnd
              : result.value.date) &&
          (result.value.date === null ||
            (result.value.date >= query.periodStart && result.value.date <= query.periodEnd)),
      )
    this.fixedBasis ??= basis
    return result
  }
  async day(date: string) {
    const result = await this.query({ kind: 'day', date: localDateSchema.parse(date) })
    if (result.kind !== 'day')
      throw new PredictionFailure('provider_failure', 'Calendar day kind mismatch')
    return result.value
  }
  async shift(date: string, offset: -1 | 1) {
    const result = await this.query({ kind: 'shift', date: localDateSchema.parse(date), offset })
    if (result.kind !== 'shift')
      throw new PredictionFailure('provider_failure', 'Calendar shift kind mismatch')
    return result.value
  }
  async position(periodStart: string, periodEnd: string, ordinal: number | 'last') {
    const result = await this.query({
      kind: 'nth',
      periodStart: localDateSchema.parse(periodStart),
      periodEnd: localDateSchema.parse(periodEnd),
      ordinal,
    })
    if (result.kind !== 'nth')
      throw new PredictionFailure('provider_failure', 'Calendar position kind mismatch')
    return result.value
  }
  async previousBound(date: string): Promise<string> {
    // At the coverage start no earlier valid adjusted date is supported.
    if (date <= this.version.coverageStart) return this.version.coverageStart
    return (await this.shift(date, -1)).date
  }
}
export function dateAfter(date: string): string {
  return Temporal.PlainDate.from(date).add({ days: 1 }).toString()
}
