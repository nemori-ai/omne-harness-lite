import {
  isStandingReservation,
  type StandingDestinationResolver,
  type StandingReservation,
} from '@omne-harness/identity'
import { SettingsReferenceSchema } from '@omne-harness/settings'
import { createCatalogTerminals } from './catalog-terminals.ts'
import { canonical } from './encoding.ts'
import { catalogCaptureSchema, domainSchema } from './schema.ts'
import type { SettingsSqlTerminalOptions } from './terminal-schema.ts'

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
      let subject
      try {
        subject = catalogCaptureSchema.parse(JSON.parse(binding.targetRef))
      } catch {
        return unavailable
      }
      if (subject.tenantRef !== binding.scopeRef || canonical(subject) !== binding.targetRef)
        return unavailable
      const result = await terminals.seal({
        domain,
        principalRef: binding.principalRef,
        subject,
        operationId: binding.operationId,
        commandDigest: binding.inputDigest,
      })
      return result.kind === 'terminal'
        ? { kind: 'terminal', reservation, outcome: result.terminal.state }
        : unavailable
    },
  }
}
