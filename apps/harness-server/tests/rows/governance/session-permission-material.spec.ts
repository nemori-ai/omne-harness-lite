import { canonicalText } from '@omne-harness/authorization'
import { expect, it } from 'vitest'
import { judgePermissionAssignment } from '@omne-harness/permissions'
import {
  sessionPermissionMaterial,
  type SessionPermissionMaterialInput,
} from '../../../src/rows/governance/session-permission-material.ts'
import { settingsSnapshotFixture } from './settings-snapshot-fixture.ts'

function input(noMapping = true): SessionPermissionMaterialInput {
  const { snapshot } = settingsSnapshotFixture()
  const { mode: _mode, target: _target, ...binding } = snapshot.binding
  const declaration = structuredClone(snapshot.declaration)
  if (noMapping) {
    declaration.settings = []
    declaration.permissions = declaration.permissions.map(p => ({ ...p, settings: null }))
  }
  const definition = declaration.permissions[0]!
  return {
    binding,
    projection: {
      binding,
      observation: {
        kind: 'available',
        declaration,
        declarationRevision: snapshot.declarationRevision,
        adoptionRevision: snapshot.adoptionRevision,
        declarationSetDigest: snapshot.declarationSetDigest,
      },
    },
    scope: {
      tenantId: binding.scope.tenantRef,
      sessionId: 'session',
      organizationId: 'organization',
      targetId: canonicalText(snapshot.binding.target),
      deploymentId: binding.scope.deploymentId,
      logicalServiceId: binding.scope.logicalServiceId,
    },
    change: {
      capabilityId: definition.capabilityId,
      enforcementKey: definition.enforcementKey,
      definition: definition.reference,
      rule: { pick: 'auto', allowedSet: null },
    },
    values: noMapping ? null : snapshot,
    organization: null,
    requiredConstraintIds: [],
    constraints: [],
  }
}

it('allows an in-bounds assignment without fabricating a Settings target for an unmapped declaration', () => {
  const value = input()
  const current = sessionPermissionMaterial(value)
  expect(current).toMatchObject({
    sources: { organization: { kind: 'absent' }, tenant: { kind: 'absent' } },
  })
  expect(
    judgePermissionAssignment({ layer: 'session', rule: value.change.rule, current }),
  ).toMatchObject({ kind: 'valid', basis: 'current-bounds' })
})

it('retains required constraints and a current capability prohibition when Settings has no mapping', () => {
  const value = input()
  const missing = { ...value, requiredConstraintIds: ['edit-policy'] }
  expect(
    judgePermissionAssignment({
      layer: 'session',
      rule: value.change.rule,
      current: sessionPermissionMaterial(missing),
    }),
  ).toMatchObject({ kind: 'unavailable', missingBasis: ['constraint/edit-policy'] })
  const current = sessionPermissionMaterial({
    ...missing,
    constraints: [
      {
        id: 'edit-policy',
        kind: 'available',
        sourceRef: 'policy',
        revision: '1',
        scope: value.scope,
        capabilityId: value.change.capabilityId,
        enforcementKey: value.change.enforcementKey,
        effect: { kind: 'prohibition' },
      },
    ],
  })
  expect(
    judgePermissionAssignment({ layer: 'session', rule: value.change.rule, current }),
  ).toMatchObject({ kind: 'denied', reason: 'active-prohibition' })
})

it('keeps mapped missing sources unavailable and permits a definite restriction', () => {
  const value = input(false)
  const current = sessionPermissionMaterial({ ...value, values: null })
  expect(current).toMatchObject({
    sources: { tenant: { kind: 'unavailable' }, organization: { kind: 'unavailable' } },
  })
  expect(
    judgePermissionAssignment({ layer: 'session', rule: value.change.rule, current }),
  ).toMatchObject({ kind: 'unavailable' })
  expect(
    judgePermissionAssignment({
      layer: 'session',
      rule: { pick: 'deny', allowedSet: null },
      current,
    }),
  ).toMatchObject({ kind: 'valid', basis: 'restrictive' })
})

it('preserves an actual tenant prohibition even if organization material is unavailable', () => {
  const value = input(false)
  const snapshot = value.values!
  if (snapshot.values.presence === 'unavailable') throw new Error('fixture values unavailable')
  snapshot.values.view.state.sources[0]!.values.push({
    itemId: snapshot.declaration.permissions[0]!.settings!.itemId,
    value: { kind: 'value', value: { pick: 'deny', allowedSet: null } },
    locked: false,
  })
  expect(
    judgePermissionAssignment({
      layer: 'session',
      rule: value.change.rule,
      current: sessionPermissionMaterial(value),
    }),
  ).toMatchObject({ kind: 'denied', reason: 'active-prohibition' })
})

it('does not borrow declaration or tenant facts from another capture or scope', () => {
  const value = input(false)
  expect(
    sessionPermissionMaterial({
      ...value,
      projection: { ...value.projection, binding: { ...value.binding, captureId: 'other' } },
    }),
  ).toBeUndefined()
  expect(
    sessionPermissionMaterial({ ...value, scope: { ...value.scope, tenantId: 'other' } }),
  ).toBeUndefined()
  const snapshot = value.values!
  expect(
    sessionPermissionMaterial({
      ...value,
      values: { ...snapshot, binding: { ...snapshot.binding, captureId: 'other' } },
    }),
  ).toMatchObject({ sources: { tenant: { kind: 'unavailable' } } })
})

it('binds no-mapping absence to the current assembly epoch', () => {
  const value = input()
  const nextBinding = { ...value.binding, epoch: 'next-epoch' }
  const before = sessionPermissionMaterial(value)!
  const after = sessionPermissionMaterial({
    ...value,
    binding: nextBinding,
    projection: { ...value.projection, binding: nextBinding },
  })!
  expect(after.sources.tenant).not.toEqual(before.sources.tenant)
})
