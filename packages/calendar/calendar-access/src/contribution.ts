import type { AccessContribution, BodyOf } from '@omne-harness/access-cordis-contract'
import {
  calendarIdSchema,
  calendarQuerySchema,
  calendarVersionIdSchema,
  type CalendarDomainError,
  type CalendarHealth,
  type CalendarInfo,
  type CalendarQuestion,
  type CalendarResolution,
} from '@omne-harness/calendar-contract'
import type { CalendarProtocol } from '@omne-harness/calendar-protocol'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { parseInstant, type Instant } from '@omne-harness/utc-instant'
import type { CalendarFaces, CalendarPrincipals } from './ports.ts'

export type CalendarContributionInput = Readonly<{
  principals: CalendarPrincipals
  faces: () => CalendarFaces | undefined
  requestId: () => string
}>

type Operations = CalendarProtocol['operations']
type Handlers = AccessContribution<CalendarProtocol>['operations']
type Question = BodyOf<Operations['answer']>['question']

const UNAVAILABLE = Object.freeze({ outcome: 'basis-unavailable' as const })
const DENIED = Object.freeze({ outcome: 'denied' as const })

type Refusal =
  | 'denied'
  | 'unavailable'
  | 'input'
  | 'timezone'
  | 'environment'
  | 'coverage'
  | 'search-limit'

/** Each domain refusal has one kind; nothing the domain answers becomes a success or an empty list. */
const REFUSALS: Readonly<Record<CalendarDomainError['code'], Refusal>> = {
  unauthenticated: 'denied',
  forbidden: 'denied',
  not_found: 'denied',
  invalid_input: 'input',
  invalid_timezone: 'timezone',
  missing_environment: 'environment',
  environment_incoherent: 'environment',
  unknown_calendar_version: 'coverage',
  coverage_insufficient: 'coverage',
  search_limit: 'search-limit',
  authority_unavailable: 'unavailable',
  capacity_exceeded: 'unavailable',
  provider_failure: 'unavailable',
}

/** A read with no refusal outcome of its own answers denied or an unavailable basis. */
function fixedRefusal(error: CalendarDomainError) {
  return REFUSALS[error.code] === 'denied' ? DENIED : UNAVAILABLE
}

function environmentRefusal(error: CalendarDomainError) {
  return REFUSALS[error.code] === 'environment'
    ? ({ outcome: 'unsupported', body: { reason: 'environment' } } as const)
    : fixedRefusal(error)
}

function answerRefusal(error: CalendarDomainError) {
  const refusal = REFUSALS[error.code]
  switch (refusal) {
    case 'input':
    case 'timezone':
      return { outcome: 'invalid', body: { reason: refusal } } as const
    case 'environment':
    case 'coverage':
    case 'search-limit':
      return { outcome: 'unsupported', body: { reason: refusal } } as const
    default:
      return fixedRefusal(error)
  }
}

function tenantTextOf(tenant: TenantId): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new TypeError('calendar-access: tenant is not a minted TenantId')
  return encoded.value
}

/** The calendar's own rules (ordered ranges, at most 366 days to list) judge the question. */
function questionOf(question: Question): CalendarQuestion | undefined {
  const plain =
    question.kind === 'shift'
      ? {
          kind: 'shift',
          date: question.date,
          offset: question.direction === 'forward' ? question.days : -question.days,
        }
      : question
  const parsed = calendarQuerySchema.safeParse(plain)
  return parsed.success ? parsed.data : undefined
}

function calendarOf(info: CalendarInfo) {
  const published = info.versions.items.find(
    version => version.versionId === info.publishedVersionId,
  )
  return {
    calendar: info.calendarId,
    timezone: info.timezone,
    version: info.publishedVersionId,
    coverageStart: published?.coverageStart ?? null,
    coverageEnd: published?.coverageEnd ?? null,
  }
}

function instantOf(text: string): Instant {
  const parsed = parseInstant(text)
  if (!parsed.ok) throw new TypeError('calendar-access: the domain kept an invalid instant')
  return parsed.value
}
/** Null: nothing named, the effective calendar answers. Undefined: a version without its calendar, or bad text. */
function namedBasis(body: Readonly<{ calendar?: string; version?: string }>) {
  if (body.calendar === undefined) return body.version === undefined ? null : undefined
  const calendarId = calendarIdSchema.safeParse(body.calendar)
  const versionId = calendarVersionIdSchema.safeParse(body.version)
  if (!calendarId.success || (body.version !== undefined && !versionId.success)) return undefined
  return {
    selection: { kind: 'explicit', calendarId: calendarId.data },
    version: versionId.success
      ? ({ kind: 'pinned', versionId: versionId.data } as const)
      : ({ kind: 'latest' } as const),
  } as const
}
function healthOf(item: CalendarHealth) {
  const left = item.remainingCoverageDays
  return {
    calendar: String(item.calendarId),
    queryAvailability: item.queryAvailability,
    supply: item.supply,
    horizon: item.horizon,
    coverageStart: item.coverageStart,
    coverageEnd: item.coverageEnd,
    knowledgeAsOf: item.knowledgeAsOf === null ? null : instantOf(item.knowledgeAsOf),
    remainingCoverageDays: left === null ? null : Math.max(0, left),
    consecutiveFailures: item.consecutiveFailures,
    lastSuccess: item.lastSuccess === null ? null : instantOf(item.lastSuccess),
    pendingRuns: item.pendingRuns,
    sources: item.sources.map(({ sourceId, observation, consecutiveFailures }) => ({
      source: String(sourceId),
      observation: observation.kind,
      reason: observation.reason,
      consecutiveFailures,
    })),
    reasons: [...item.reasons],
  }
}
function resultOf({ result }: CalendarResolution) {
  switch (result.kind) {
    case 'day': {
      const { date, classification, working, override } = result.value
      return { kind: 'day' as const, date, classification, working, adjusted: override }
    }
    case 'count': {
      const { from, to, count } = result.value
      return { kind: 'count' as const, from, to, count }
    }
    case 'shift':
      return { kind: 'shift' as const, date: result.value.date }
    case 'next':
      return { kind: 'next' as const, dates: result.value.dates }
    case 'nth':
      return { kind: 'nth' as const, date: result.value.date }
  }
}

export function createCalendarContribution(
  input: CalendarContributionInput,
): Omit<AccessContribution<CalendarProtocol>, 'protocol'> {
  const { principals } = input

  /** Steps one to three: the login acts for the tenant, the principal is current, the faces are here. */
  async function prepare(login: Parameters<CalendarPrincipals['actingFor']>[0], tenant: TenantId) {
    const tenantText = tenantTextOf(tenant)
    let issued: Awaited<ReturnType<CalendarPrincipals['actingFor']>>
    try {
      issued = await principals.actingFor(login, tenantText)
    } catch {
      return UNAVAILABLE
    }
    if ('refused' in issued) return issued.refused === 'denied' ? DENIED : UNAVAILABLE
    const faces = input.faces()
    if (faces === undefined) return UNAVAILABLE
    return {
      outcome: null,
      faces,
      context: principals.contextOf(issued.ok, tenantText, input.requestId()),
    }
  }

  /** Step four for reads: a throw is an unavailable basis, never an answer. */
  async function read<T>(call: () => Promise<T>): Promise<T | undefined> {
    try {
      return await call()
    } catch {
      return undefined
    }
  }

  const listCalendars: Handlers['list-calendars'] = async (call, body) => {
    const ready = await prepare(call.principal, body.tenant)
    if (ready.outcome !== null) return ready
    const listed = await read(() => ready.faces.queries.list(ready.context, { limit: 100 }))
    if (listed === undefined) return UNAVAILABLE
    if (listed.kind === 'error') return fixedRefusal(listed.error)
    return { outcome: 'succeeded', body: { calendars: listed.value.items.map(calendarOf) } }
  }

  const readSupplyHealth: Handlers['read-supply-health'] = async (call, body) => {
    const ready = await prepare(call.principal, body.tenant)
    if (ready.outcome !== null) return ready
    const health = await read(async () => {
      const answered = await ready.faces.queries.health(ready.context)
      return answered.kind === 'ok'
        ? { kind: 'ok' as const, calendars: answered.value.map(healthOf) }
        : answered
    })
    if (health === undefined) return UNAVAILABLE
    if (health.kind === 'error') return fixedRefusal(health.error)
    return { outcome: 'succeeded', body: { calendars: health.calendars } }
  }
  const readEnvironment: Handlers['read-environment'] = async (call, body) => {
    const ready = await prepare(call.principal, body.tenant)
    if (ready.outcome !== null) return ready
    const found = await read(() => ready.faces.queries.effective(ready.context))
    if (found === undefined) return UNAVAILABLE
    if (found.kind === 'error') return environmentRefusal(found.error)
    const { calendar, activeTimezone, environmentRevision } = found.value
    return {
      outcome: 'succeeded',
      body: {
        calendar: calendar.calendarId,
        timezone: activeTimezone,
        revision: environmentRevision,
        version: calendar.publishedVersionId,
      },
    }
  }

  const answer: Handlers['answer'] = async (call, body) => {
    const ready = await prepare(call.principal, body.tenant)
    if (ready.outcome !== null) return ready
    const question = questionOf(body.question)
    if (question === undefined) return { outcome: 'invalid', body: { reason: 'input' } } as const
    const named = namedBasis(body)
    if (named === undefined) return { outcome: 'invalid', body: { reason: 'input' } } as const
    const answered = await read(() =>
      named === null
        ? ready.faces.calculator.answer(ready.context, question)
        : ready.faces.queries.resolve(ready.context, { ...named, query: question }),
    )
    if (answered === undefined) return UNAVAILABLE
    if (answered.kind === 'error') return answerRefusal(answered.error)
    const { calendarId, versionId, coverageStart, coverageEnd } = answered.value
    return {
      outcome: 'succeeded',
      body: {
        calendar: calendarId,
        version: versionId,
        coverageStart,
        coverageEnd,
        result: resultOf(answered.value),
      },
    }
  }

  return {
    operations: {
      'list-calendars': listCalendars,
      'read-environment': readEnvironment,
      'read-supply-health': readSupplyHealth,
      answer,
    },
    observations: {},
  }
}
