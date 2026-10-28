import type { ConsumptionId, DurableEvidence, RunId } from './identity.ts'
import type { CallBinding, WorkSnapshot, Waiting, ProducedResult } from './values.ts'
import type { SessionCallRegistration, SessionCallWait } from './call-values.ts'
import { originalAttempt } from './history-validation.ts'
import {
  equalValue,
  evidenceFields,
  invalidAt,
  nonempty,
  unavailableAt,
  unique,
} from './session-validation.ts'

type Draft = { -readonly [K in keyof WorkSnapshot]: WorkSnapshot[K] }
export class CallConflict extends Error {}

export function validateBinding(snapshot: WorkSnapshot, binding: CallBinding, run?: RunId): void {
  if (binding.producer.kind !== 'model' && binding.producer.kind !== 'tool')
    invalidAt('binding.producer.kind', 'unknown producer')
  nonempty(binding.producer.call, 'binding.producer.call')
  validateCallFields(snapshot, binding, run)
}
function validateCallFields(
  snapshot: WorkSnapshot,
  fields: Omit<CallBinding, 'producer'>,
  run?: RunId,
): void {
  nonempty(fields.action, 'binding.action')
  for (const key of ['owner', 'work', 'position', 'purpose'] as const)
    nonempty(fields.consumer[key], `binding.consumer.${key}`)
  evidenceFields(fields.request, 'binding.request')
  if (fields.initiatingAttempt !== null) originalAttempt(snapshot, fields.initiatingAttempt, run)
  else if (run !== undefined)
    invalidAt('binding.initiatingAttempt', 'Run call requires original attempt')
}
export function associated(binding: CallBinding, purpose: string): SessionCallRegistration {
  if (binding.producer.kind === 'model') {
    if (purpose !== 'main' && purpose !== 'compaction' && purpose !== 'extension')
      invalidAt('registration.purpose', 'invalid Model purpose')
    return { kind: 'associated', binding: { ...binding, producer: binding.producer }, purpose }
  }
  if (purpose !== 'action') invalidAt('registration.purpose', 'invalid Tool purpose')
  return { kind: 'associated', binding: { ...binding, producer: binding.producer }, purpose }
}
export function validateRegistration(
  snapshot: WorkSnapshot,
  registration: SessionCallRegistration,
  run?: RunId,
): void {
  if (registration.kind === 'associated') {
    validateBinding(snapshot, registration.binding, run)
    associated(registration.binding, registration.purpose)
  } else if (registration.kind === 'tool-intent') {
    if ('producer' in registration || 'reference' in registration)
      invalidAt('registration', 'Tool intent has no producer reference')
    if (registration.purpose !== 'action') invalidAt('registration.purpose', 'invalid Tool purpose')
    validateCallFields(snapshot, registration, run)
  } else invalidAt('registration.kind', 'unknown registration')
}
export function legacyRegistration(
  snapshot: WorkSnapshot,
  consumption: ConsumptionId,
  binding: CallBinding,
): SessionCallRegistration {
  const original = snapshot.callRegistrations?.find(item => item.consumption === consumption)
  if (original?.registration.kind !== 'associated') unavailableAt('registration.purpose')
  if (!equalValue(original.registration.binding, binding)) throw new CallConflict('binding')
  return original.registration
}
export function registerCall(
  draft: Draft,
  consumption: ConsumptionId,
  registration: SessionCallRegistration,
  source: DurableEvidence,
  association: DurableEvidence | null,
): void {
  nonempty(consumption, 'consumption')
  validateRegistration(draft, registration)
  evidenceFields(source, 'registration.source')
  const prior = draft.callRegistrations?.find(item => item.consumption === consumption)
  if (prior !== undefined) {
    if (equalValue(prior.registration, registration)) {
      if (!equalValue(prior.association, association))
        throw new CallConflict('registration.association')
      return
    }
    if (
      prior.registration.kind !== 'tool-intent' ||
      registration.kind !== 'associated' ||
      registration.binding.producer.kind !== 'tool'
    )
      throw new CallConflict('registration')
    evidenceFields(association, 'association.source')
    const { action, consumer, request, initiatingAttempt } = prior.registration
    const binding = registration.binding
    if (
      !equalValue(
        { action, consumer, request, initiatingAttempt },
        {
          action: binding.action,
          consumer: binding.consumer,
          request: binding.request,
          initiatingAttempt: binding.initiatingAttempt,
        },
      )
    )
      throw new CallConflict('association.binding')
  } else if (association !== null) invalidAt('association', 'no original Tool intent')
  const record = { consumption, registration, registered: prior?.registered ?? source, association }
  draft.callRegistrations = [
    ...(draft.callRegistrations ?? []).filter(item => item.consumption !== consumption),
    record,
  ]
  if (registration.kind === 'tool-intent') return
  const binding = registration.binding
  const previous = draft.consumptions.find(item => item.id === consumption)
  if (previous !== undefined && !equalValue(previous.binding, binding))
    throw new CallConflict('binding')
  if (previous === undefined)
    draft.consumptions = [...draft.consumptions, { id: consumption, binding, results: [] }]
  if (
    binding.producer.kind === 'model' &&
    draft.run.kind === 'active' &&
    binding.initiatingAttempt !== null &&
    originalAttempt(draft, binding.initiatingAttempt) === draft.run.run
  )
    draft.taken = []
  if (prior?.registration.kind === 'tool-intent') associateWaiting(draft, consumption, binding)
}
function associateWaiting(draft: Draft, consumption: ConsumptionId, binding: CallBinding): void {
  for (const wait of draft.callWaits ?? [])
    if (
      wait.consumption === consumption &&
      !draft.waiting.some(
        item =>
          item.kind === 'producer' &&
          equalValue(item.binding.producer, binding.producer) &&
          item.position === wait.position,
      )
    )
      draft.waiting = [...draft.waiting, { kind: 'producer', binding, position: wait.position }]
  draft.controls = draft.controls.map(control => {
    const unassociated = control.pendingUnassociatedWaiting ?? []
    if (!unassociated.some(item => item.consumption === consumption)) return control
    return {
      ...control,
      pendingUnassociatedWaiting: unassociated.filter(item => item.consumption !== consumption),
      pending: control.pending.some(item => equalValue(item, binding.producer))
        ? control.pending
        : [...control.pending, binding.producer],
    }
  })
}
export function registeredWaiting(
  draft: Draft,
  run: RunId,
  calls: readonly SessionCallWait[],
  other: readonly Waiting[],
): void {
  unique(calls, item => `${item.consumption}\0${item.position}`, 'waiting.calls')
  const waiting: Waiting[] = []
  for (const call of calls) {
    const record = draft.callRegistrations?.find(item => item.consumption === call.consumption)
    if (record === undefined) unavailableAt('waiting.registration')
    const fields =
      record.registration.kind === 'associated' ? record.registration.binding : record.registration
    if (fields.consumer.position !== call.position)
      invalidAt('waiting.position', 'not the original consumer position')
    if (
      fields.initiatingAttempt === null ||
      originalAttempt(draft, fields.initiatingAttempt) !== run
    )
      invalidAt('waiting.initiatingAttempt', 'not the original Run')
    if (record.registration.kind === 'associated')
      waiting.push({
        kind: 'producer',
        binding: record.registration.binding,
        position: call.position,
      })
  }
  for (const item of other) {
    if (item.kind !== 'dependency' && item.kind !== 'extension-batch')
      invalidAt('waiting.other', 'producer belongs in registered calls')
    nonempty(item.position, 'waiting.other.position')
  }
  if (draft.run.kind !== 'active' || draft.run.run !== run) return
  const cancelled = new Set(
    draft.controls
      .flatMap(control => control.pendingUnassociatedWaiting ?? [])
      .map(item => `${item.consumption}\0${item.position}`),
  )
  draft.callWaits = calls.filter(item => !cancelled.has(`${item.consumption}\0${item.position}`))
  draft.waiting = [
    ...waiting.filter(
      item =>
        item.kind !== 'producer' ||
        !draft.controls.some(control =>
          control.pending.some(producer => equalValue(producer, item.binding.producer)),
        ),
    ),
    ...other,
  ]
}
export function validateResult(binding: CallBinding, result: ProducedResult): void {
  if (!equalValue(binding.producer, result.producer))
    invalidAt('result.producer', 'not the frozen binding producer')
  nonempty(result.version, 'result.version')
  if (result.delivery !== null) nonempty(result.delivery, 'result.delivery')
  evidenceFields(result.source, 'result.source')
}

export const waitKey = (wait: SessionCallWait): string => `${wait.consumption}\0${wait.position}`
