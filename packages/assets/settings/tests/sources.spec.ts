import { expect, it } from 'vitest'
import {
  SettingsSourceLayoutSchema,
  SettingsSourceIdentitiesSchema,
  settingsSourceIdentities,
} from '../src/index.ts'

const source = {
  sourceId: 'organization',
  ownerRef: 'preferences',
  scope: { kind: 'owner', subjectRef: 'account-preferences' },
  authorityRevision: 'revision-1',
}

it('preserves an explicit owner scope even when its source id names a governance layer', () => {
  expect(SettingsSourceLayoutSchema.parse([source])).toEqual([source])
})

it('rejects duplicate source identities even if their owners or subjects differ', () => {
  expect(
    SettingsSourceLayoutSchema.safeParse([
      source,
      { ...source, ownerRef: 'another-owner', scope: { kind: 'tenant', subjectRef: 'tenant-a' } },
    ]).success,
  ).toBe(false)
})

it('requires explicit ownership, scope and authority revision', () => {
  const { ownerRef: _owner, ...withoutOwner } = source
  const { scope: _scope, ...withoutScope } = source
  const { authorityRevision: _revision, ...withoutRevision } = source
  for (const input of [withoutOwner, withoutScope, withoutRevision]) {
    expect(SettingsSourceLayoutSchema.safeParse([input]).success).toBe(false)
  }
})

it('keeps precedence in supplied order and rejects values in authority metadata', () => {
  const tenant = { ...source, sourceId: 'tenant-values' }
  expect(SettingsSourceLayoutSchema.parse([tenant, source])).toEqual([tenant, source])
  expect(SettingsSourceLayoutSchema.safeParse([{ ...source, values: [] }]).success).toBe(false)
})

it('keeps authority revisions outside stable identity and rejects them in owner input', () => {
  const first = SettingsSourceLayoutSchema.parse([source])
  const refreshed = SettingsSourceLayoutSchema.parse([
    { ...source, authorityRevision: 'revision-2' },
  ])
  expect(settingsSourceIdentities(first)).toEqual(settingsSourceIdentities(refreshed))
  expect(SettingsSourceIdentitiesSchema.safeParse(first).success).toBe(false)
  const identity = settingsSourceIdentities(first)
  expect(SettingsSourceIdentitiesSchema.parse(identity)).toEqual(identity)
  identity[0]!.scope.subjectRef = 'changed'
  expect(first[0]!.scope.subjectRef).toBe('account-preferences')
})
