import {
  isQualification,
  isStandingBinding,
  standingReservationId,
  type StandingReservation,
} from '@omne-harness/identity'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { sha256Hex } from './identifiers.ts'
import { isRecord } from './worker/schema.ts'

export function requestReservation(input: unknown): StandingReservation | undefined {
  if (
    !isRecord(input) ||
    !isStandingBinding(input['binding']) ||
    !Array.isArray(input['required']) ||
    input['required'].length > 16 ||
    !input['required'].every(isQualification)
  )
    return undefined
  const source = input['binding']
  const binding = Object.freeze({
    version: source.version,
    owner: source.owner,
    operationId: source.operationId,
    principalRef: source.principalRef,
    destination: source.destination,
    scopeRef: source.scopeRef,
    targetRef: source.targetRef,
    inputDigest: source.inputDigest,
  })
  const required = Object.freeze([...new Set(input['required'])].sort())
  return Object.freeze({ id: standingReservationId(binding, required), binding, required })
}

export function reservationOperationRef(reservation: StandingReservation): string {
  const b = reservation.binding
  return sha256Hex(
    JSON.stringify([b.owner, b.scopeRef, b.targetRef, b.principalRef, b.operationId]),
  )
}

export function reservationTenant(reservation: StandingReservation): TenantId | undefined {
  const parsed = tenantCodec.parse(reservation.binding.scopeRef)
  if (!parsed.ok) return undefined
  const canonical = tenantCodec.encode(parsed.value)
  return canonical.ok && canonical.value === reservation.binding.scopeRef ? parsed.value : undefined
}
