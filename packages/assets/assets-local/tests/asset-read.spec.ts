import { afterEach, expect, it } from 'vitest'
import { openWorld, pinned, type World } from './world.ts'

const worlds: World[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})

it('reads the asset publication revision and rejects publishing from a stale snapshot', async () => {
  const world = await openWorld()
  worlds.push(world)
  expect(await world.owner.readAsset({ assetRef: 'asset-a' })).toEqual({ kind: 'absent' })
  await world.setup()
  const first = await world.owner.readAsset({ assetRef: 'asset-a' })
  expect(first).toMatchObject({
    kind: 'asset',
    asset: {
      assetRef: 'asset-a',
      category: 'service',
      name: 'example',
      latestVersion: '1',
      revision: 1,
    },
  })
  if (first.kind !== 'asset') throw new Error(JSON.stringify(first))
  expect(
    await world.owner.publish({
      operationId: 'publish-next',
      assetRef: 'asset-a',
      pinned: pinned('2'),
      expectedRevision: first.asset.revision,
    }),
  ).toMatchObject({ kind: 'committed', revision: 2 })
  expect(
    await world.owner.publish({
      operationId: 'publish-stale',
      assetRef: 'asset-a',
      pinned: pinned('3'),
      expectedRevision: first.asset.revision,
    }),
  ).toEqual({ kind: 'rejected', reason: 'revision_conflict' })
  expect(await world.owner.readAsset({ assetRef: 'asset-a' })).toMatchObject({
    kind: 'asset',
    asset: { latestVersion: '2', revision: 2 },
  })
  expect(await world.owner.readAsset({ assetRef: 'missing' })).toEqual({ kind: 'absent' })
  await world.owner.close()
  expect(await world.owner.readAsset({ assetRef: 'asset-a' })).toEqual({
    kind: 'rejected',
    reason: 'closing',
  })
})

it('keeps failed and misbound reads distinct from absence', async () => {
  let mode: 'throw' | 'foreign' | 'native' = 'native'
  const world = await openWorld({
    ownerWrap: storage => ({
      ...storage,
      async read(input) {
        if (mode === 'throw') throw new Error('named read transport failure')
        const result = await storage.read(input)
        if (mode === 'foreign' && result.kind === 'read') {
          return {
            ...result,
            output: {
              kind: 'asset',
              asset: {
                domain: {
                  scope: { kind: 'tenant', tenant: 'tenant-b' },
                  transactionDomain: 'assets.test',
                },
                assetRef: 'asset-a',
                category: 'service',
                name: 'example',
                latestVersion: '1',
                revision: 1,
                ownerRevision: 1,
              },
            },
          }
        }
        return result
      },
    }),
  })
  worlds.push(world)
  await world.setup()
  for (const failure of ['throw', 'foreign'] as const) {
    mode = failure
    expect(await world.owner.readAsset({ assetRef: 'asset-a' })).toEqual({
      kind: 'rejected',
      reason: 'unavailable',
    })
  }
})

it('drains an accepted read while refusing new reads during close', async () => {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const world = await openWorld({
    ownerWrap: storage => ({
      ...storage,
      async read(input) {
        const result = await storage.read(input)
        entered.resolve()
        await release.promise
        return result
      },
    }),
  })
  worlds.push(world)
  await world.setup()
  const reading = world.owner.readAsset({ assetRef: 'asset-a' })
  try {
    await entered.promise
    let closed = false
    const closing = world.owner.close().then(() => {
      closed = true
    })
    expect(await world.owner.readAsset({ assetRef: 'asset-a' })).toEqual({
      kind: 'rejected',
      reason: 'closing',
    })
    expect(closed).toBe(false)
    release.resolve()
    expect(await reading).toMatchObject({ kind: 'asset', asset: { revision: 1 } })
    await closing
    expect(closed).toBe(true)
  } finally {
    release.resolve()
  }
})
