import { readJsonText, writeJsonText, type JsonValue } from '@omne-harness/json-text'
import { parseInstant, type Instant } from '@omne-harness/utc-instant'
import {
  ScheduleDefinitionSchema,
  ScheduleInstructionSchema,
  ScheduleWorkSchema,
  type ScheduleCandidate,
  type ScheduleDefinition,
  type ScheduleDomainError,
  type ScheduleInstruction,
  type ScheduleExecutionRow,
  type ScheduleJobDetail,
  type ScheduleJobRun,
  type ScheduleRevisionView,
  type ScheduleWork,
  type ScheduleView,
} from '@omne-harness/schedule-contract'

const LIMITS = {
  maxBytes: 1_048_576,
  maxDepth: 32,
  maxItems: 10_000,
  maxMembers: 256,
  maxStringLength: 65_536,
  maxNumberLength: 64,
}

export function treeOf(value: unknown): JsonValue {
  const read = readJsonText(JSON.stringify(value), LIMITS)
  if (read.kind !== 'ok') throw new TypeError('schedule-access: a view is not JSON')
  return read.value
}

/** A definition the client sends, judged by the schedule's own schema. */
export function definitionOf(tree: JsonValue): ScheduleDefinition | undefined {
  const parsed = ScheduleDefinitionSchema.safeParse(JSON.parse(writeJsonText(tree)))
  return parsed.success ? parsed.data : undefined
}

export function instructionOf(tree: JsonValue): ScheduleInstruction | undefined {
  const parsed = ScheduleInstructionSchema.safeParse(JSON.parse(writeJsonText(tree)))
  return parsed.success ? parsed.data : undefined
}

export function workOf(tree: JsonValue): ScheduleWork | undefined {
  const parsed = ScheduleWorkSchema.safeParse(JSON.parse(writeJsonText(tree)))
  return parsed.success ? parsed.data : undefined
}

/** The schedule keeps instants as text; the protocol carries them as instants. */
export function instantOf(text: string): Instant {
  const parsed = parseInstant(text)
  if (!parsed.ok) throw new TypeError('schedule-access: the schedule kept an invalid instant')
  return parsed.value
}

export function upcomingOf(candidate: ScheduleCandidate) {
  return {
    at: instantOf(candidate.scheduledAt),
    local: candidate.adjustedLocal as string,
    calendar: candidate.basis.calendarId,
    version: candidate.basis.calendarVersionId,
  }
}

function authorOf(view: ScheduleView) {
  const { author } = view
  if (author.kind === 'agent')
    return { kind: 'agent' as const, session: author.originatingSessionRef }
  return { kind: author.kind }
}

export function cardOf(view: ScheduleView) {
  return {
    schedule: view.scheduleId as string,
    label: view.definition.label,
    control: view.control,
    standing: view.standing.kind,
    author: authorOf(view),
    next: view.nextOccurrence === null ? null : upcomingOf(view.nextOccurrence),
    revision: view.revision,
  }
}

export function detailOf(view: ScheduleView) {
  return {
    ...cardOf(view),
    createdAt: instantOf(view.createdAt),
    definition: treeOf(view.definition),
    ...(view.standing.kind === 'ready' ? {} : { reasons: [...view.standing.reasons] }),
  }
}

export function revisionOf(view: ScheduleRevisionView) {
  return {
    revision: view.revision,
    action: view.action,
    actor: view.actor.kind,
    at: instantOf(view.occurredAt),
  }
}

type Refusal =
  | Readonly<{ outcome: 'denied' | 'basis-unavailable' | 'limited' | 'not-visible' }>
  | Readonly<{ outcome: 'unsupported' | 'conflict'; code: string }>
  | Readonly<{ outcome: 'invalid'; code: string; reason: string }>

const INVALID = new Set([
  'invalid_input',
  'unsupported_rule',
  'invalid_timezone',
  'invalid_transition',
  'no_future_slot',
])
const UNSUPPORTED = new Set([
  'missing_environment',
  'environment_incoherent',
  'unknown_calendar_version',
  'coverage_insufficient',
  'search_limit',
])
const CONFLICT = new Set([
  'revision_conflict',
  'stale_basis',
  'stale_cursor',
  'operation_key_conflict',
  'preparation_conflict',
])

/** One kind per domain error; another tenant's schedule and a missing one answer the same. */
export function refusalOf(error: ScheduleDomainError): Refusal {
  if (error.code === 'forbidden' || error.code === 'not_found') return { outcome: 'not-visible' }
  if (error.code === 'unauthenticated') return { outcome: 'denied' }
  if (error.code === 'capacity_exceeded') return { outcome: 'limited' }
  if (INVALID.has(error.code))
    return { outcome: 'invalid', code: error.code, reason: error.message }
  if (UNSUPPORTED.has(error.code)) return { outcome: 'unsupported', code: error.code }
  if (CONFLICT.has(error.code)) return { outcome: 'conflict', code: error.code }
  return { outcome: 'basis-unavailable' }
}

type JobSummary = ScheduleJobDetail['job']

/** Where a Job stands, read the same way for execution and notification bodies. */
const at = (text: string | null) => (text === null ? null : instantOf(text))

export function jobCardOf(job: JobSummary, run: ScheduleJobRun, reason: string | null) {
  const { body } = job
  const concluded =
    body.kind === 'execution'
      ? body.executionState === 'concluded'
        ? body.outcome
        : null
      : (({ durableAvailable: 'succeeded', failed: 'failed', cancelled: 'cancelled' } as const)[
          body.primaryOutcome as 'durableAvailable' | 'failed' | 'cancelled'
        ] ?? null)
  const state =
    body.kind === 'execution' ? body.executionState : concluded === null ? 'running' : 'concluded'
  return {
    job: job.jobId as string,
    state,
    outcome: concluded,
    stop: job.stopState,
    origin: run.origin,
    acceptedAt: instantOf(job.acceptedAt),
    startedAt: at(run.startedAt),
    endedAt: at(run.endedAt),
    reason,
  }
}

export function historyRowOf(row: ScheduleExecutionRow) {
  const at = instantOf(row.originalScheduledAt)
  if (row.kind === 'direct')
    return {
      kind: 'direct',
      row: row.rowRef,
      at,
      job: jobCardOf(row.job, row.run, row.run.reason),
    } as const
  if (row.kind === 'lapse')
    return {
      kind: 'lapse',
      row: row.rowRef,
      schedule: row.scheduleId as string,
      at,
      through: instantOf(row.through),
      cause: row.cause,
      reason: row.reason,
      count: row.count,
      selected: row.selected,
    } as const
  return {
    kind: 'slot',
    row: row.rowRef,
    schedule: row.scheduleId as string,
    at,
    local: row.candidate.adjustedLocal as string,
    disposition: row.receipt?.disposition ?? 'prepared',
    reason: row.receipt?.reasonCode ?? 'prepared',
    job: row.job === null || row.run === null ? null : jobCardOf(row.job, row.run, row.run.reason),
  } as const
}

export function jobDetailOf(detail: ScheduleJobDetail) {
  const work = detail.purpose.kind === 'execution' ? detail.purpose.work : null
  return {
    ...jobCardOf(detail.job, detail.run, detail.reason),
    schedule: detail.scheduleId as string | null,
    slot: detail.slot === null ? null : instantOf(detail.slot.scheduledAt),
    local: (detail.slot?.adjustedLocal ?? null) as string | null,
    calendar: detail.slot?.basis.calendarId ?? null,
    version: detail.slot?.basis.calendarVersionId ?? null,
    revision: detail.definitionRevision,
    work: treeOf(work),
    where:
      detail.executionWhere === null
        ? null
        : {
            kind: 'program' as const,
            program: detail.executionWhere.programRef,
            execution: detail.executionWhere.executionRef,
          },
    events: detail.events.map(event => ({ ...event, at: instantOf(event.at) })),
  } as const
}
