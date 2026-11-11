import { type StandingReservation } from '@omne-harness/identity'
import type { ParticipantPort } from '@omne-harness/sql-contract/worker'
import { applyOperation } from './apply-operation.ts'
import { boundOperation, sealOperation } from './operation.ts'
import type { OperationBinding, Execution } from './operation-schema.ts'
import type { AdoptionEvidence } from './adoption-schema.ts'
import { readGovernanceStanding } from './standing-custody.ts'
import { standingReceiptSchema } from './standing-schema.ts'
import { standingOperation } from './standing-routing.ts'
import { equal } from './encoding.ts'

export function applyStandingOperation(
  port: ParticipantPort,
  operation: OperationBinding,
  execution: Execution,
  evidence?: AdoptionEvidence,
) {
  const found = boundOperation(port, operation)
  if (found.kind !== 'found') return found
  if (found.record.state === 'committed' || found.record.state === 'aborted') return found
  const custody = readGovernanceStanding(port, operation)
  if (custody.kind !== 'held') return { kind: 'unavailable' as const, owner: 'identity-standing' }
  return applyOperation(port, operation, execution, evidence)
}
export function sealGovernanceStanding(
  port: ParticipantPort,
  rawReservation: StandingReservation,
  route: Readonly<{ destination: string; transactionDomain: string }>,
) {
  const unavailable = {
    kind: 'unavailable' as const,
    diagnostic: 'governance-destination-unavailable',
  }
  const parsed = standingReceiptSchema.safeParse(rawReservation)
  if (!parsed.success) return unavailable
  const reservation = parsed.data
  const operation = standingOperation(reservation, route)
  if (!operation) return unavailable
  const custody = readGovernanceStanding(port, operation)
  if (
    !('request' in custody) ||
    custody.reservationId !== reservation.id ||
    !equal(custody.request, { binding: reservation.binding, required: reservation.required })
  )
    return unavailable
  const found = sealOperation(port, operation)
  if (
    found.kind !== 'found' ||
    (found.record.state !== 'committed' && found.record.state !== 'aborted')
  )
    return unavailable
  return { kind: 'terminal' as const, reservation, outcome: found.record.state }
}
