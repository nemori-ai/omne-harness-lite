import { canonicalText } from '@omne-harness/authorization'
import { canonicalDigest } from '@omne-harness/tool'
import type {
  GovernanceDefinitionBinding,
  GovernanceDefinitionProjection,
} from '@omne-harness/governance-local'
import {
  readPermissionSettingsSource,
  type PermissionEvaluation,
  type PermissionScope,
  type PermissionConstraint,
  type PermissionDefinition,
  type PermissionSource,
} from '@omne-harness/permissions'
import type { GovernanceExternalWriteBasis } from '@omne-harness/governance-local'
import type { TargetSnapshot } from './target-snapshot.ts'
import type { SessionPermissionQualification } from './session-permission-qualification.ts'

export type SessionPermissionMaterialInput = Readonly<{
  binding: GovernanceDefinitionBinding
  projection: GovernanceDefinitionProjection
  scope: PermissionScope
  change: SessionPermissionQualification['change']
  values: TargetSnapshot | null
  organization: GovernanceExternalWriteBasis['source']
  requiredConstraintIds: readonly string[]
  constraints: readonly PermissionConstraint[]
}>

const sourcePolicy = 'settings-projection-only/1'
const unavailable = (layer: string): PermissionSource => ({
  kind: 'unavailable',
  sourceRef: `settings.${layer}`,
})

function definitionOf(input: SessionPermissionMaterialInput): PermissionDefinition | undefined {
  const { binding, projection, scope, change } = input
  if (
    canonicalText(binding) !== canonicalText(projection.binding) ||
    projection.observation.kind !== 'available'
  )
    return undefined
  if (
    scope.tenantId !== binding.scope.tenantRef ||
    scope.deploymentId !== binding.scope.deploymentId ||
    scope.logicalServiceId !== binding.scope.logicalServiceId
  )
    return undefined
  if (
    canonicalText(projection.observation.declaration.reference) !==
    canonicalText(binding.definition)
  )
    return undefined
  const found = projection.observation.declaration.permissions.filter(
    definition =>
      canonicalText(definition.reference) === canonicalText(change.definition) &&
      definition.capabilityId === change.capabilityId &&
      definition.enforcementKey === change.enforcementKey,
  )
  return found.length === 1 ? found[0] : undefined
}

function sameDeclaration(input: SessionPermissionMaterialInput, snapshot: TargetSnapshot): boolean {
  const observation = input.projection.observation
  return (
    observation.kind === 'available' &&
    snapshot.declarationRevision === observation.declarationRevision &&
    canonicalText(snapshot.declaration) === canonicalText(observation.declaration)
  )
}

function boundTenantValues(input: SessionPermissionMaterialInput) {
  const snapshot = input.values
  if (
    snapshot === null ||
    snapshot.binding.mode !== 'management' ||
    snapshot.values.presence === 'unavailable'
  )
    return undefined
  const { mode: _mode, target: _target, ...binding } = snapshot.binding
  if (canonicalText(binding) !== canonicalText(input.binding) || !sameDeclaration(input, snapshot))
    return undefined
  const view = snapshot.values.view
  if (
    canonicalText(view.target) !== canonicalText(snapshot.binding.target) ||
    input.scope.targetId !== canonicalText(snapshot.binding.target)
  )
    return undefined
  return view
}

function tenantSource(
  input: SessionPermissionMaterialInput,
  definition: PermissionDefinition,
): PermissionSource {
  const view = boundTenantValues(input)
  if (view === undefined) return unavailable('tenant')
  const candidates = view.sources.filter(
    source => source.scope.kind === 'tenant' && source.scope.subjectRef === input.scope.tenantId,
  )
  if (candidates.length !== 1) return unavailable('tenant')
  const descriptor = candidates[0]!
  const source = view.state.sources.find(value => value.id === descriptor.sourceId)
  if (source === undefined) return unavailable('tenant')
  const result = readPermissionSettingsSource({
    definition,
    scope: input.scope,
    layer: 'tenant',
    sourceRef: canonicalDigest({ target: view.target, descriptor }),
    revision: canonicalDigest({
      definition: view.definitionRef,
      owner: view.ownerRevision,
      state: view.state.revision,
      descriptor,
    }),
    observation: { kind: 'available', definition: view.definition, descriptor, source },
  })
  return result.kind === 'invalid-input' ? unavailable('tenant') : result
}

function organizationSource(
  input: SessionPermissionMaterialInput,
  definition: PermissionDefinition,
): PermissionSource {
  if (input.scope.organizationId === null) return { kind: 'absent', revision: 'not-applicable' }
  const snapshot = input.organization
  if (snapshot === null) return unavailable('organization')
  const candidates = snapshot.projection.sources.filter(
    source =>
      source.scope.kind === 'organization' &&
      source.scope.subjectRef === input.scope.organizationId,
  )
  if (candidates.length !== 1) return unavailable('organization')
  const descriptor = candidates[0]!
  const source = snapshot.state.sources.find(item => item.id === descriptor.sourceId)
  if (source === undefined) return unavailable('organization')
  const result = readPermissionSettingsSource({
    definition,
    scope: input.scope,
    layer: 'organization',
    sourceRef: canonicalDigest(snapshot.source),
    revision: canonicalDigest({
      state: snapshot.state.revision,
      descriptor,
      definition: snapshot.projection.definitionRef,
      owner: snapshot.projection.ownerRevision,
    }),
    observation: {
      kind: 'available',
      definition: snapshot.projection.definition,
      descriptor,
      source,
    },
  })
  return result.kind === 'invalid-input' ? unavailable('organization') : result
}

/** Joins same-capture owner facts under the local settings-projection-only/1 policy. */
export function sessionPermissionMaterial(
  input: SessionPermissionMaterialInput,
): PermissionEvaluation | undefined {
  const definition = definitionOf(input)
  if (definition === undefined || input.projection.observation.kind !== 'available')
    return undefined
  const observation = input.projection.observation
  const revision = canonicalDigest({
    policy: sourcePolicy,
    binding: input.binding,
    scope: input.scope,
    definition,
    declarationRevision: observation.declarationRevision,
  })
  const absent = { kind: 'absent' as const, revision }
  return {
    scope: input.scope,
    definition: input.change.definition,
    capabilityId: definition.capabilityId,
    enforcementKey: definition.enforcementKey,
    declaration: { kind: 'available', definition },
    sources: {
      organization: definition.settings === null ? absent : organizationSource(input, definition),
      tenant: definition.settings === null ? absent : tenantSource(input, definition),
      session: { kind: 'absent', revision: 'replaced-by-this-write' },
    },
    requiredConstraintIds: [...input.requiredConstraintIds],
    constraints: [...input.constraints],
    adoptionRevision: String(observation.adoptionRevision),
    targetRevision: revision,
  }
}
