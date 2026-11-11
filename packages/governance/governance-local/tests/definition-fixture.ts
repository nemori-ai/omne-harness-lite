import { projectPermissionSettings, type PermissionDefinition } from '@omne-harness/permissions'
import type { GovernanceDefinitionBundle } from '@omne-harness/governance-contract'
import { bundle } from './operation-world.ts'
export function declaration(): GovernanceDefinitionBundle {
  const permission: PermissionDefinition = {
    reference: { origin: bundle.origin, itemId: 'schedule.create', revision: '1' },
    capabilityId: 'schedule',
    enforcementKey: 'create',
    title: 'Create schedule',
    description: 'Allow creation of a schedule',
    approvalEffect: 'Creation is permitted at the next command boundary',
    supportedScopes: [{ kind: 'one-time-call', description: 'Original call only' }],
    assignmentLayers: ['tenant'],
    values: [
      { id: 'allow', title: 'Allow', description: 'Permit creation', permitsOperation: true },
      { id: 'deny', title: 'Deny', description: 'Refuse creation', permitsOperation: false },
    ],
    comparison: null,
    defaultRule: { pick: 'deny', allowedSet: null },
    settings: {
      providerId: 'example',
      definitionId: 'permissions',
      version: '1',
      itemId: 'schedule-create',
      groupId: 'permissions',
      groupTitle: 'Permissions',
      groupDescription: 'Execution permissions',
    },
  }
  const projection = projectPermissionSettings(permission)
  if (projection.kind !== 'projected') throw new Error('Invalid test permission')
  return structuredClone({
    ...bundle,
    settings: [projection.definition],
    permissions: [permission],
    enforcementBindings: [
      {
        capabilityId: 'schedule',
        enforcementKey: 'create',
        implementationRef: 'schedule/1',
        action: 'create',
        interpretationRef: 'schedule-policy/1',
      },
    ],
  })
}
