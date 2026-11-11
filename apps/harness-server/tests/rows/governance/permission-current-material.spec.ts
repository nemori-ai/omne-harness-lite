import { expect, it } from 'vitest'
import { canonicalText } from '@omne-harness/authorization'
import { evaluatePermission, type PermissionBasisRequest } from '@omne-harness/permissions'
import { permissionCurrentMaterial } from '../../../src/rows/governance/permission-current-material.ts'
import { settingsSnapshotFixture } from './settings-snapshot-fixture.ts'

function input() {
  const { snapshot } = settingsSnapshotFixture()
  snapshot.binding.mode = 'runtime'
  const definition = snapshot.declaration.permissions[0]!
  const binding = snapshot.enforcementBindings.find(
    value =>
      value.capabilityId === definition.capabilityId &&
      value.enforcementKey === definition.enforcementKey,
  )!
  const request: PermissionBasisRequest = {
    scope: {
      tenantId: snapshot.binding.scope.tenantRef,
      organizationId: 'organization',
      sessionId: null,
      targetId: canonicalText(snapshot.binding.target),
      deploymentId: snapshot.binding.scope.deploymentId,
      logicalServiceId: snapshot.binding.scope.logicalServiceId,
    },
    definition: definition.reference,
    operation: { owner: 'tool', operationId: 'call' },
    implementationRef: binding.implementationRef,
    argumentsDigest: 'a'.repeat(64),
    capabilityId: binding.capabilityId,
    enforcementKey: binding.enforcementKey,
  }
  return { snapshot, request, definition }
}
it('preserves a tenant prohibition even when organization and required constraints are unavailable', () => {
  const { snapshot, request, definition } = input()
  snapshot.values.view.state.sources[0]!.values.push({
    itemId: definition.settings!.itemId,
    value: { kind: 'value', value: { pick: 'deny', allowedSet: null } },
    locked: false,
  })
  const result = permissionCurrentMaterial(snapshot, request, ['agent.definition'])
  expect(result).toMatchObject({
    sources: { tenant: { kind: 'available' }, organization: { kind: 'unavailable' } },
    requiredConstraintIds: ['agent.definition'],
  })
  expect(evaluatePermission(result)).toMatchObject({ kind: 'denied', reason: 'active-prohibition' })
})
it('does not turn missing constraints, organization or session material into absence', () => {
  const { snapshot, request } = input()
  request.scope.sessionId = 'session'
  expect(
    evaluatePermission(permissionCurrentMaterial(snapshot, request, ['agent.definition'])),
  ).toMatchObject({
    kind: 'unavailable',
    missingBasis: ['organization', 'session', 'constraint/agent.definition'],
  })
})
it('rejects management snapshots and different execution releases', () => {
  const { snapshot, request } = input()
  snapshot.binding.mode = 'management'
  expect(permissionCurrentMaterial(snapshot, request, [])).toBeUndefined()
  snapshot.binding.mode = 'runtime'
  expect(
    permissionCurrentMaterial(snapshot, { ...request, implementationRef: 'other-release' }, []),
  ).toBeUndefined()
})
