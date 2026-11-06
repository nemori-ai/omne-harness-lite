import { z } from 'zod'
import {
  isQualification,
  isStandingBinding,
  isStandingReservation,
  standingReservationId,
  type Qualification,
  type StandingBinding,
  type StandingReservation,
} from '@omne-harness/identity'
import { tenantCodec } from '@omne-harness/legal-identity'
import { SettingsIdSchema, SettingsReferenceSchema } from '@omne-harness/settings'
import type { ParticipantPort, ReadPort } from '@omne-harness/sql-contract/worker'
import { canonical, digest, equal, withinBudget } from './encoding.ts'
import { intentIdentitySchema, type IntentIdentity } from './intent-schema.ts'
import { readSettingsAttempt } from './intent-records.ts'
import { encodeSettingsRecoveryReference } from './recovery-reference.ts'

const qualifications = z
  .array(z.custom<Qualification>(isQualification))
  .max(16)
  .transform(values => [...new Set(values)].sort())
const bindingSchema = z.custom<StandingBinding>(isStandingBinding)
const requestSchema = z.strictObject({ binding: bindingSchema, required: qualifications })
const receiptSchema = requestSchema.extend({ id: z.string() }).refine(isStandingReservation)
const referenceSchema = z.strictObject({
  identity: intentIdentitySchema,
  attemptId: SettingsIdSchema,
})
export const standingPlanInputSchema = referenceSchema.extend({
  destination: SettingsReferenceSchema,
  scopeRef: SettingsReferenceSchema,
  required: qualifications,
})
export const standingReceiptInputSchema = referenceSchema.extend({ reservation: receiptSchema })
export const standingSettlementInputSchema = standingReceiptInputSchema.extend({
  outcome: z.enum(['committed', 'aborted']),
})
export type StandingPlanInput = Omit<z.input<typeof standingPlanInputSchema>, 'required'> & {
  required: readonly Qualification[]
}
export type StandingReceiptInput = z.input<typeof referenceSchema> & {
  reservation: StandingReservation
}
export type StandingSettlementInput = StandingReceiptInput & { outcome: 'committed' | 'aborted' }
type Attempt = Extract<ReturnType<typeof readSettingsAttempt>, { kind: 'found' }>
const conflict = () => ({ kind: 'rejected' as const, reason: 'operation_conflict' as const })

function requestFor(
  attempt: Attempt,
  input: Pick<StandingPlanInput, 'scopeRef' | 'destination' | 'required'>,
) {
  const tenant = tenantCodec.parse(input.scopeRef)
  if (!tenant.ok) throw new Error('Settings standing requires a canonical tenant scope')
  const encoded = tenantCodec.encode(tenant.value)
  if (!encoded.ok || encoded.value !== input.scopeRef)
    throw new Error('Settings standing requires a canonical tenant scope')
  const domain = attempt.identity.domain
  if (domain.scope.kind === 'tenant' && domain.scope.tenant !== input.scopeRef)
    throw new Error('Settings standing tenant mismatch')
  const { requestId: _requestId, ...command } = attempt.intent.command
  const targetRef = encodeSettingsRecoveryReference({
    version: 'settings-recovery/1',
    kind: 'attempt',
    target: command.target,
    rootOperationId: command.operationId,
    rootCommandDigest: digest(command),
    commandKind: attempt.intent.kind,
  })
  if (targetRef === undefined) throw new Error('Settings recovery reference exceeds its budget')
  return requestSchema.parse({
    binding: {
      version: 'standing/1',
      owner: 'settings',
      operationId: attempt.attempt.attemptId,
      principalRef: attempt.identity.principalRef,
      destination: input.destination,
      scopeRef: input.scopeRef,
      targetRef,
      inputDigest: digest(command),
    },
    required: input.required,
  })
}
const rowSchema = z.tuple([
  z.string(),
  z.string(),
  z.enum(['planned', 'requested', 'held', 'settled']),
  z.string().nullable(),
  z.enum(['committed', 'aborted']).nullable(),
])
function decodeReceipt(
  encoded: string | null,
  request: z.output<typeof requestSchema>,
  id: string,
) {
  const reservation = receiptSchema.parse(JSON.parse(z.string().parse(encoded)))
  if (
    !equal(request, { binding: reservation.binding, required: reservation.required }) ||
    reservation.id !== id
  )
    throw new Error('Invalid persisted Settings standing receipt')
  return reservation
}
function decodeCustody(row: readonly unknown[], attempt: Attempt) {
  const [encodedRequest, id, state, encodedReceipt, outcome] = rowSchema.parse(row)
  const request = requestSchema.parse(JSON.parse(encodedRequest))
  const expected = requestFor(attempt, { ...request.binding, required: request.required })
  if (!equal(request, expected) || id !== standingReservationId(request.binding, request.required))
    throw new Error('Invalid persisted Settings standing request')
  if (state === 'planned' || state === 'requested') {
    if (encodedReceipt !== null || outcome !== null) throw new Error('Unexpected standing receipt')
    return { kind: state, request, reservationId: id }
  }
  const reservation = decodeReceipt(encodedReceipt, request, id)
  if (state === 'held') {
    if (outcome !== null) throw new Error('Held standing has terminal outcome')
    return { kind: 'held' as const, request, reservationId: id, reservation }
  }
  return {
    kind: 'settled' as const,
    request,
    reservationId: id,
    reservation,
    outcome: z.enum(['committed', 'aborted']).parse(outcome),
  }
}
function readCustody(port: ReadPort, attempt: Attempt) {
  const row = port.execute(
    'SELECT request_json, reservation_id, state, receipt_json, outcome FROM st_intent_standing WHERE attempt_id = ? LIMIT 1',
    [attempt.attempt.attemptId],
  ).rows[0]
  return row ? decodeCustody(row, attempt) : { kind: 'not_found' as const }
}
export function readStandingCustody(port: ReadPort, identity: IntentIdentity, attemptId: string) {
  const attempt = readSettingsAttempt(port, identity, attemptId)
  return attempt.kind === 'found' ? readCustody(port, attempt) : attempt
}

/** The owning participant validates admission; this record is not an Identity grant. */
export function planStandingCustody(port: ParticipantPort, raw: StandingPlanInput) {
  if (!withinBudget(raw)) return { kind: 'rejected' as const, reason: 'limit_exceeded' as const }
  const input = standingPlanInputSchema.parse(raw)
  const attempt = readSettingsAttempt(port, input.identity, input.attemptId)
  if (attempt.kind !== 'found') return attempt
  const request = requestFor(attempt, input)
  const previous = readCustody(port, attempt)
  if (previous.kind !== 'not_found') return equal(previous.request, request) ? previous : conflict()
  if (attempt.status.state !== 'open' || attempt.attempt.status.state !== 'preparing')
    return conflict()
  port.execute(
    `INSERT INTO st_intent_standing
    (attempt_id, request_json, reservation_id, state, receipt_json, outcome)
    VALUES (?, ?, ?, 'planned', NULL, NULL)`,
    [input.attemptId, canonical(request), standingReservationId(request.binding, request.required)],
  )
  return readCustody(port, attempt)
}
export function requestStandingCustody(
  port: ParticipantPort,
  raw: z.input<typeof referenceSchema>,
) {
  const input = referenceSchema.parse(raw)
  const attempt = readSettingsAttempt(port, input.identity, input.attemptId)
  if (attempt.kind !== 'found') return attempt
  if (attempt.status.state !== 'open' || attempt.attempt.status.state !== 'preparing')
    return conflict()
  const previous = readCustody(port, attempt)
  if (previous.kind !== 'planned') return previous
  port.execute(
    "UPDATE st_intent_standing SET state = 'requested' WHERE attempt_id = ? AND state = 'planned'",
    [input.attemptId],
  )
  return readCustody(port, attempt)
}
function receiptTarget(port: ParticipantPort, input: z.output<typeof standingReceiptInputSchema>) {
  const attempt = readSettingsAttempt(port, input.identity, input.attemptId)
  if (attempt.kind !== 'found') return attempt
  const previous = readCustody(port, attempt)
  if (previous.kind === 'not_found') return previous
  if (
    previous.kind === 'planned' ||
    previous.reservationId !== input.reservation.id ||
    !equal(previous.request, {
      binding: input.reservation.binding,
      required: input.reservation.required,
    })
  )
    return conflict()
  return { kind: 'matched' as const, attempt, previous }
}
export function recordStandingHeld(port: ParticipantPort, raw: StandingReceiptInput) {
  const input = standingReceiptInputSchema.parse(raw)
  const matched = receiptTarget(port, input)
  if (matched.kind !== 'matched') return matched
  if (matched.previous.kind === 'held' || matched.previous.kind === 'settled')
    return matched.previous
  port.execute(
    "UPDATE st_intent_standing SET state = 'held', receipt_json = ? WHERE attempt_id = ? AND state = 'requested'",
    [canonical(input.reservation), input.attemptId],
  )
  return readCustody(port, matched.attempt)
}
export function recordStandingSettled(port: ParticipantPort, raw: StandingSettlementInput) {
  const input = standingSettlementInputSchema.parse(raw)
  const matched = receiptTarget(port, input)
  if (matched.kind !== 'matched') return matched
  if (matched.previous.kind === 'settled')
    return matched.previous.outcome === input.outcome ? matched.previous : conflict()
  port.execute(
    "UPDATE st_intent_standing SET state = 'settled', receipt_json = ?, outcome = ? WHERE attempt_id = ?",
    [canonical(input.reservation), input.outcome, input.attemptId],
  )
  return readCustody(port, matched.attempt)
}
