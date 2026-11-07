import {
  isStandingReservation,
  type StandingDestinationResolver,
  type StandingReservation,
} from '@omne-harness/identity'
import { SettingsReferenceSchema } from '@omne-harness/settings'
import { decodeSettingsRecoveryReference } from './recovery-reference.ts'
import { attemptTerminalSchema } from './finalization-schema.ts'
import { standingReadSchema } from './preparation-custody.ts'
import type { PreparationSql } from './preparation-sql.ts'
import { equal } from './encoding.ts'
function route<Context>(
  sql: PreparationSql<Context>,
  destination: string,
  reservation: StandingReservation,
) {
  if (!isStandingReservation(reservation)) return undefined
  const outer = reservation.binding
  if (outer.owner !== 'settings' || outer.destination !== destination) return undefined
  const reference = decodeSettingsRecoveryReference(outer.targetRef)
  if (reference?.kind !== 'attempt' || reference.rootCommandDigest !== outer.inputDigest)
    return undefined
  const domain = sql.options.domain
  if (domain.scope.kind === 'tenant' && domain.scope.tenant !== outer.scopeRef) return undefined
  return {
    identity: {
      domain,
      principalRef: outer.principalRef,
      operation: { target: reference.target, operationId: reference.rootOperationId },
    },
    attemptId: outer.operationId,
    commandKind: reference.commandKind,
    commandDigest: reference.rootCommandDigest,
  }
}
export function preparationDestination<Context>(
  sql: PreparationSql<Context>,
): StandingDestinationResolver {
  const destination = SettingsReferenceSchema.parse(sql.options.destination)
  return {
    async seal(reservation) {
      const unavailable = {
        kind: 'unavailable' as const,
        diagnostic: 'settings-attempt-destination-unavailable',
      }
      try {
        const binding = route(sql, destination, reservation)
        if (binding === undefined) return unavailable
        const custody = standingReadSchema.parse(
          await sql.read({
            kind: 'standing',
            input: { identity: binding.identity, attemptId: binding.attemptId },
          }),
        )
        if (
          custody.kind === 'not_found' ||
          custody.kind === 'planned' ||
          !equal(custody.request, { binding: reservation.binding, required: reservation.required })
        )
          return unavailable
        await sql.write({ kind: 'seal', binding })
        const terminal = attemptTerminalSchema.parse(await sql.read({ kind: 'terminal', binding }))
        if (!equal(terminal.binding, binding)) return unavailable
        return { kind: 'terminal', reservation, outcome: terminal.state }
      } catch {
        return unavailable
      }
    },
  }
}
