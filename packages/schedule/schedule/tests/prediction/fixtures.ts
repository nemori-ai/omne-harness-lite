import { Temporal } from '@js-temporal/polyfill'
import {
  calendarGetResultSchema,
  calendarResolveResultSchema,
} from '@omne-harness/calendar-contract'
import type { CalendarQueries, CalendarResolve } from '@omne-harness/calendar-contract'
import {
  createSchedulePredictionService,
  enumerateScheduleRecurrence,
} from '@omne-harness/schedule'
import type {
  SchedulePredictionDependencies,
  SchedulePredictionInput,
} from '@omne-harness/schedule'
import {
  ScheduleCallContextSchema,
  ScheduleDefinitionSchema,
  ScheduleInstantSchema,
  SchedulePreviewViewSchema,
} from '@omne-harness/schedule-contract'
import type {
  ScheduleDefinition,
  ScheduleQueryResult,
  SchedulePreviewView,
} from '@omne-harness/schedule-contract'

export const context = ScheduleCallContextSchema.parse({
  principalRef: 'alice',
  owner: { kind: 'tenant', tenantId: 't1', ownerId: 'alice' },
  actor: { kind: 'human', actorRef: 'alice' },
  authContextRef: 'auth:1',
  requestId: 'r1',
  originatingSessionRef: null,
})
export const instant = (value: string) => ScheduleInstantSchema.parse(value)
export function definition(
  recurrence: unknown = { kind: 'once', localAt: '2026-11-05T09:00:00' },
  patch: Partial<ScheduleDefinition> = {},
): ScheduleDefinition {
  return ScheduleDefinitionSchema.parse({
    label: 'Tea',
    recurrence,
    binding: { kind: 'explicit', timezone: 'UTC', calendar: null },
    calendarOverlay: null,
    limits: { eligibleLimit: null, jobLimit: null, excludeDates: [] },
    purpose: {
      kind: 'reminder',
      content: { title: null, body: 'Tea' },
      admissionPolicy: 'reminder-window-v1',
      overlap: 'parallel',
    },
    ...patch,
  })
}
export function input(
  value: ScheduleDefinition,
  patch: Partial<SchedulePredictionInput> = {},
): SchedulePredictionInput {
  return {
    definition: value,
    definitionRevision: 0,
    activationExclusive: null,
    eligibleConsumed: 0,
    acceptedJobCount: 0,
    after: instant('2026-01-01T00:00:00.000Z'),
    count: 10,
    ...patch,
  }
}
export function value(result: ScheduleQueryResult<SchedulePreviewView>): SchedulePreviewView {
  if (result.kind !== 'ok') throw new Error(JSON.stringify(result.error))
  return SchedulePreviewViewSchema.parse(result.value)
}
export const unused = async (): Promise<never> => {
  throw new Error('Unexpected external call')
}
export function harness(patch: Partial<SchedulePredictionDependencies> = {}) {
  const enumerations: Parameters<SchedulePredictionDependencies['calculator']['enumerate']>[] = []
  const dependencies: SchedulePredictionDependencies = {
    calculator: {
      async enumerate(request, options) {
        enumerations.push([request, options])
        return { kind: 'completed', value: enumerateScheduleRecurrence(request) }
      },
    },
    calendar: { list: unused, get: unused, effective: unused, resolve: unused },
    environment: { observe: unused },
    basisGuards: { prepare: unused },
    monotonicClock: { now: () => 0 },
    versions: { tzdbVersion: 'test-tzdb', ruleEngineVersion: 'test-engine' },
    limits: {
      maxCandidates: 10000,
      maxYears: 10,
      maxExplanations: 10000,
      maxCalendarCalls: 10000,
      timeoutMs: 10000,
    },
    ...patch,
  }
  return { service: createSchedulePredictionService(dependencies), dependencies, enumerations }
}
export function daily(begin: string, until: string | null, time = '9') {
  return { kind: 'cron', expression: `0 ${time} * * *`, begin, until }
}
export const selected = {
  kind: 'explicit',
  timezone: 'UTC',
  calendar: { calendarId: 'cn', version: { kind: 'latest' } },
} as const
export function calendarFixture(
  options: {
    timezone?: string
    overrides?: Record<string, 'workingDay' | 'holiday' | 'nonWorkingDay'>
    version?: string
    firstPage?: boolean
    generation?: number
    coverageStart?: string
    coverageEnd?: string
  } = {},
) {
  const requests: CalendarResolve[] = []
  const gets: Parameters<CalendarQueries['get']>[1][] = []
  const calendarId = 'cn'
  const versionId = options.version ?? 'v1'
  const start = options.coverageStart ?? '2025-01-01'
  const end = options.coverageEnd ?? '2028-12-31'
  const knowledgeAsOf = '2025-01-01T00:00:00.000Z'
  const metadata = {
    calendarId,
    versionId,
    publicationGeneration: options.generation ?? 3,
    coverage: { from: start, to: end },
    knowledgeAsOf,
    contentHash: 'a'.repeat(64),
    provenanceRefs: ['official:test'],
  }
  function classification(date: string) {
    return (
      options.overrides?.[date] ??
      (Temporal.PlainDate.from(date).dayOfWeek <= 5 ? 'workingDay' : 'nonWorkingDay')
    )
  }
  const queries: CalendarQueries = {
    list: unused,
    effective: unused,
    async get(_context, request) {
      gets.push(request)
      return calendarGetResultSchema.parse({
        kind: 'ok',
        value: {
          calendarId,
          timezone: options.timezone ?? 'UTC',
          semanticBoundary: 'test calendar facts',
          publishedVersionId: options.firstPage && gets.length > 1 ? 'v2' : versionId,
          publicationGeneration: 99,
          versions: {
            items:
              options.firstPage && !request.versionsAfter
                ? []
                : [
                    {
                      versionId,
                      coverageStart: start,
                      coverageEnd: end,
                      knowledgeAsOf,
                      synthesizedAt: knowledgeAsOf,
                      contentHash: metadata.contentHash,
                      provenanceRefs: metadata.provenanceRefs,
                      isPublished: true,
                    },
                  ],
            nextCursor: options.firstPage && !request.versionsAfter ? 'older' : null,
          },
          supplyStanding: null,
          observedAt: knowledgeAsOf,
        },
      })
    },
    async resolve(_context, request) {
      requests.push(request)
      const query = request.query
      let from = query.kind === 'nth' ? query.periodStart : 'date' in query ? query.date : start
      let to = query.kind === 'nth' ? query.periodEnd : from
      let result
      if (query.kind === 'day') {
        const kind = classification(query.date)
        result = {
          kind: 'day',
          value: {
            kind: 'ok',
            date: query.date,
            classification: kind,
            working: kind === 'workingDay',
            holiday: kind === 'holiday',
            override: query.date in (options.overrides ?? {}),
            provenanceRefs: ['official:test'],
          },
        }
      } else if (query.kind === 'shift') {
        let date = Temporal.PlainDate.from(query.date)
        let remaining = Math.abs(query.offset)
        while (remaining > 0) {
          date = date.add({ days: Math.sign(query.offset) })
          if (date.toString() < start || date.toString() > end) break
          if (classification(date.toString()) === 'workingDay') remaining--
        }
        from = date.toString() < from ? date.toString() : from
        to = date.toString() > to ? date.toString() : to
        result = { kind: 'shift', value: { kind: 'ok', date: date.toString() } }
      } else if (query.kind === 'nth') {
        const dates: string[] = []
        for (
          let date = Temporal.PlainDate.from(query.periodStart);
          date.toString() <= query.periodEnd;
          date = date.add({ days: 1 })
        )
          if (classification(date.toString()) === 'workingDay') dates.push(date.toString())
        result = {
          kind: 'nth',
          value: {
            kind: 'ok',
            date:
              query.ordinal === 'last'
                ? (dates.at(-1) ?? null)
                : (dates[query.ordinal - 1] ?? null),
          },
        }
      } else throw new Error('Fixture supports day/shift/nth only')
      if (from < start || to > end)
        return calendarResolveResultSchema.parse({
          kind: 'error',
          error: {
            code: 'coverage_insufficient',
            message: 'Outside fixture coverage',
            retryable: false,
            requestId: context.requestId,
            details: {},
          },
        })
      return calendarResolveResultSchema.parse({
        kind: 'ok',
        value: {
          calendarId,
          versionId,
          coverageStart: start,
          coverageEnd: end,
          result: {
            ...result,
            value: { ...result.value, basis: { ...metadata, inspectedRange: { from, to } } },
          },
        },
      })
    },
  }
  return { queries, requests, gets }
}
