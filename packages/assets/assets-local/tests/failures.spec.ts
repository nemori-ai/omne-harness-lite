import { afterEach, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { capabilityId, pinBody, readBodyText, createCategoryRegistry } from '@omne-harness/assets'
import { createAssetsLocal } from '../src/index.ts'
import { openWorld, pinned, type World } from './world.ts'
const worlds: World[] = []
async function open(options: Parameters<typeof openWorld>[0] = {}) {
  const world = await openWorld(options)
  worlds.push(world)
  return world
}
afterEach(async () => {
  await Promise.all(worlds.splice(0).map(world => world.close()))
})
it('recovers an operation after the committed reply is lost without publishing twice', async () => {
  const world = await open({
    ownerWrap: storage => ({
      ...storage,
      async commit(input) {
        await storage.commit(input)
        throw new Error('reply lost')
      },
    }),
  })
  const input = {
    operationId: 'publish-lost',
    assetRef: 'asset-a',
    pinned: pinned(),
    expectedRevision: 0,
  }
  expect(await world.owner.publish(input)).toEqual({ kind: 'unknown', operationId: 'publish-lost' })
  expect(await world.owner.getOperation('publish-lost')).toEqual({
    kind: 'committed',
    operationId: 'publish-lost',
    revision: 1,
    changed: true,
  })
  await world.close()
  const reopened = await open({ root: world.root })
  expect(await reopened.owner.publish(input)).toEqual({
    kind: 'committed',
    operationId: 'publish-lost',
    revision: 1,
    changed: true,
  })
  expect(
    await reopened.owner.publish({
      ...input,
      operationId: 'publish-next',
      pinned: pinned('2'),
      expectedRevision: 1,
    }),
  ).toMatchObject({ kind: 'committed', revision: 2 })
})
it('derives settings from the fixed category body and ignores injected settings metadata', async () => {
  const world = await open()
  const spoof = {
    operationId: 'publish',
    assetRef: 'asset-a',
    pinned: pinned(),
    expectedRevision: 0,
    settings: { arbitrary: true },
    definition: { arbitrary: true },
  }
  expect(await world.owner.publish(spoof)).toMatchObject({ kind: 'committed' })
  const result = await world.owner.readVersion({ assetRef: 'asset-a', version: '1' })
  expect(result).toMatchObject({
    kind: 'version',
    version: { declaration: { kind: 'declared', definition: { items: [{ id: 'enabled' }] } } },
  })
  const owner = createAssetsLocal({
    storage: world.storage,
    domain: world.domain,
    ...world.combination,
    categories: createCategoryRegistry(),
  })
  expect(
    await owner.publish({
      operationId: 'unknown-category',
      assetRef: 'asset-b',
      pinned: pinned(),
      expectedRevision: 0,
    }),
  ).toEqual({ kind: 'rejected', reason: 'invalid_input' })
  await owner.close()
})
it('rejects malformed persisted body bytes instead of presenting an available version', async () => {
  const world = await open()
  await world.setup()
  await world.close()
  const database = new DatabaseSync(
    join(
      world.root,
      'domains',
      `${Buffer.from(world.domain.transactionDomain).toString('hex')}.sqlite`,
    ),
  )
  try {
    const row = database.prepare('SELECT version_key,record FROM al_versions LIMIT 1').get()
    if (typeof row?.['record'] !== 'string' || typeof row['version_key'] !== 'string')
      throw new Error('missing version')
    const version = JSON.parse(row['record'])
    version.body = { kind: 'boolean', value: 'invalid' }
    database
      .prepare('UPDATE al_versions SET record = ? WHERE version_key = ?')
      .run(JSON.stringify(version), row['version_key'])
  } finally {
    database.close()
  }
  const reopened = await open({ root: world.root })
  expect(await reopened.owner.readVersion({ assetRef: 'asset-a', version: '1' })).toEqual({
    kind: 'rejected',
    reason: 'unavailable',
  })
  expect((await reopened.capture()).kind).toBe('rolled_back')
})
it('closes admission, drains accepted calls, and leaves the shared storage available', async () => {
  const world = await open()
  const pending = world.owner.publish({
    operationId: 'publish',
    assetRef: 'asset-a',
    pinned: pinned(),
    expectedRevision: 0,
  })
  const closed = world.owner.close()
  expect(await pending).toMatchObject({ kind: 'committed' })
  await closed
  expect(await world.owner.readVersion({ assetRef: 'asset-a', version: '1' })).toEqual({
    kind: 'rejected',
    reason: 'closing',
  })
  expect((await world.capture()).kind).toBe('committed')
})

it('rejects escaping expansion before publishing an unreadable fixed body', async () => {
  const world = await open({
    config: {
      maxResponseBytes: 8 << 20,
      maxOperationResponseBytes: 16 << 20,
      groupMaxResponseReservationBytes: 32 << 20,
    },
  })
  await world.setup()
  const id = capabilityId('service', 'large')
  const parsed = readBodyText(JSON.stringify('\u0000'.repeat(200000)), {
    maxBytes: 2 << 20,
    maxDepth: 8,
    maxItems: 10,
    maxMembers: 10,
    maxStringLength: 300000,
    maxNumberLength: 100,
  })
  if (!id.ok || parsed.kind !== 'ok') throw new Error('body parsing failed')
  const result = await world.owner.publish({
    operationId: 'large',
    assetRef: 'large',
    expectedRevision: 0,
    pinned: pinBody({ identity: id.id, version: '1', source: 'owner', body: parsed.value }),
  })
  expect(result).toEqual({ kind: 'rejected', reason: 'limit_exceeded' })
  expect(await world.owner.readVersion({ assetRef: 'large', version: '1' })).toEqual({
    kind: 'absent',
  })
})
it('rejects a committed result attributed to another operation and recovers the original', async () => {
  const world = await open({
    ownerWrap: storage => ({
      ...storage,
      async commit(input) {
        const result = await storage.commit(input)
        return JSON.parse(
          JSON.stringify(result, (key, value) =>
            key === 'result' && value?.kind === 'committed'
              ? { ...value, operationId: 'other' }
              : value,
          ),
        )
      },
    }),
  })
  expect(
    await world.owner.publish({
      operationId: 'original',
      assetRef: 'asset-a',
      pinned: pinned(),
      expectedRevision: 0,
    }),
  ).toEqual({ kind: 'unknown', operationId: 'original' })
  expect(await world.owner.getOperation('original')).toMatchObject({
    kind: 'committed',
    operationId: 'original',
  })
})
