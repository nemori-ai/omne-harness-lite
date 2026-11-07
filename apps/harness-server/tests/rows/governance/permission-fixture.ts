import type { PermissionCurrentBasis } from '@omne-harness/permissions'
import type { PermissionAction } from '../../../src/rows/governance/permission-interpreter.ts'
import {
  PERMISSION_INTERPRETATION,
  type PermissionInterpretation,
} from '../../../src/rows/governance/permission-interpretation.ts'

function fixtureInterpretation(): PermissionInterpretation {
  return {
    binding: {
      capabilityId: 'commands',
      enforcementKey: 'commands.run',
      implementationRef: 'shell-release/1',
      action: 'run',
      interpretationRef: PERMISSION_INTERPRETATION,
    },
    definition: {
      reference: {
        origin: { kind: 'independent', providerId: 'commands', definitionRef: 'release/1' },
        itemId: 'execute',
        revision: '1',
      },
      capabilityId: 'commands',
      enforcementKey: 'commands.run',
      title: 'Commands',
      description: 'Controls command execution',
      approvalEffect: 'Permit the original command',
      supportedScopes: [{ kind: 'one-time-call', description: 'Only the original call' }],
      assignmentLayers: ['organization', 'tenant', 'session'],
      values: [
        { id: 'blocked', title: 'Blocked', description: 'No execution', permitsOperation: false },
        {
          id: 'review',
          title: 'Review',
          description: 'Human approval required',
          permitsOperation: true,
        },
        {
          id: 'trusted',
          title: 'Trusted',
          description: 'No human approval required',
          permitsOperation: true,
        },
      ],
      comparison: null,
      defaultRule: { pick: 'review', allowedSet: null },
      settings: null,
    },
    effects: [
      { value: 'blocked', effect: 'deny' },
      { value: 'review', effect: 'need-decision' },
      { value: 'trusted', effect: 'allow' },
    ],
  }
}

export function permissionFixture(released = fixtureInterpretation()) {
  const action: PermissionAction = {
    binding: structuredClone(released.binding),
    request: {
      scope: {
        tenantId: 'tenant-a',
        targetId: 'target-a',
        organizationId: 'organization-a',
        sessionId: 'session-a',
        deploymentId: 'local',
        logicalServiceId: 'harness',
      },
      operation: { owner: 'agent', operationId: 'action-1' },
      implementationRef: released.binding.implementationRef,
      argumentsDigest: 'a'.repeat(64),
      capabilityId: released.binding.capabilityId,
      enforcementKey: released.binding.enforcementKey,
      definition: structuredClone(released.definition.reference),
    },
  }
  const current: PermissionCurrentBasis = {
    kind: 'current',
    request: structuredClone(action.request),
    evaluation: {
      scope: structuredClone(action.request.scope),
      definition: structuredClone(released.definition.reference),
      capabilityId: released.binding.capabilityId,
      enforcementKey: released.binding.enforcementKey,
      declaration: { kind: 'available', definition: structuredClone(released.definition) },
      sources: {
        organization: { kind: 'absent', revision: '1' },
        tenant: { kind: 'absent', revision: '1' },
        session: { kind: 'absent', revision: '1' },
      },
      requiredConstraintIds: [],
      constraints: [],
      adoptionRevision: '1',
      targetRevision: '1',
    },
  }
  function pick(value: string) {
    current.evaluation.sources.tenant = {
      kind: 'available',
      sourceRef: 'tenant-settings',
      revision: '2',
      scope: structuredClone(action.request.scope),
      definition: structuredClone(action.request.definition),
      rule: { pick: value, allowedSet: null },
    }
  }
  return { released, action, current, pick }
}
