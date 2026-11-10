import { expect, it } from 'vitest'
import { evaluatePermission } from '@omne-harness/permissions'
import type { SessionPermissionCurrent } from '@omne-harness/session-storage-sql/participants'
import { sessionPermissionSource } from '../../../src/rows/governance/permission-session-current.ts'
import { permissionFixture } from './permission-fixture.ts'

function fixture() {
  const w = permissionFixture()
  const request = w.action.request
  const source = { owner: 'session', record: 'permission', revision: '1', digest: 'sha256:fixture' }
  const current: SessionPermissionCurrent = {
    kind: 'current',
    tenant: request.scope.tenantId,
    session: request.scope.sessionId!,
    capabilityId: request.capabilityId,
    enforcementKey: request.enforcementKey,
    revision: '1',
    source,
    mode: {
      adopted: {
        kind: 'tenant-default',
        source: { owner: 'session', name: 'modes', revision: '1', digest: 'sha256:modes' },
      },
      override: null,
    },
    assignment: null,
  }
  return { ...w, request, session: current, source }
}

it('projects a current assignment and never interprets a Session mode as permission to override it', () => {
  const w = fixture()
  expect(sessionPermissionSource(w.session, w.request, w.released.definition)).toMatchObject({
    kind: 'absent',
  })
  w.session.assignment = {
    capabilityId: w.request.capabilityId,
    enforcementKey: w.request.enforcementKey,
    definition: w.request.definition,
    rule: { pick: 'blocked', allowedSet: null },
    source: w.source,
  }
  w.session.mode.override = { value: 'bypass-permissions', source: w.source }
  const value = sessionPermissionSource(w.session, w.request, w.released.definition)
  if (value === undefined) throw new Error('Unbound fixture')
  w.current.evaluation.sources.session = value
  expect(evaluatePermission(w.current.evaluation)).toMatchObject({
    kind: 'denied',
    reason: 'active-prohibition',
  })
})

it('retains a known outer prohibition when the current Session row still names a retired definition', () => {
  const w = fixture()
  w.pick('blocked')
  w.session.assignment = {
    capabilityId: w.request.capabilityId,
    enforcementKey: w.request.enforcementKey,
    definition: { ...w.request.definition, revision: 'retired' },
    rule: { pick: 'trusted', allowedSet: null },
    source: w.source,
  }
  const value = sessionPermissionSource(w.session, w.request, w.released.definition)
  expect(value).toMatchObject({ kind: 'unavailable' })
  if (value === undefined) throw new Error('Unbound fixture')
  w.current.evaluation.sources.session = value
  expect(evaluatePermission(w.current.evaluation)).toMatchObject({
    kind: 'denied',
    reason: 'active-prohibition',
  })
})

it('rejects a current Session fact bound to another tenant, Session or enforcement point', () => {
  const w = fixture()
  for (const patch of [
    { tenant: 'other' },
    { session: 'other' },
    { capabilityId: 'other' },
    { enforcementKey: 'other' },
  ])
    expect(
      sessionPermissionSource({ ...w.session, ...patch }, w.request, w.released.definition),
    ).toBeUndefined()
})
