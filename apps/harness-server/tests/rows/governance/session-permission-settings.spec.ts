import { expect, it } from 'vitest'
import { canonicalDigest } from '@omne-harness/tool'
import type { SettingsBasis } from '@omne-harness/settings'
import { declaration } from '../../../../../packages/governance/governance-local/tests/definition-fixture.ts'
import { scope } from '../../../../../packages/governance/governance-local/tests/operation-world.ts'
import { createSessionPermissionSettingsResolver } from '../../../src/rows/governance/session-permission-settings.ts'

function fixture() {
  const bundle = declaration(),
    permission = bundle.permissions[0],
    definition = bundle.settings[0]
  if (!permission || !definition) throw new Error('Fixture mapping required')
  const target = { policyId: 'independent', scopeRef: scope.tenantRef, targetRef: 'permission' }
  const source = {
    domain: { scope: { kind: 'system' as const }, transactionDomain: 'organization-settings' },
    target: {
      policyId: 'independent',
      scopeRef: 'org_00000000000000000000000001',
      targetRef: 'permission',
    },
  }
  const view: SettingsBasis['views'][number] = {
    target,
    enabled: true,
    definition,
    definitionRef: {
      providerId: definition.providerId,
      definitionId: definition.definitionId,
      version: definition.version,
      digest: canonicalDigest(definition).slice(7),
    },
    sources: [],
    grants: [],
    state: { revision: 0, sources: [] },
  }
  const basis: SettingsBasis = {
    scopeKey: 'fixture',
    revision: '1',
    views: [view],
    completeness: 'complete',
    unavailableProviders: [],
  }
  return { bundle, permission, target, source, view, basis }
}
it('resolves the unique mapped target and the organization route without using effective values', async () => {
  const w = fixture()
  const resolve = createSessionPermissionSettingsResolver({
    read: async request => {
      expect(request).toEqual({
        deploymentRef: scope.deploymentId,
        mode: 'management',
        targets: [],
        selectionRef: null,
      })
      return w.basis
    },
    organizationSource: async input => {
      expect(input.organizationId).toBe('org_00000000000000000000000001')
      expect(input.target).toEqual(w.target)
      return w.source
    },
  })
  expect(await resolve({ scope, declaration: w.bundle, permission: w.permission })).toEqual({
    kind: 'mapped',
    target: w.target,
    source: w.source,
  })
})

it.each([
  'ambiguous',
  'wrong-tenant',
  'wrong-definition',
  'wrong-digest',
  'partial',
  'missing-route',
  'unavailable',
] as const)('does not select an unproven Settings source: %s', async scenario => {
  const w = fixture()
  const view = {
    ...w.view,
    target: scenario === 'wrong-tenant' ? { ...w.target, scopeRef: 'other-tenant' } : w.target,
    definition:
      scenario === 'wrong-definition'
        ? { ...w.view.definition, version: 'changed' }
        : w.view.definition,
    definitionRef:
      scenario === 'wrong-digest'
        ? { ...w.view.definitionRef, digest: '0'.repeat(64) }
        : w.view.definitionRef,
  }
  const basis: SettingsBasis = {
    ...w.basis,
    completeness: scenario === 'partial' ? 'partial' : 'complete',
    views:
      scenario === 'ambiguous'
        ? [view, { ...view, target: { ...w.target, targetRef: 'another-target' } }]
        : [view],
  }
  let routed = false
  const resolve = createSessionPermissionSettingsResolver({
    read: async () => {
      if (scenario === 'unavailable') throw new Error('Owner offline')
      return basis
    },
    organizationSource: async () => {
      routed = true
      return scenario === 'missing-route' ? undefined : w.source
    },
  })
  expect(await resolve({ scope, declaration: w.bundle, permission: w.permission })).toBeUndefined()
  expect(routed).toBe(scenario === 'missing-route')
})
