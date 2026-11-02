// The Session consequences of one Agent control event (EC-01 `control` → SE25), decided at the
// interpretation, on the Session snapshot of that commit. A control event's consequences depend on
// the Session controls that are open when it is interpreted, so its fact boundary carries the
// deferred marker instead of kinds (FR-01), and this rule decides them. The adapter translates the
// Agent control records into the neutral evidence below; this module never reads an Agent type.
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { Message } from '@omne-harness/message'
import type { SessionCallRegistration, SessionCallWait } from './call-values.ts'
import type { SessionFailure } from './faces.ts'
import type { SessionAttemptRecord } from './history-values.ts'
import type { AttemptId, DurableEvidence, InputId, RunId, SessionOperationId } from './identity.ts'
import { deriveDriveOperation } from './operations.ts'
import type { SessionLogConsequence } from './projection.ts'
import {
  SessionValidationFailure,
  equalValue,
  inconsistent,
  unavailableAt,
} from './session-validation.ts'
import type { CallBinding, ControlProgress, ProducerRef, WorkSnapshot } from './values.ts'

/** The stages of an Agent control record that the rule reads. */
export type SessionControlStage =
  | 'intent-established'
  | 'qualification-revoked'
  | 'producer-confirmed'
  | 'physically-stopped'
  | 'duty-released'

/**
 * One Agent control record as of the event. `operation` is the Agent operation of its control
 * command; `references` are the invocation references (`ProducerRef.call`) that resolve to the
 * call it names, empty for a cancel; `invocation` is the Tool invocation a Tool control names,
 * when it resolves to that call; `accepted` is the revision of its original command.
 */
export type SessionControlRecordEvidence = Readonly<{
  operation: string
  command: 'cancel' | 'interrupt-model' | 'interrupt-tool' | 'background-tool'
  references: readonly string[]
  invocation: string | null
  reached: readonly SessionControlStage[]
  accepted: string
}>

/** A call the Agent saw settle: a background slot, a result slot or a settled Model reply. */
export type SessionControlSettlement = Readonly<{
  kind: 'background' | 'result' | 'model'
  binding: CallBinding
  revision: string
}>

/**
 * The Agent side of one control event in Session words. `through` is the revision of the event's
 * commit; `settled` and `urgent` are what the Agent recorded up to it; `urgent` lists the urgent
 * inputs the Agent accepted under their drive operation.
 */
export type SessionControlEvidence = Readonly<{
  through: string
  records: readonly SessionControlRecordEvidence[]
  settled: readonly SessionControlSettlement[]
  urgent: readonly Readonly<{ input: InputId; message: Message; origin: DurableEvidence | null }>[]
}>

/** The execution that was active when the Session control (SE24) was requested; null: none. */
export type SessionControlOrigin = Readonly<{
  operation: SessionOperationId
  execution: string | null
}>

export type SessionControlDecisionInput = Readonly<{
  snapshot: WorkSnapshot
  execution: string
  run: RunId
  /** The SE15 records of the execution. */
  attempts: readonly SessionAttemptRecord[]
  origins: readonly SessionControlOrigin[]
  evidence: SessionControlEvidence
}>

type Rule = SessionControlDecisionInput

const reached = (record: SessionControlRecordEvidence, stage: SessionControlStage) =>
  record.reached.includes(stage)

const attemptOf = (registration: SessionCallRegistration): AttemptId | null =>
  registration.kind === 'tool-intent'
    ? registration.initiatingAttempt
    : registration.binding.initiatingAttempt

/** True when `attempt` is an SE15 of the interpreted execution. */
function ownedHere(rule: Rule, attempt: AttemptId | null): boolean {
  return (
    attempt !== null &&
    rule.attempts.some(item => item.attempt === attempt && item.execution === rule.execution)
  )
}

/** True when the record's command stops the call of `producer`: a Tool one by its invocation. */
function names(record: SessionControlRecordEvidence, producer: ProducerRef): boolean {
  return producer.kind === 'model'
    ? record.command === 'interrupt-model' && record.references.includes(producer.call)
    : (record.command === 'interrupt-tool' || record.command === 'background-tool') &&
        record.invocation === producer.call
}

/** True when the record covers the responsibility of `registration`. */
function covers(
  rule: Rule,
  record: SessionControlRecordEvidence,
  registration: SessionCallRegistration,
): boolean {
  if (record.command === 'cancel') return ownedHere(rule, attemptOf(registration))
  return registration.kind === 'associated' && names(record, registration.binding.producer)
}

/** True when the record is the drive of Session control `progress` (or its original cancel). */
function directMatches(
  rule: Rule,
  record: SessionControlRecordEvidence,
  progress: ControlProgress,
  originalExecution: string | null,
): boolean {
  const drive = deriveDriveOperation({
    kind: 'control',
    execution: rule.execution,
    control: progress.operation,
  })
  if (record.operation !== drive || progress.intent.kind === 'interrupt') return false
  const intent = progress.intent.kind === 'control' ? progress.intent.value : null
  if (intent?.kind === 'unarchive') return false
  if (intent?.kind === 'stop-call')
    return (
      record.command ===
        (intent.producer.kind === 'model' ? 'interrupt-model' : 'interrupt-tool') &&
      record.references.includes(intent.producer.call)
    )
  if (intent?.kind === 'background-tool')
    return record.command === 'background-tool' && record.references.includes(intent.producer.call)
  return originalExecution === rule.execution && record.command === 'cancel'
}

type Selected = Readonly<{
  item: Readonly<{ consumption: string; position: string }>
  live: SessionCallRegistration
  released: boolean
}>

/** The original selected responsibilities of one control with their current registration. */
function selectedOf(rule: Rule, current: ControlProgress): readonly Selected[] {
  const references = rule.snapshot.workEntryIndex?.controls.find(
    item => item.operation === current.operation,
  )
  if (references === undefined) unavailableAt('control.references')
  return references.selected.map(item => {
    const live = rule.snapshot.callRegistrations?.find(
      record => record.consumption === item.consumption,
    )?.registration
    if (live === undefined) unavailableAt('control.registration')
    return {
      item,
      live,
      released: rule.evidence.records.some(
        record => reached(record, 'duty-released') && covers(rule, record, live),
      ),
    }
  })
}

/** True when the record confirms that the call of `registration` stopped or had settled. */
function confirms(
  rule: Rule,
  current: ControlProgress,
  origin: SessionControlOrigin,
  record: SessionControlRecordEvidence,
  registration: SessionCallRegistration,
): boolean {
  if (!covers(rule, record, registration)) return false
  const through = BigInt(rule.evidence.through)
  const settled = (kinds: readonly SessionControlSettlement['kind'][], before: bigint | null) =>
    registration.kind === 'associated' &&
    rule.evidence.settled.some(
      item =>
        kinds.includes(item.kind) &&
        BigInt(item.revision) <= through &&
        (before === null || BigInt(item.revision) < before) &&
        equalValue(item.binding, registration.binding),
    )
  const direct = directMatches(rule, record, current, origin.execution)
  if (current.intent.kind === 'control' && current.intent.value.kind === 'background-tool')
    return (
      record.command === 'background-tool' &&
      direct &&
      reached(record, 'intent-established') &&
      settled(['background'], null)
    )
  if (record.command === 'background-tool' || !direct) return false
  return (
    reached(record, 'producer-confirmed') ||
    reached(record, 'physically-stopped') ||
    settled(['result', 'model'], BigInt(record.accepted))
  )
}

/** The producers of the control that still wait for a confirmation or a released duty. */
function pendingOf(
  rule: Rule,
  current: ControlProgress,
  origin: SessionControlOrigin,
  selected: readonly Selected[],
): ProducerRef[] {
  return current.pending.filter(producer => {
    const registrations =
      rule.snapshot.callRegistrations
        ?.filter(
          item =>
            item.registration.kind === 'associated' &&
            equalValue(item.registration.binding.producer, producer),
        )
        .map(item => item.registration) ?? []
    if (registrations.length === 0) unavailableAt('control.pending.registration')
    const confirmed = registrations.every(registration =>
      rule.evidence.records.some(record => confirms(rule, current, origin, record, registration)),
    )
    const duties = selected.filter(
      item => item.live.kind === 'associated' && equalValue(item.live.binding.producer, producer),
    )
    return !confirmed || duties.some(item => !item.released)
  })
}

/** The unassociated waits of the control whose duty no record released. */
function waitsOf(current: ControlProgress, selected: readonly Selected[]): SessionCallWait[] {
  return (current.pendingUnassociatedWaiting ?? []).filter(wait => {
    const source = selected.find(
      item => item.item.consumption === wait.consumption && item.item.position === wait.position,
    )
    if (source === undefined)
      inconsistent('control wait outside original selected responsibilities')
    return !source.released
  })
}

/** True when the urgent input of an interrupt was accepted by the Agent of this Run. */
function urgentAccepted(rule: Rule, current: ControlProgress): boolean {
  if (current.intent.kind !== 'interrupt' || current.intent.run !== rule.run) return false
  const urgent = current.intent.urgent
  const found = rule.evidence.urgent.find(item => item.input === urgent.input)
  if (found === undefined) return false
  if (!equalValue(found.message, urgent.message) || !equalValue(found.origin, urgent.origin))
    inconsistent('urgent original submission mismatch')
  return true
}

/** True when every attempt of the execution released the advance; it has at least one. */
function attemptsReleased(rule: Rule): boolean {
  if (!rule.attempts.some(item => item.execution === rule.execution)) return false
  const run = rule.snapshot.run
  return run.kind !== 'active' || run.execution.execution !== rule.execution || run.advance === null
}

/** Whether the intent of the control is established and its qualification condition holds. */
function settledIntent(
  rule: Rule,
  current: ControlProgress,
  origin: SessionControlOrigin,
): Readonly<{ intent: boolean; qualification: boolean }> {
  const direct = rule.evidence.records.find(record =>
    directMatches(rule, record, current, origin.execution),
  )
  const value = current.intent.kind === 'control' ? current.intent.value : null
  const intent =
    current.intent.kind === 'interrupt'
      ? urgentAccepted(rule, current)
      : value?.kind === 'unarchive' ||
        (origin.execution === null && current.target.kind === 'session') ||
        (direct !== undefined && reached(direct, 'intent-established'))
  if (direct?.command === 'cancel')
    return {
      intent,
      qualification: reached(direct, 'qualification-revoked') && attemptsReleased(rule),
    }
  const revoking =
    current.intent.kind === 'auto-archive' ||
    value?.kind === 'cancel-run' ||
    value?.kind === 'archive'
  return { intent, qualification: !(origin.execution !== null && revoking) }
}

/** The new progress of one open control, or null when the event does not concern it. */
function progressOf(rule: Rule, current: ControlProgress): ControlProgress | null {
  const origin = rule.origins.find(item => item.operation === current.operation)
  if (origin === undefined) unavailableAt('control.origin')
  const selected = selectedOf(rule, current)
  if (
    origin.execution !== rule.execution &&
    !selected.some(item => ownedHere(rule, attemptOf(item.live))) &&
    !rule.evidence.records.some(record => directMatches(rule, record, current, origin.execution))
  )
    return null
  const pendingUnassociatedWaiting = waitsOf(current, selected)
  const pending = pendingOf(rule, current, origin, selected)
  const { intent, qualification } = settledIntent(rule, current, origin)
  const reconciled =
    intent && qualification && pending.length === 0 && pendingUnassociatedWaiting.length === 0
  return {
    ...current,
    pending,
    pendingUnassociatedWaiting,
    state: reconciled ? 'reconciled' : current.state,
  }
}

/**
 * The consequences of one control event: one `control` per open Session control whose progress
 * the event changes, else `observed`. A missing original answers `unavailable`, a contradiction
 * `quarantined`.
 */
export function decideControlConsequences(
  input: SessionControlDecisionInput,
): Outcome<readonly SessionLogConsequence[], SessionFailure> {
  try {
    const consequences: SessionLogConsequence[] = []
    for (const current of input.snapshot.controls) {
      if (current.state === 'reconciled') continue
      const progress = progressOf(input, current)
      if (progress !== null && !equalValue(progress, current))
        consequences.push({ kind: 'control', progress })
    }
    return succeed(consequences.length > 0 ? consequences : [{ kind: 'observed' }])
  } catch (error) {
    if (error instanceof SessionValidationFailure) return fail(error.failure)
    throw error
  }
}
