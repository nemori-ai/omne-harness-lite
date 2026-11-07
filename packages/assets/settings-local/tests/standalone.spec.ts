import { randomUUID } from 'node:crypto'
import { ownerSources } from './sources.ts'
import { afterEach, expect, it } from 'vitest'
import {
  createStandaloneSettingsOwner,
  settingsStandaloneMaterials,
  standaloneSettingsGuards,
  standaloneSettingsPublicationCommand,
  StandalonePublicationProjectionSchema,
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
    publicationRef: null,
    target: w.change.target,
    definition,
    sources: ownerSources('tenant'),
    grants: [
      {
        sourceId: 'tenant',
        actions: ['set', 'clear', 'lock', 'unlock'] as ('set' | 'clear' | 'lock' | 'unlock')[],
      },
    ],
  }
  return { ...w, owner, record }
}
async function publication(w: Awaited<ReturnType<typeof open>>, target = w.change.target) {
  const captureId = randomUUID()
  const result = await w.world.storage.commit({
    identity: {
      ...w.terminalOptions.domain,
      operation: 'test.publication',
      protocolVersion: '2',
      operationKey: captureId,
    },
    combinationVersion: w.terminalOptions.combinationVersion,
    manifestDigest: w.terminalOptions.manifestDigest,
    commands: [
      standaloneSettingsPublicationCommand({
        domain: w.terminalOptions.domain,
        principalRef: w.binding.principalRef,
        captureId,
        request: { deploymentRef: 'test', mode: 'runtime', targets: [target], selectionRef: null },
      }),
    ],
  })
  if (result.kind !== 'committed') return result
  return StandalonePublicationProjectionSchema.parse(result.responses[0]?.reply.response)
}
it('stores and clears an explicit publication reference under the existing owner revision', async () => {
  const w = await open()
  const publicationRef = {
    publisherRef: 'feature:calendar',
    definitionId: 'preferences',
    version: '1',
  }
  expect(
    await w.owner.mutate({
      kind: 'provision',
      operationId: 'bound',
      expectedRevision: null,
      record: { ...w.record, publicationRef },
    }),
  ).toMatchObject({ kind: 'committed', revision: 1 })
  expect(await publication(w)).toMatchObject({
    views: [{ publicationRef, ownerRevision: 1, definitionRef }],
  })
  expect(
    await w.owner.mutate({
      kind: 'provision',
      operationId: 'stale',
      expectedRevision: 0,
      record: { ...w.record, publicationRef: null },
    }),
  ).toMatchObject({ kind: 'rejected', reason: 'revision_conflict' })
  expect(await publication(w)).toMatchObject({ views: [{ publicationRef, ownerRevision: 1 }] })
  expect(
    await w.owner.mutate({
      kind: 'provision',
      operationId: 'cleared',
      expectedRevision: 1,
      record: { ...w.record, publicationRef: null },
    }),
  ).toMatchObject({ kind: 'committed', revision: 2 })
  expect(await publication(w)).toMatchObject({
    views: [{ publicationRef: null, ownerRevision: 2 }],
  })
  expect(await publication(w, { ...w.change.target, targetRef: 'missing' })).toMatchObject({
    kind: 'rolled_back',
  })
})
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
