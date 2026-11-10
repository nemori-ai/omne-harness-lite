import { expect, it } from 'vitest'
import { settingsCurrentMaterial } from '../../../src/rows/governance/settings-current-material.ts'
import { settingsSnapshotFixture } from './settings-snapshot-fixture.ts'

it('derives the same comparison basis without retaining capture identities', () => {
  const { snapshot, configuration } = settingsSnapshotFixture()
  const first = settingsCurrentMaterial(snapshot, configuration)
  const second = settingsCurrentMaterial(
    {
      ...snapshot,
      binding: { ...snapshot.binding, captureId: 'new-capture' },
    },
    configuration,
  )
  expect(first).toEqual(second)
  expect(first).toMatchObject({
    basis: { valueRevision: 0, selection: { kind: 'not-required' } },
    grants: snapshot.values.view.grants,
    sources: { sources: [] },
  })
})

it.each(['organization', 'session', 'owner'] as const)(
  'does not omit a %s source obligation',
  kind => {
    const { snapshot, configuration } = settingsSnapshotFixture()
    snapshot.values.view.sources[0]!.scope.kind = kind
    expect(settingsCurrentMaterial(snapshot, configuration)).toBeUndefined()
  },
)

it('rejects another tenant source and distinguishes absent from present values', () => {
  const { snapshot, configuration } = settingsSnapshotFixture()
  const before = settingsCurrentMaterial(snapshot, configuration)
  snapshot.values.presence = 'present'
  expect(settingsCurrentMaterial(snapshot, configuration)?.basis).not.toEqual(before?.basis)
  snapshot.values.view.sources[0]!.scope.subjectRef = 'another-tenant'
  expect(settingsCurrentMaterial(snapshot, configuration)).toBeUndefined()
})

it('tracks declaration, source grants, values and adoption independently', () => {
  const { snapshot, configuration } = settingsSnapshotFixture()
  const before = settingsCurrentMaterial(snapshot, configuration)!
  snapshot.declarationRevision += 1
  const declaration = settingsCurrentMaterial(snapshot, configuration)!
  expect(declaration.basis.declaration).not.toEqual(before.basis.declaration)
  expect(declaration.basis.policies).toEqual(before.basis.policies)
  snapshot.values.view.grants[0]!.actions = []
  const grants = settingsCurrentMaterial(snapshot, configuration)!
  expect(grants.basis.policies).not.toEqual(before.basis.policies)
  snapshot.values.view.state.revision += 1
  const values = settingsCurrentMaterial(snapshot, configuration)!
  expect(values.basis.valueRevision).toBe(1)
  expect(values.basis.policies).not.toEqual(grants.basis.policies)
  snapshot.binding.mode = 'runtime'
  expect(settingsCurrentMaterial(snapshot, configuration)?.basis.selection.kind).toBe('current')
})
