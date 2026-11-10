import { standingReservationId, type StandingReservation } from '@omne-harness/identity'
import type { ParticipantPort, ReadPort } from '@omne-harness/sql-contract/worker'
import { boundOperation, conflict, operationParams } from './operation.ts'
import { canonical, digest, equal } from './encoding.ts'
import { readScope } from './scope.ts'
import type { OperationBinding, OperationRecord } from './operation-schema.ts'
import {
  standingCustodySchema,
  standingPlanSchema,
  standingReceiptSchema,
  standingRequestSchema,
  type StandingCustody,
  type StandingPlan,
} from './standing-schema.ts'

function requestFor(
  operation: OperationBinding,
  record: OperationRecord,
  input: Pick<StandingPlan, 'destination' | 'required'>,
) {
  const transactionDomain = record.sqlIdentity.transactionDomain
  return standingRequestSchema.parse({
    binding: {
      version: 'standing/1',
      owner: 'governance',
      operationId: 'governance/1/' + digest({ operation: operation.ref, transactionDomain }),
      principalRef: operation.ref.principalRef,
      destination: input.destination,
      scopeRef: operation.ref.scope.tenantRef,
      targetRef: canonical({ version: 'governance-recovery/1', operation, transactionDomain }),
      inputDigest: operation.requestDigest,
    },
    required:
      record.request.owner === 'internal.external-write'
        ? record.request.command.required
        : input.required,
  })
}
export function readGovernanceStanding(port: ReadPort, operation: OperationBinding) {
  const found = boundOperation(port, operation)
  if (found.kind !== 'found') return found
  const row = port.execute(
    'SELECT held_json FROM gc_operation WHERE scope_key=? AND command_owner=? AND principal_ref=? AND operation_id=? LIMIT 1',
    operationParams(operation.ref),
  ).rows[0]
  if (!row || row[0] === null) return { kind: 'unplanned' as const }
  const custody = standingCustodySchema.parse(JSON.parse(String(row[0])))
  const expected = requestFor(operation, found.record, {
    destination: custody.request.binding.destination,
    required: custody.request.required,
  })
  if (
    !equal(custody.request, expected) ||
    custody.reservationId !== standingReservationId(expected.binding, expected.required)
  )
    throw new Error('Corrupt governance standing request')
  if (
    custody.kind !== 'requested' &&
    (custody.reservation.id !== custody.reservationId ||
      !equal(custody.request, {
        binding: custody.reservation.binding,
        required: custody.reservation.required,
      }))
  )
    throw new Error('Corrupt governance standing receipt')
  return custody
}
function writeCustody(port: ParticipantPort, operation: OperationBinding, value: StandingCustody) {
  port.execute(
    'UPDATE gc_operation SET held_json=? WHERE scope_key=? AND command_owner=? AND principal_ref=? AND operation_id=?',
    [canonical(value), ...operationParams(operation.ref)],
  )
  return readGovernanceStanding(port, operation)
}
export function prepareGovernanceStanding(port: ParticipantPort, raw: StandingPlan) {
  const input = standingPlanSchema.parse(raw)
  const found = boundOperation(port, input.operation)
  if (found.kind !== 'found') return found
  if (
    found.record.request.owner === 'internal.external-write' &&
    !equal(found.record.request.command.required, input.required)
  )
    return conflict()
  const request = requestFor(input.operation, found.record, input)
  const previous = readGovernanceStanding(port, input.operation)
  if ('request' in previous) return equal(previous.request, request) ? previous : conflict()
  if (previous.kind !== 'unplanned') return previous
  const current = readScope(port, input.operation.ref.scope)
  if (
    found.record.state !== 'accepted' ||
    current?.state !== 'open' ||
    current.epoch !== found.record.epoch
  )
    return conflict()
  return writeCustody(port, input.operation, {
    kind: 'requested',
    request,
    reservationId: standingReservationId(request.binding, request.required),
  })
}
function matchedReceipt(port: ReadPort, operation: OperationBinding, raw: StandingReservation) {
  const reservation = standingReceiptSchema.parse(raw)
  const previous = readGovernanceStanding(port, operation)
  if (!('request' in previous)) return previous
  if (
    previous.reservationId !== reservation.id ||
    !equal(previous.request, { binding: reservation.binding, required: reservation.required })
  )
    return conflict()
  return { kind: 'matched' as const, previous, reservation }
}
export function recordGovernanceHeld(
  port: ParticipantPort,
  operation: OperationBinding,
  reservation: StandingReservation,
) {
  const matched = matchedReceipt(port, operation, reservation)
  if (matched.kind !== 'matched') return matched
  if (matched.previous.kind !== 'requested') return matched.previous
  return writeCustody(port, operation, {
    ...matched.previous,
    kind: 'held',
    reservation: matched.reservation,
  })
}
export function recordGovernanceSettled(
  port: ParticipantPort,
  operation: OperationBinding,
  reservation: StandingReservation,
  outcome: 'committed' | 'aborted',
) {
  const matched = matchedReceipt(port, operation, reservation)
  if (matched.kind !== 'matched') return matched
  const found = boundOperation(port, operation)
  if (found.kind !== 'found') return found
  if (found.record.state !== outcome) return conflict()
  if (matched.previous.kind === 'settled')
    return matched.previous.outcome === outcome ? matched.previous : conflict()
  return writeCustody(port, operation, {
    ...matched.previous,
    kind: 'settled',
    reservation: matched.reservation,
    outcome,
  })
}
