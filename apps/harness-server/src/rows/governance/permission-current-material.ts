import { canonicalText } from '@omne-harness/authorization'
import { canonicalDigest } from '@omne-harness/tool'
import {
  PermissionEvaluationSchema,
  readPermissionSettingsSource,
  type PermissionBasisRequest,
  type PermissionEvaluation,
  type PermissionSource,
} from '@omne-harness/permissions'
import type { TargetSnapshot } from './target-snapshot.ts'
import type { PermissionTargetSnapshot } from './unmapped-permission-snapshot.ts'

function tenantSource(
  snapshot: TargetSnapshot,
  request: PermissionBasisRequest,
  definition: Extract<PermissionEvaluation['declaration'], { kind: 'available' }>['definition'],
): PermissionSource {
  if (snapshot.values.presence === 'unavailable')
    return { kind: 'unavailable', sourceRef: 'settings.tenant' }
  const { view } = snapshot.values
  const descriptors = view.sources.filter(
    source => source.scope.kind === 'tenant' && source.scope.subjectRef === request.scope.tenantId,
  )
  if (descriptors.length !== 1) return { kind: 'unavailable', sourceRef: 'settings.tenant' }
  const descriptor = descriptors[0]!
  const source = view.state.sources.find(source => source.id === descriptor.sourceId)
  if (source === undefined) return { kind: 'unavailable', sourceRef: 'settings.tenant' }
  const result = readPermissionSettingsSource({
    definition,
    scope: request.scope,
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
  return result.kind === 'invalid-input'
    ? { kind: 'unavailable', sourceRef: 'settings.tenant' }
    : result
}

function runtimeScopeMatches(snapshot: PermissionTargetSnapshot, request: PermissionBasisRequest) {
  const { binding } = snapshot
  if (
    binding.mode !== 'runtime' ||
    ('values' in snapshot && !snapshot.values.view.enabled) ||
    request.scope.tenantId !== binding.scope.tenantRef ||
    request.scope.targetId !== canonicalText(binding.target) ||
    request.scope.deploymentId !== binding.scope.deploymentId ||
    request.scope.logicalServiceId !== binding.scope.logicalServiceId
  )
    return false
  return true
}

function currentDefinition(snapshot: PermissionTargetSnapshot, request: PermissionBasisRequest) {
  const definitions = snapshot.declaration.permissions.filter(
    definition => canonicalText(definition.reference) === canonicalText(request.definition),
  )
  if (
    definitions.length !== 1 ||
    !snapshot.enforcementBindings.some(
      binding =>
        binding.implementationRef === request.implementationRef &&
        binding.capabilityId === request.capabilityId &&
        binding.enforcementKey === request.enforcementKey,
    )
  )
    return undefined
  const definition = definitions[0]!
  if ((definition.settings === null) !== !('values' in snapshot)) return undefined
  if (
    definition.capabilityId !== request.capabilityId ||
    definition.enforcementKey !== request.enforcementKey
  )
    return undefined
  return definition
}

/** Joins owner-produced facts. Required constraints come from assembly, never the action caller. */
export function permissionCurrentMaterial(
  snapshot: PermissionTargetSnapshot,
  request: PermissionBasisRequest,
  requiredConstraintIds: readonly string[],
): PermissionEvaluation | undefined {
  if (!runtimeScopeMatches(snapshot, request)) return undefined
  const definition = currentDefinition(snapshot, request)
  if (definition === undefined) return undefined
  return PermissionEvaluationSchema.parse({
    scope: request.scope,
    definition: request.definition,
    capabilityId: request.capabilityId,
    enforcementKey: request.enforcementKey,
    declaration: { kind: 'available', definition },
    sources: {
      tenant:
        'values' in snapshot
          ? tenantSource(snapshot, request, definition)
          : { kind: 'absent', revision: String(snapshot.ownerRevision) },
      organization:
        request.scope.organizationId === null
          ? { kind: 'absent', revision: 'not-applicable' }
          : { kind: 'unavailable', sourceRef: 'settings.organization' },
      session:
        request.scope.sessionId === null
          ? { kind: 'absent', revision: 'not-applicable' }
          : { kind: 'unavailable', sourceRef: 'settings.session' },
    },
    requiredConstraintIds,
    constraints: requiredConstraintIds.map(id => ({ id, kind: 'unavailable', sourceRef: id })),
    adoptionRevision: String(snapshot.adoptionRevision),
    targetRevision: canonicalDigest({
      definition: snapshot.declaration.reference,
      declaration: snapshot.declarationRevision,
      owner: 'values' in snapshot ? snapshot.values.view.ownerRevision : snapshot.ownerRevision,
    }),
  })
}
