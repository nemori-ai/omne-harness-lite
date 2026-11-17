import type {
  ScheduleCandidate,
  ScheduleCommandResult,
  ScheduleDomainError,
  ScheduleView,
} from '@omne-harness/schedule-contract'

/** Why a schedule is in effect: the consent it adopted, else the owner's own act; a draft has none. */
export function basisOf(view: ScheduleView): string {
  const adoption = view.consentAdoption
  if (adoption?.adoptionKind === 'blanket')
    return `blanket generation=${String(adoption.generation)}`
  if (adoption?.adoptionKind === 'granular') return `granular decision=${adoption.grantRef}`
  return view.control === 'draft' ? 'none' : 'owner'
}

export function upcomingOf(candidate: ScheduleCandidate) {
  return {
    at: candidate.scheduledAt,
    local: candidate.adjustedLocal,
    calendar: candidate.basis.calendarId,
    version: candidate.basis.calendarVersionId,
  }
}

export function summaryOf(view: ScheduleView) {
  const { author } = view
  return {
    schedule: view.scheduleId,
    label: view.definition.label,
    control: view.control,
    revision: view.revision,
    author: author.kind === 'agent' ? `agent session=${author.originatingSessionRef}` : author.kind,
    basis: basisOf(view),
    next: view.nextOccurrence === null ? null : upcomingOf(view.nextOccurrence),
  }
}

export const doneLine = (command: string, value: unknown) =>
  `done Schedules ${command}\n${JSON.stringify(value)}`

const KIND: Partial<Record<ScheduleDomainError['code'], string>> = {
  forbidden: 'not_found',
  not_found: 'not_found',
  revision_conflict: 'conflict',
  operation_key_conflict: 'conflict',
  stale_basis: 'conflict',
  capacity_exceeded: 'limited',
  invalid_input: 'invalid',
  invalid_transition: 'invalid',
  unsupported_rule: 'invalid',
  invalid_timezone: 'invalid',
  no_future_slot: 'invalid',
  coverage_insufficient: 'coverage_insufficient',
  missing_environment: 'not_configured',
  environment_incoherent: 'not_configured',
  unknown_calendar_version: 'coverage_insufficient',
}

/** One line for a refusal: <kind> reason=<why> code=<domain code>. */
export function refusalLine(error: ScheduleDomainError): string {
  const kind = KIND[error.code] ?? 'unavailable'
  return `${kind} reason=${error.message} code=${error.code}`
}

export function writeLine(command: string, result: ScheduleCommandResult<ScheduleView>): string {
  if (result.kind === 'rejected') return refusalLine(result.error)
  if (result.kind === 'unknown')
    return `unknown reason=the write may or may not have happened; call recover with this operation operation=${result.operationRef}`
  return doneLine(command, { ...summaryOf(result.value), operation: result.operationRef })
}
