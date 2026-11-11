import { expect, it } from 'vitest'
import { projectPermissionSettings } from '../src/settings.ts'
import {
  readPermissionSettingsSource,
  type PermissionSettingsSource,
} from '../src/settings-source.ts'
import { definition, scope } from './fixtures.ts'

function input(): PermissionSettingsSource {
  const projected = projectPermissionSettings(definition())
  if (projected.kind !== 'projected') throw new Error('Invalid permission fixture')
  return {
    definition: structuredClone(projected.permission),
    scope,
    layer: 'tenant',
    sourceRef: 'settings/tenant',
    revision: '1',
    observation: {
      kind: 'available',
      definition: structuredClone(projected.definition),
      descriptor: {
        sourceId: 'tenant',
        ownerRef: 'settings',
        scope: { kind: 'tenant', subjectRef: scope.tenantId },
        authorityRevision: '1',
      },
      source: {
        id: 'tenant',
        values: [
          {
            itemId: 'execute',
            value: { kind: 'value', value: { pick: 'auto', allowedSet: ['deny', 'ask'] } },
            locked: false,
          },
        ],
      },
    },
  }
}
function available() {
  const value = input()
  if (value.observation.kind !== 'available') throw new Error('Expected available fixture')
  return { value, observation: value.observation }
}
it('preserves the raw pick and bound without applying Settings override or lock semantics', () => {
  const { value, observation } = available()
  const expected = {
    kind: 'available',
    sourceRef: value.sourceRef,
    revision: '1',
    scope,
    definition: value.definition.reference,
    rule: { pick: 'auto', allowedSet: ['deny', 'ask'] },
  }
  expect(readPermissionSettingsSource(value)).toEqual(expected)
  observation.source.values[0]!.locked = true
  expect(readPermissionSettingsSource(value)).toEqual(expected)
})
it('separates verified absence from an unavailable source', () => {
  const { value, observation } = available()
  observation.source.values = []
  expect(readPermissionSettingsSource(value)).toEqual({ kind: 'absent', revision: '1' })
  observation.source.values = [{ itemId: 'execute', value: { kind: 'absent' }, locked: true }]
  expect(readPermissionSettingsSource(value)).toEqual({ kind: 'absent', revision: '1' })
  expect(readPermissionSettingsSource({ ...value, observation: { kind: 'unavailable' } })).toEqual({
    kind: 'unavailable',
    sourceRef: value.sourceRef,
  })
})
it.each(['organization', 'tenant', 'session'] as const)(
  'requires the exact %s source identity',
  layer => {
    const { value, observation } = available()
    value.layer = layer
    observation.descriptor.scope = { kind: layer, subjectRef: scope[`${layer}Id`]! }
    expect(readPermissionSettingsSource(value)).toMatchObject({ kind: 'available' })
    observation.descriptor.scope.subjectRef = 'other'
    expect(readPermissionSettingsSource(value)).toEqual({
      kind: 'invalid-input',
      reason: 'binding',
    })
  },
)
it('rejects a different source, owner layer, or unsupported assignment layer', () => {
  const { value, observation } = available()
  observation.source.id = 'other'
  expect(readPermissionSettingsSource(value)).toMatchObject({
    kind: 'invalid-input',
    reason: 'binding',
  })
  observation.source.id = 'tenant'
  observation.descriptor.scope.kind = 'owner'
  expect(readPermissionSettingsSource(value)).toMatchObject({
    kind: 'invalid-input',
    reason: 'binding',
  })
  observation.descriptor.scope.kind = 'tenant'
  value.definition.assignmentLayers = ['organization']
  expect(readPermissionSettingsSource(value)).toMatchObject({
    kind: 'invalid-input',
    reason: 'rule',
  })
})
it.each([
  null,
  { pick: 'unknown', allowedSet: null },
  { pick: 'auto', allowedSet: ['auto', 'auto'] },
])('rejects malformed or unknown permission values %j', raw => {
  const { value, observation } = available()
  observation.source.values[0]!.value = { kind: 'value', value: raw }
  expect(readPermissionSettingsSource(value)).toEqual({ kind: 'invalid-input', reason: 'rule' })
})
it('rejects duplicate assignments and mismatched Settings declaration semantics', () => {
  const { value, observation } = available()
  observation.source.values.push(structuredClone(observation.source.values[0]!))
  expect(readPermissionSettingsSource(value)).toMatchObject({
    kind: 'invalid-input',
    reason: 'rule',
  })
  observation.source.values.pop()
  observation.definition.items[0]!.default = {
    kind: 'value',
    value: { pick: 'auto', allowedSet: null },
  }
  expect(readPermissionSettingsSource(value)).toMatchObject({
    kind: 'invalid-input',
    reason: 'definition',
  })
})
it('compares Settings schema objects independently of JSON property order', () => {
  const { value, observation } = available()
  observation.definition.items[0]!.valueSchema = Object.fromEntries(
    Object.entries(observation.definition.items[0]!.valueSchema).reverse(),
  )
  expect(readPermissionSettingsSource(value)).toMatchObject({ kind: 'available' })
})
it('rejects invalid structure and invalid permission definitions before reading values', () => {
  expect(readPermissionSettingsSource(null)).toEqual({ kind: 'invalid-input', reason: 'structure' })
  const value = input()
  value.definition.values.push(structuredClone(value.definition.values[0]!))
  expect(readPermissionSettingsSource(value)).toEqual({
    kind: 'invalid-input',
    reason: 'definition',
  })
})
