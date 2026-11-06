import { expect, it } from 'vitest'
import { projectPermissionSettings, type PermissionDefinition } from '@omne-harness/permissions'
import type { GovernanceDefinitionBundle } from '@omne-harness/governance-contract'
import { validateBundle } from '../src/definition.ts'
import { bundle } from './operation-world.ts'
function declaration(): GovernanceDefinitionBundle {
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
  return {
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
  }
}
it('uses the public definition validators and requires the complete permission setting projection', () => {
  const value = declaration()
  expect(validateBundle(value)).toEqual({ kind: 'valid', itemCount: 2 })
  const incomplete = structuredClone(value)
  incomplete.settings[0]!.items[0]!.default = {
    kind: 'value',
    value: { pick: 'allow', allowedSet: null },
  }
  expect(validateBundle(incomplete)).toEqual({ kind: 'conflict', reason: 'definition' })
  const renamed = structuredClone(value)
  renamed.settings[0]!.groups[0]!.description = 'Different meaning'
  expect(validateBundle(renamed)).toEqual({ kind: 'conflict', reason: 'definition' })
})
it('rejects duplicate identities, wrong origins and missing enforcement bindings', () => {
  const value = declaration()
  expect(
    validateBundle({ ...value, permissions: [...value.permissions, ...value.permissions] }),
  ).toEqual({ kind: 'conflict', reason: 'definition' })
  expect(validateBundle({ ...value, settings: [...value.settings, ...value.settings] })).toEqual({
    kind: 'conflict',
    reason: 'definition',
  })
  expect(validateBundle({ ...value, enforcementBindings: [] })).toEqual({
    kind: 'conflict',
    reason: 'definition',
  })
  const wrong = structuredClone(value)
  wrong.permissions[0]!.reference.origin = { ...bundle.origin, providerId: 'other' }
  expect(validateBundle(wrong)).toEqual({ kind: 'conflict', reason: 'definition' })
})
it('enforces cumulative item and encoded bundle budgets', () => {
  const value = declaration(),
    definition = value.settings[0]!
  const many = {
    ...value,
    settings: [
      {
        ...definition,
        items: Array.from({ length: 128 }, (_, i) => ({
          ...definition.items[0]!,
          id: 'item-' + i,
        })),
      },
    ],
  }
  expect(validateBundle(many)).toEqual({ kind: 'limited', resource: 'declaration' })
  const huge = structuredClone(value)
  huge.settings[0]!.items[0]!.valueSchema = { description: 'x'.repeat(256 * 1024) }
  expect(validateBundle(huge)).toEqual({ kind: 'limited', resource: 'declaration' })
})
