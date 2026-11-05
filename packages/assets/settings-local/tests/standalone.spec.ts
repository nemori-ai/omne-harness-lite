import { afterEach, expect, it } from 'vitest'
import {
  createStandaloneSettingsOwner,
  settingsStandaloneMaterials,
  standaloneSettingsGuards,
} from '../src/index.ts'
import { openIdentityWorld } from './identity-world.ts'
import { definition, definitionRef } from './world.ts'
const opened: Awaited<ReturnType<typeof openIdentityWorld>>[] = []
afterEach(async () => {
  for (const world of opened.splice(0)) await world.close()
})
async function open() {
  const w = await openIdentityWorld({
    authority: { materials: settingsStandaloneMaterials(), guards: standaloneSettingsGuards },
  })
  opened.push(w)
  const owner = createStandaloneSettingsOwner(w.terminalOptions)
  const record = {
    target: w.change.target,
    definition,
    sourceIds: ['tenant'],
    grants: [
      {
        sourceId: 'tenant',
        actions: ['set', 'clear', 'lock', 'unlock'] as ('set' | 'clear' | 'lock' | 'unlock')[],
      },
    ],
  }
  return { ...w, owner, record }
}
it('uses real persistent independent ownership with genuine Identity and irreversible retirement', async () => {
  const w = await open()
  const provision = {
    kind: 'provision' as const,
    operationId: 'provision',
    expectedRevision: null,
    record: w.record,
  }
  expect(await w.owner.mutate(provision)).toMatchObject({ kind: 'committed', revision: 1 })
  expect(await w.owner.mutate(provision)).toMatchObject({ kind: 'committed', revision: 1 })
  expect(await w.backend.commit(w.principal, w.change)).toMatchObject({
    kind: 'committed',
    revision: 1,
  })
  expect(
    await w.owner.mutate({
      kind: 'retire',
      operationId: 'retire',
      target: w.change.target,
      expectedRevision: 1,
    }),
  ).toMatchObject({ kind: 'committed', revision: 2 })
  expect(
    await w.backend.commit(w.principal, {
      ...w.change,
      operationId: 'after-retire',
      expectedRevision: 1,
      action: { kind: 'clear' },
    }),
  ).toMatchObject({ kind: 'rejected', reason: 'forbidden' })
  expect(
    await w.owner.mutate({ ...provision, operationId: 'revive', expectedRevision: 2 }),
  ).toMatchObject({ kind: 'rejected', reason: 'forbidden' })
  expect(w.world.counts()).toEqual([1, 1, 1])
})
it('rejects conflicting target versions and stale editors against the real owner', async () => {
  const w = await open()
  expect(
    await w.owner.mutate({
      kind: 'provision',
      operationId: 'first',
      expectedRevision: null,
      record: w.record,
    }),
  ).toMatchObject({ kind: 'committed' })
  expect(
    await w.owner.mutate({
      kind: 'provision',
      operationId: 'conflict',
      expectedRevision: 1,
      record: {
        ...w.record,
        definition: {
          ...definition,
          groups: definition.groups.map(g => ({ ...g, title: 'changed bytes' })),
        },
      },
    }),
  ).toMatchObject({ kind: 'rejected', reason: 'definition_changed' })
  expect(
    await w.owner.mutate({
      kind: 'provision',
      operationId: 'v2',
      expectedRevision: 1,
      record: { ...w.record, definition: { ...definition, version: '2' } },
    }),
  ).toMatchObject({ kind: 'committed', revision: 2 })
  expect(await w.backend.commit(w.principal, { ...w.change, definitionRef })).toMatchObject({
    kind: 'rejected',
    reason: 'definition_changed',
  })
})
