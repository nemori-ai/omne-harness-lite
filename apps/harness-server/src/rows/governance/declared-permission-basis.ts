import type { GovernanceDefinitionRef } from '@omne-harness/governance-contract'
import type { PermissionBasisRequest, PermissionDefinition } from '@omne-harness/permissions'
import { canonicalDigest } from '@omne-harness/tool'
import { permissionBasisSchema, type PermissionBasis } from './permission-basis.ts'
import type { QualifiedOrigin } from './permission-qualification.ts'
import { sessionPermissionSource } from './permission-session-current.ts'

export type DeclaredPermission = Readonly<{
  definition: PermissionDefinition
  reference: GovernanceDefinitionRef
}>

/** The basis of a gate that no storage publishes: what it declares, the rule of the session, the bounds of the Agent. */
export function declaredPermissionBasis(
  declared: DeclaredPermission,
  request: PermissionBasisRequest,
  origin: Pick<QualifiedOrigin, 'session' | 'constraints'>,
): PermissionBasis | undefined {
  const { definition } = declared
  if (definition.settings !== null) return undefined
  const session = sessionPermissionSource(origin.session, request, definition)
  if (session === undefined) return undefined
  const revision = canonicalDigest(declared.reference)
  return permissionBasisSchema.parse({
    permission: request,
    evaluation: {
      scope: request.scope,
      definition: request.definition,
      capabilityId: request.capabilityId,
      enforcementKey: request.enforcementKey,
      declaration: { kind: 'available', definition },
      sources: {
        tenant: { kind: 'absent', revision },
        organization: { kind: 'absent', revision },
        session,
      },
      requiredConstraintIds: origin.constraints.map(constraint => constraint.id),
      constraints: origin.constraints,
      adoptionRevision: revision,
      targetRevision: revision,
    },
  })
}
