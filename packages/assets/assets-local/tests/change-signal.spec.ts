import { afterEach, expect, it } from 'vitest'
import type { DomainChange } from '@omne-harness/settings'
import { openWorld, pinned, target, type World } from './world.ts'

const worlds: World[] = []
afterEach(async () => {
  await Promise.all(worlds.splice(0).map(world => world.close()))
})

async function listening() {
  const world = await openWorld()
  worlds.push(world)
  const changes: DomainChange<unknown>[] = []
  const stop = world.owner.changes.subscribe(change => changes.push(change))
  return { world, changes, stop }
}

it('a committed publish, hold, disable and enable each give one signal with the domain and its revision, in order', async () => {
  const { world, changes } = await listening()
  await world.setup()
  const holding = { holdingRef: target.holdingRef, scopeRef: target.scopeRef }
  const disabled = await world.owner.changeHolding({
    ...holding,
    operationId: 'disable',
    expectedRevision: 1,
    change: { kind: 'setEnabled', enabled: false },
  })
  const enabled = await world.owner.changeHolding({
    ...holding,
    operationId: 'enable',
    expectedRevision: 2,
    change: { kind: 'setEnabled', enabled: true },
  })
  expect([disabled.kind, enabled.kind]).toEqual(['committed', 'committed'])
  expect(changes.map(change => change.revision)).toEqual([1, 2, 3, 4])
  expect(new Set(changes.map(change => JSON.stringify(change.domain))).size).toBe(1)
  expect(changes[0]?.domain).toMatchObject({ scope: { kind: 'tenant', tenant: 'tenant-a' } })
  expect(await world.owner.readDomainRevision()).toEqual({ kind: 'revision', revision: 4 })
})

it('a rejected change and a change that changes nothing give no signal', async () => {
  const { world, changes } = await listening()
  await world.setup()
  const before = changes.length
  const holding = { holdingRef: target.holdingRef, scopeRef: target.scopeRef }
  const stale = await world.owner.changeHolding({
    ...holding,
    operationId: 'stale',
    expectedRevision: 9,
    change: { kind: 'setEnabled', enabled: false },
  })
  const same = await world.owner.changeHolding({
    ...holding,
    operationId: 'same',
    expectedRevision: 1,
    change: { kind: 'setEnabled', enabled: true },
  })
  const refused = await world.owner.publish({
    operationId: 'publish-conflict',
    assetRef: 'asset-a',
    pinned: pinned('1', true),
    expectedRevision: 0,
  })
  expect(stale).toEqual({ kind: 'rejected', reason: 'revision_conflict' })
  expect(same).toMatchObject({ kind: 'committed', changed: false })
  expect(refused.kind).toBe('rejected')
  expect(changes).toHaveLength(before)
})

it('the signal comes with the reply of the commit and does not wait for a read', async () => {
  const release = Promise.withResolvers<void>()
  const world = await openWorld({
    ownerWrap: storage => ({
      ...storage,
      async read(input) {
        await release.promise
        return storage.read(input)
      },
    }),
  })
  worlds.push(world)
  const changes: DomainChange<unknown>[] = []
  world.owner.changes.subscribe(change => changes.push(change))
  try {
    const published = await world.owner.publish({
      operationId: 'publish-1',
      assetRef: 'asset-a',
      pinned: pinned(),
      expectedRevision: 0,
    })
    expect(published).toMatchObject({ kind: 'committed', domainRevision: 1 })
    expect(changes.map(change => change.revision)).toEqual([1])
  } finally {
    release.resolve()
  }
})

it('repeating a committed operation gives its signal again with the revision of the original commit', async () => {
  const { world, changes } = await listening()
  await world.setup()
  const again = await world.owner.publish({
    operationId: 'publish-1',
    assetRef: 'asset-a',
    pinned: pinned(),
    expectedRevision: 0,
  })
  expect(again).toMatchObject({ kind: 'committed', changed: true, domainRevision: 1 })
  expect(changes.map(change => change.revision)).toEqual([1, 2, 1])
})

it('a commit whose result is unknown gives no signal', async () => {
  const world = await openWorld({
    ownerWrap: storage => ({
      ...storage,
      commit: async input => {
        await storage.commit(input)
        throw new Error('the reply was lost')
      },
    }),
  })
  worlds.push(world)
  const changes: unknown[] = []
  world.owner.changes.subscribe(change => changes.push(change))
  const published = await world.owner.publish({
    operationId: 'publish-1',
    assetRef: 'asset-a',
    pinned: pinned(),
    expectedRevision: 0,
  })
  expect(published).toEqual({ kind: 'unknown', operationId: 'publish-1' })
  expect(changes).toEqual([])
})

it('a listener that left gets nothing more, and a listener that throws does not stop the others or the commit', async () => {
  const { world, changes, stop } = await listening()
  const others: unknown[] = []
  world.owner.changes.subscribe(() => {
    throw new Error('a consumer failed')
  })
  world.owner.changes.subscribe(change => others.push(change))
  stop()
  await world.setup()
  expect(changes).toEqual([])
  expect(others).toHaveLength(2)
})

it('the revision of a domain nothing was committed to is zero', async () => {
  const { world } = await listening()
  expect(await world.owner.readDomainRevision()).toEqual({ kind: 'revision', revision: 0 })
})
