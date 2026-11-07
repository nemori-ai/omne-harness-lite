import { organizationCodec, tenantCodec } from '@omne-harness/legal-identity'
import { defineSettings, type SettingsFailure } from '@omne-harness/settings'
import { commitMaterialSchema, type CommitMaterial } from './commit-current.ts'
import type { SourceReference } from './source-retention-schema.ts'
import type { SettingsTargetProjection } from './projection.ts'
import { digest, equal } from './encoding.ts'
import type { OrganizationCurrentConfiguration } from './organization-current-schema.ts'
export type OrganizationCurrentInput = {
  source: SourceReference
  actorTenantRef: string
  projection: SettingsTargetProjection
  value: { revision: number; presence: 'absent' | 'present' }
}
export function matchesOrganizationCurrentSource(source: SourceReference, actorTenantRef: string) {
  const actor = tenantCodec.parse(actorTenantRef)
  if (!actor.ok) return false
  const organization = organizationCodec.encode(actor.value.organization)
  return (
    organization.ok &&
    source.domain.scope.kind === 'system' &&
    source.domain.transactionDomain === 'system.settings' &&
    source.target.policyId === 'independent' &&
    source.target.scopeRef === organization.value
  )
}
export function organizationCurrentMaterial(
  input: OrganizationCurrentInput,
  configuration: OrganizationCurrentConfiguration,
): CommitMaterial | SettingsFailure {
  const { source, projection, value, actorTenantRef } = input
  if (
    !matchesOrganizationCurrentSource(source, actorTenantRef) ||
    !equal(source.target, projection.target)
  )
    return { kind: 'rejected', reason: 'forbidden' }
  if (
    projection.sources.some(
      s => s.scope.kind !== 'organization' || s.scope.subjectRef !== source.target.scopeRef,
    )
  )
    return { kind: 'rejected', reason: 'unsupported' }
  const defined = defineSettings(projection.definition)
  if (
    defined.kind !== 'defined' ||
    !equal(projection.definitionRef, {
      providerId: defined.definition.providerId,
      definitionId: defined.definition.definitionId,
      version: defined.definition.version,
      digest: digest(defined.definition),
    })
  )
    return { kind: 'rejected', reason: 'definition_changed' }
  const authority = {
    ownerRef: 'settings',
    subjectRef: digest(source),
    revision: String(projection.ownerRevision),
  }
  return commitMaterialSchema.parse({
    basis: {
      protocol: 'settings-current-basis/1',
      target: source.target,
      definitionRef: projection.definitionRef,
      ownerRevision: projection.ownerRevision,
      enabled: projection.enabled,
      valueRevision: value.revision,
      sources: projection.sources,
      declaration: authority,
      selection: { kind: 'not-required', authority },
      policies: [
        {
          policyRef: 'settings.target-grants/independent',
          interpretationRef: 'settings.decide-change/1',
          revision: digest({ definition: projection.definitionRef, grants: projection.grants }),
          inputs: projection.sources.map(s => ({
            source: s,
            valueOriginRef: digest(source),
            valueRevision: String(value.revision),
            presence: value.presence,
          })),
          constraints: [],
        },
      ],
    },
    standing: {
      kind: 'identity',
      destination: configuration.destination,
      scopeRef: actorTenantRef,
      required: ['organization-settings-manage'],
    },
    sources: { route: configuration.sourceRoute, sources: [] },
    definition: projection.definition,
    grants: projection.grants,
  })
}
