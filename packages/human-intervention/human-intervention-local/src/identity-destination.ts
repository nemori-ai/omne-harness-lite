import {
  isStandingReservation,
  type StandingDestinationResolver,
  type StandingReservation,
} from '@omne-harness/identity'
import { HitlIdentifierSchema, OperationRefSchema } from '@omne-harness/human-intervention'
import { canonical } from './encoding.ts'
import type { HitlSqlBinding } from './terminal-schema.ts'
import { createHitlSqlTerminals, type HitlSqlTerminalOptions } from './terminals.ts'

function operationBinding(reservation: StandingReservation): HitlSqlBinding | undefined {
  const binding = reservation.binding
  const operationRef = OperationRefSchema.parse(JSON.parse(binding.targetRef))
  if (
    canonical(operationRef) !== binding.targetRef ||
    operationRef.tenantRef !== binding.scopeRef ||
    operationRef.actorRef !== binding.principalRef ||
    operationRef.operationId !== binding.operationId
  )
    return undefined
  return { operationRef, inputDigest: binding.inputDigest }
}

/** Install only in Identity's trusted resolver holder. */
export function createHitlStandingDestination(
  input: HitlSqlTerminalOptions & Readonly<{ destination: string }>,
): StandingDestinationResolver {
  const destination = HitlIdentifierSchema.parse(input.destination)
  const terminals = createHitlSqlTerminals(input)
  const domain = input.domain
  return {
    async seal(reservation) {
      const unavailable = {
        kind: 'unavailable',
        diagnostic: 'hitl-destination-unavailable',
      } as const
      if (!isStandingReservation(reservation)) return unavailable
      const binding = reservation.binding
      if (
        binding.owner !== 'human-intervention' ||
        binding.destination !== destination ||
        domain.scope.kind !== 'tenant' ||
        domain.scope.tenant !== binding.scopeRef
      )
        return unavailable
      try {
        const operation = operationBinding(reservation)
        if (!operation) return unavailable
        const result = await terminals.seal(operation)
        return result.kind === 'terminal'
          ? { kind: 'terminal', reservation, outcome: result.terminal.state }
          : unavailable
      } catch {
        return unavailable
      }
    },
  }
}
