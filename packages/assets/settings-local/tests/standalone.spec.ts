import { randomUUID } from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import {
  createStandaloneSettingsOwner,
  settingsStandaloneMaterials,
  standaloneSettingsPublicationCommand,
  StandalonePublicationProjectionSchema,
} from '../src/index.ts'
import { openPreparedTargetWorld } from './prepared-target-world.ts'
import { definition, definitionRef } from './world.ts'
const opened: { close(): Promise<void> }[] = []
afterEach(async () => {
  for (const world of opened.splice(0)) await world.close()
})
/** The real owner of an independent target, on the catalog of the prepared path. */
async function open() {
  const w = await openPreparedTargetWorld({ actions: ['set', 'clear', 'lock', 'unlock'] })
  opened.push(w)
  const publications = await w.register('publication', [
    ...new Set([
      ...w.ownerParticipants,
      ...settingsStandaloneMaterials().participants.map(item => item.participant),
    ]),
  ])
  return { ...w, publications }
}
async function publication(w: Awaited<ReturnType<typeof open>>, target = w.target) {
  const captureId = randomUUID()
  const result = await w.storage.commit({
    identity: {
      ...w.domain,
      operation: 'test.publication',
      protocolVersion: '2',
      operationKey: captureId,
    },
    ...w.publications,
    commands: [
      standaloneSettingsPublicationCommand({
        domain: w.domain,
        principalRef: w.context.principalRef,
        captureId,
        request: { deploymentRef: 'test', mode: 'runtime', targets: [target], selectionRef: null },
      }),
    ],
  })
  if (result.kind !== 'committed') return result
  return StandalonePublicationProjectionSchema.parse(result.responses[0]?.reply.response)
}
it('reads the current independent target revision without confusing absence, retirement or another scope', async () => {
  const w = await open()
  expect(await w.owner.readTarget(w.record.target)).toEqual({ kind: 'not_found' })
  expect(
    await w.owner.mutate({
      kind: 'provision',
      operationId: 'owner-read-create',
      expectedRevision: null,
      record: w.record,
    }),
  ).toMatchObject({ kind: 'committed', revision: 1 })
  expect(await w.owner.readTarget(w.record.target)).toMatchObject({
    kind: 'found',
    retired: false,
    projection: {
      target: w.record.target,
      definition,
      definitionRef,
      ownerRevision: 1,
      enabled: true,
    },
  })
  expect(
    await w.owner.readTarget({ ...w.record.target, scopeRef: 'another-tenant' }),
  ).toMatchObject({ kind: 'rejected', reason: 'forbidden' })
  expect(
    await w.owner.mutate({
      kind: 'retire',
      operationId: 'owner-read-retire',
      expectedRevision: 1,
      target: w.record.target,
    }),
  ).toMatchObject({ kind: 'committed', revision: 2 })
  expect(await w.owner.readTarget(w.record.target)).toMatchObject({
    kind: 'found',
    retired: true,
    projection: { target: w.record.target, ownerRevision: 2 },
  })
  await w.owner.close()
  expect(await w.owner.readTarget(w.record.target)).toMatchObject({
    kind: 'rejected',
    reason: 'closing',
  })
})
it('drains an accepted target read on close and does not report a failed read as absence', async () => {
  const w = await open()
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const owner = createStandaloneSettingsOwner({
    ...w.ownerOptions,
    storage: {
      ...w.ownerOptions.storage,
      async read(request, options) {
        const result = await w.ownerOptions.storage.read(request, options)
        entered.resolve()
        await release.promise
        return result
      },
    },
  })
  const reading = owner.readTarget(w.record.target)
  await entered.promise
  let closed = false
  const closing = owner.close().then(() => {
    closed = true
  })
  expect(await owner.readTarget(w.record.target)).toMatchObject({
    kind: 'rejected',
    reason: 'closing',
  })
  expect(closed).toBe(false)
  release.resolve()
  expect(await reading).toEqual({ kind: 'not_found' })
  await closing
  expect(closed).toBe(true)
  const failed = createStandaloneSettingsOwner({
    ...w.ownerOptions,
    storage: {
      ...w.ownerOptions.storage,
      read() {
        throw new Error('fixture read transport failure')
      },
    },
  })
  expect(await failed.readTarget(w.record.target)).toMatchObject({
    kind: 'rejected',
    reason: 'unavailable',
  })
  await failed.close()
})
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
  expect(await publication(w, { ...w.target, targetRef: 'missing' })).toMatchObject({
    kind: 'rolled_back',
  })
})
it('keeps independent ownership persistent and its retirement irreversible', async () => {
  const w = await open()
  const provision = {
    kind: 'provision' as const,
    operationId: 'provision',
    expectedRevision: null,
    record: w.record,
  }
  expect(await w.owner.mutate(provision)).toMatchObject({ kind: 'committed', revision: 1 })
  expect(await w.owner.mutate(provision)).toMatchObject({ kind: 'committed', revision: 1 })
  expect(
    await w.owner.mutate({
      kind: 'retire',
      operationId: 'retire',
      target: w.target,
      expectedRevision: 1,
    }),
  ).toMatchObject({ kind: 'committed', revision: 2 })
  expect(
    await w.owner.mutate({ ...provision, operationId: 'revive', expectedRevision: 2 }),
  ).toMatchObject({ kind: 'rejected', reason: 'forbidden' })
})
it('rejects conflicting target versions against the real owner', async () => {
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
})
