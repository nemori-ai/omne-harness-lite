import { expect, it } from 'vitest'
import { createSettingsRegistry } from '../src/index.ts'
const declaration = {
  providerId: 'example',
  definitionId: 'settings',
  version: '1',
  groups: [],
  items: [],
}
it('tracks assembly leases separately from declaration identity', () => {
  const registry = createSettingsRegistry({ capacity: 4 })
  const one = registry.registerContribution(declaration)
  const two = registry.registerContribution(declaration)
  if (one.kind !== 'registered' || two.kind !== 'registered')
    throw new Error('expected registration')
  const snapshot = registry.snapshot()
  expect(snapshot).toMatchObject({ revision: 1, definitions: [declaration] })
  registry.releaseContribution(one.registrationId)
  expect(registry.snapshot().revision).toBe(1)
  registry.releaseContribution(two.registrationId)
  expect(registry.snapshot()).toEqual({ revision: 2, definitions: [] })
  expect(snapshot.definitions).toEqual([declaration])
  expect(registry.registerContribution(declaration).kind).toBe('registered')
  expect(registry.snapshot().revision).toBe(3)
})
it('rejects same-version changed content even after release', () => {
  const registry = createSettingsRegistry({ capacity: 4 })
  const registered = registry.registerContribution(declaration)
  if (registered.kind !== 'registered') throw new Error('expected registration')
  registry.releaseContribution(registered.registrationId)
  expect(
    registry.registerContribution({
      ...declaration,
      groups: [
        { id: 'new', parentId: null, title: 'New', description: 'New settings group', order: 0 },
      ],
    }),
  ).toEqual({ kind: 'conflict' })
})
it('bounds retained definitions and stops registration after close', () => {
  const registry = createSettingsRegistry({ capacity: 1 })
  expect(registry.registerContribution(declaration).kind).toBe('registered')
  expect(registry.registerContribution({ ...declaration, version: '2' })).toEqual({
    kind: 'limit_exceeded',
  })
  registry.close()
  const revision = registry.snapshot().revision
  registry.close()
  expect(registry.snapshot()).toEqual({ revision, definitions: [] })
  expect(registry.registerContribution(declaration)).toEqual({ kind: 'closing' })
})
