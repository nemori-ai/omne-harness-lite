import { standingPrincipalRef, type Principal } from '@omne-harness/identity'
import { canonicalDigest } from '@omne-harness/tool'
import { createStandaloneSettingsOwner } from '@omne-harness/settings-local'
import {
  createIdentityQualifiedSettingsSources,
  SettingsSourceReferenceSchema,
  type SettingsSourceDestination,
} from '@omne-harness/settings-local/preparation'
import type { SettingDefinitions } from '@omne-harness/settings'
import type { SqlMaterialCatalog, SqlStorage } from '@omne-harness/sql-contract'
import { organizationSettingsCombination } from './organization-settings-combination.ts'

const domain = { scope: { kind: 'system' as const }, transactionDomain: 'system.settings' }

/** An address is not evidence that a target exists or that its definition is current. */
export function organizationSettingsSource(input: {
  organizationId: string
  definition: Pick<SettingDefinitions, 'providerId' | 'definitionId'>
}) {
  return SettingsSourceReferenceSchema.parse({
    domain,
    target: {
      policyId: 'independent',
      scopeRef: input.organizationId,
      targetRef: canonicalDigest({
        providerId: input.definition.providerId,
        definitionId: input.definition.definitionId,
      }),
    },
  })
}

export async function openOrganizationSettingsSources(options: {
  storage: SqlStorage
  materials: SqlMaterialCatalog
  identity: Parameters<typeof createIdentityQualifiedSettingsSources>[0]['identity']
  destination: SettingsSourceDestination
}) {
  const { participants, ...registration } = organizationSettingsCombination(options.materials)
  const registered = await options.storage.registerCombination({
    ...domain,
    ...registration,
    participants,
  })
  if (registered.kind !== 'registered')
    return { kind: 'unavailable' as const, phase: 'registration' as const }
  const sources = createIdentityQualifiedSettingsSources({
    identity: options.identity,
    backend: {
      storage: options.storage,
      domain,
      registration,
      destination: options.destination,
      access: {
        async authorize(principal, request) {
          return {
            kind: 'authorized',
            principalRef: standingPrincipalRef(principal),
            scope: domain.scope,
            target: request.source.target,
          }
        },
      },
    },
  })
  const targets = createStandaloneSettingsOwner({
    storage: options.storage,
    domain,
    ...registration,
  })
  return {
    kind: 'created' as const,
    targets,
    reservations: {
      reserve(principal: Principal, request: Parameters<typeof sources.service.reserve>[1]) {
        return principal.kind === 'acting-for-tenant'
          ? sources.service.reserve(principal, request)
          : Promise.resolve({ kind: 'rejected' as const, reason: 'forbidden' as const })
      },
      settle: sources.service.settle,
    },
    recover: sources.control.recover,
    async close() {
      await Promise.all([sources.control.close(), targets.close()])
    },
  }
}
