import { readJsonText, writeJsonText, type JsonValue } from '@omne-harness/json-text'
import { parseInstant, type Instant } from '@omne-harness/utc-instant'
import {
  ScheduleDefinitionSchema,
  type ScheduleCandidate,
  type ScheduleDefinition,
  type ScheduleDomainError,
  type ScheduleRevisionView,
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

/** Why the schedule is in effect: a consent it adopted, else the owner's own act; a draft has none. */
function basisOf(view: ScheduleView) {
  const adoption = view.consentAdoption
  if (adoption?.adoptionKind === 'blanket')
    return { kind: 'blanket' as const, generation: adoption.generation }
  if (adoption?.adoptionKind === 'granular')
    return { kind: 'granular' as const, decision: adoption.grantRef }
  return view.control === 'draft' ? { kind: 'none' as const } : { kind: 'owner' as const }
}

export function detailOf(view: ScheduleView) {
  return {
    ...cardOf(view),
    basis: basisOf(view),
    createdAt: instantOf(view.createdAt),
    definition: treeOf(view.definition),
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
  | Readonly<{ outcome: 'invalid' | 'unsupported' | 'conflict'; code: string }>

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
  'consent_required',
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
  if (INVALID.has(error.code)) return { outcome: 'invalid', code: error.code }
  if (UNSUPPORTED.has(error.code)) return { outcome: 'unsupported', code: error.code }
  if (CONFLICT.has(error.code)) return { outcome: 'conflict', code: error.code }
  return { outcome: 'basis-unavailable' }
}
