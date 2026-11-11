import type { AgentAdoptions } from '@omne-harness/agent-contract'
import type {
  PermissionConstraint,
  PermissionDefinition,
  PermissionScope,
} from '@omne-harness/permissions'
import { canonicalDigest } from '@omne-harness/tool'

/** The caller qualifies the original action and its adoption before requesting this projection. */
export async function readAgentPermissionConstraint<P>(input: {
  adoptions: Pick<AgentAdoptions<P>, 'resolve'>
  resolution: Parameters<AgentAdoptions<P>['resolve']>[0]
  scope: PermissionScope
  definition: PermissionDefinition
}): Promise<PermissionConstraint> {
  const adoption = structuredClone(input.resolution.adoption)
  const scope = structuredClone(input.scope)
  const definition = structuredClone(input.definition)
  const sourceRef = canonicalDigest({ owner: 'agent-definition', adoption })
  const unavailable = { id: 'agent-definition', kind: 'unavailable', sourceRef } as const
  try {
    const resolved = await input.adoptions.resolve({ ...input.resolution, adoption })
    if ('failure' in resolved) return unavailable
    const bound = resolved.ok.definition.permissionBounds?.find(
      candidate =>
        candidate.capabilityId === definition.capabilityId &&
        candidate.enforcementKey === definition.enforcementKey,
    )
    const values = definition.values.map(value => value.id)
    if (bound !== undefined && bound.allowedSet.some(value => !values.includes(value)))
      return unavailable
    return {
      id: 'agent-definition',
      kind: 'available',
      sourceRef,
      revision: canonicalDigest({ adoption, definition }),
      scope,
      capabilityId: definition.capabilityId,
      enforcementKey: definition.enforcementKey,
      effect: { kind: 'bound', allowedSet: [...(bound?.allowedSet ?? values)] },
    }
  } catch {
    return unavailable
  }
}
