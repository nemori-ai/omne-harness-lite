import {
  isStandingReservation,
  type StandingDestinationResolver,
  type StandingReservation,
} from '@omne-harness/identity'
import { SettingsReferenceSchema, SettingsTargetSchema } from '@omne-harness/settings'
import { createCatalogTerminals } from './catalog-terminals.ts'
import { canonical } from './encoding.ts'
import { domainSchema } from './schema.ts'
import type { SettingsSqlTerminalOptions } from './terminal-schema.ts'

/**
 * The destination of the standing reservations that a catalog capture takes. Install it with
 * Identity's resolver holder, never with a Settings client. It seals the receipt of the original
 * capture and answers its outcome.
 */
export function createSettingsCatalogDestination(
  input: SettingsSqlTerminalOptions & Readonly<{ destination: string }>,
): StandingDestinationResolver {
  const terminals = createCatalogTerminals(input)
  const domain = domainSchema.parse(input.domain)
  const destination = SettingsReferenceSchema.parse(input.destination)
  return {
    async seal(reservation: StandingReservation) {
      const unavailable = {
        kind: 'unavailable' as const,
        diagnostic: 'settings-destination-unavailable',
      }
      if (!isStandingReservation(reservation)) return unavailable
      const binding = reservation.binding
      if (
        binding.owner !== 'settings' ||
        binding.destination !== destination ||
        domain.scope.kind !== 'tenant' ||
        domain.scope.tenant !== binding.scopeRef
      )
        return unavailable
      let target
      try {
        target = SettingsTargetSchema.parse(JSON.parse(binding.targetRef))
      } catch {
        return unavailable
      }
      if (target.scopeRef !== binding.scopeRef || canonical(target) !== binding.targetRef)
        return unavailable
      const result = await terminals.seal({
        domain,
        principalRef: binding.principalRef,
        target,
        operationId: binding.operationId,
        commandDigest: binding.inputDigest,
      })
      return result.kind === 'terminal'
        ? { kind: 'terminal', reservation, outcome: result.terminal.state }
        : unavailable
    },
  }
}
