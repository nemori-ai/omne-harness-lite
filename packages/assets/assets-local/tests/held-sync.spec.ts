import { randomUUID } from 'node:crypto'
import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  capabilityId,
  createCategoryPoint,
  digestBytes,
  type CategoryContribution,
  type HeldHolding,
  type PackageReader,
} from '@omne-harness/assets'
import { createTenantPublisher } from '../src/tenant-publisher.ts'
import { grants, openWorld, pinned, type World } from './world.ts'
import { ownerSources } from './sources.ts'

const worlds: World[] = []
afterEach(async () => {
  await Promise.all(worlds.splice(0).map(world => world.close()))
})

type Options = Parameters<typeof openWorld>[0] & { onSync?: (call: number) => void }

async function open(options: Options = {}) {
  const calls: (readonly HeldHolding[])[] = []
  const missed: string[] = []
  const order: string[] = []
  const world = await openWorld({
    ...options,
    held: {
      sync(holdings) {
        calls.push(holdings)
        order.push('synced')
        options.onSync?.(calls.length)
      },
      missed: reason => void missed.push(reason),
    },
  })
  worlds.push(world)
  return { world, calls, missed, order }
}

const item = (asset: string, version: string, disabled = false) => ({
  asset,
  version,
  disabled,
  immutable: false,
  replaceLocked: false,
})

const publish = (world: World, asset: string, name: string, version = '1', revision = 0) =>
  world.owner.publish({
    operationId: `publish-${asset}-${version}`,
    assetRef: asset,
    pinned: pinned(version, false, name),
    expectedRevision: revision,
  })

const hold = (world: World, asset: string, holdingRef = `holding-${asset}`) =>
  world.owner.hold({
    operationId: `hold-${asset}`,
    holdingRef,
    scopeRef: 'tenant-a',
    assetRef: asset,
    selection: { kind: 'follow' },
    sources: ownerSources('tenant'),
    grants,
  })

const change = (
  world: World,
  operationId: string,
  expectedRevision: number,
  kind: Parameters<World['owner']['changeHolding']>[0]['change'],
  holdingRef = 'holding-asset-a',
) =>
  world.owner.changeHolding({
    operationId,
    holdingRef,
    scopeRef: 'tenant-a',
    expectedRevision,
    change: kind,
  })

describe('held.sync: everything the tenant holds, given after each change', () => {
  it('syncHeld gives everything held now, and nothing when nothing is held', async () => {
    const { world, calls } = await open()
    expect(await world.owner.syncHeld()).toBe('synced')
    expect(calls).toEqual([[]])
  })

  it('follows a holding through hold, disable, enable, a new version, a pin and removal', async () => {
    const { world, calls } = await open()
    const last = () => calls.at(-1)
    const held = (version: string, disabled = false) => [
      { category: 'service', name: 'ledger', item: item('asset-a', version, disabled) },
    ]
    await publish(world, 'asset-a', 'ledger')
    expect(last()).toEqual([])
    expect(await hold(world, 'asset-a')).toMatchObject({ kind: 'committed', changed: true })
    expect(last()).toEqual(held('1'))
    await change(world, 'disable', 1, { kind: 'setEnabled', enabled: false })
    expect(last()).toEqual(held('1', true))
    await change(world, 'enable', 2, { kind: 'setEnabled', enabled: true })
    expect(last()).toEqual(held('1'))
    await publish(world, 'asset-a', 'ledger', '2', 1)
    expect(last()).toEqual(held('2'))
    const pin = { kind: 'pinned', version: '1' } as const
    await change(world, 'pin', 3, { kind: 'selectVersion', selection: pin })
    expect(last()).toEqual(held('1'))
    await change(world, 'remove', 4, { kind: 'remove' })
    expect(last()).toEqual([])
    expect(calls).toHaveLength(7)
  })

  it('gives every holding of every category, in the order of category and name', async () => {
    const { world, calls } = await open()
    await publish(world, 'asset-b', 'beta')
    await publish(world, 'asset-a', 'alpha')
    await hold(world, 'asset-b')
    await hold(world, 'asset-a')
    expect(calls.at(-1)?.map(held => [held.category, held.name, held.item.asset])).toEqual([
      ['service', 'alpha', 'asset-a'],
      ['service', 'beta', 'asset-b'],
    ])
  })

  it('is done before the result of the commit is answered', async () => {
    const { world, order } = await open()
    await publish(world, 'asset-a', 'ledger')
    order.length = 0
    await hold(world, 'asset-a').then(() => order.push('answered'))
    expect(order).toEqual(['synced', 'answered'])
  })

  it('a commit that changed nothing, a refused one and a lost reply give no sync; recalling the lost one does', async () => {
    let lose = false
    const { world, calls } = await open({
      ownerWrap: storage => ({
        ...storage,
        async commit(input) {
          const result = await storage.commit(input)
          if (lose) throw new Error('reply lost')
          return result
        },
      }),
    })
    await publish(world, 'asset-a', 'ledger')
    await hold(world, 'asset-a')
    const before = calls.length
    const same = await change(world, 'same', 1, { kind: 'setEnabled', enabled: true })
    expect(same).toMatchObject({ kind: 'committed', changed: false })
    const stale = await change(world, 'stale', 9, { kind: 'setEnabled', enabled: false })
    expect(stale).toMatchObject({ kind: 'rejected' })
    lose = true
    const lost = await change(world, 'lost', 1, { kind: 'setEnabled', enabled: false })
    expect(lost).toEqual({ kind: 'unknown', operationId: 'lost' })
    expect(calls).toHaveLength(before)
    lose = false
    expect(await world.owner.getOperation('lost')).toMatchObject({ kind: 'committed' })
    expect(calls).toHaveLength(before + 1)
    expect(calls.at(-1)?.[0]?.item.disabled).toBe(true)
  })

  it('a sync that throws leaves the commit committed and is told as missed; the next one gives all', async () => {
    const { world, calls, missed } = await open({
      onSync: call => {
        if (call === 2) throw new Error('the registry refused')
      },
    })
    await publish(world, 'asset-a', 'ledger')
    expect(await hold(world, 'asset-a')).toMatchObject({ kind: 'committed', changed: true })
    expect(missed).toEqual(['failed'])
    await change(world, 'disable', 1, { kind: 'setEnabled', enabled: false })
    expect(missed).toEqual(['failed'])
    expect(calls.at(-1)).toEqual([
      { category: 'service', name: 'ledger', item: item('asset-a', '1', true) },
    ])
  })

  it('holdings that cannot be read are told as missed, and the commit stays committed', async () => {
    let broken = false
    const { world, calls, missed } = await open({
      ownerWrap: storage => ({
        ...storage,
        async read(input) {
          if (broken && JSON.stringify(input.input).includes('"kind":"held"'))
            throw new Error('the store is away')
          return storage.read(input)
        },
      }),
    })
    await publish(world, 'asset-a', 'ledger')
    broken = true
    const before = calls.length
    expect(await hold(world, 'asset-a')).toMatchObject({ kind: 'committed', changed: true })
    expect(calls).toHaveLength(before)
    expect(missed).toEqual(['unread'])
    expect(await world.owner.syncHeld()).toBe('missed')
  })

  it('the store reads what is held page by page: each page says where the next begins', async () => {
    const { world } = await open()
    for (const [asset, name] of [
      ['asset-a', 'alpha'],
      ['asset-b', 'beta'],
      ['asset-c', 'gamma'],
    ] as const) {
      await publish(world, asset, name)
      await hold(world, asset)
    }
    const page = async (after: string | null) => {
      const read = await world.storage.read({
        domain: world.domain,
        handler: 'assets.list',
        protocol: 'assets-local/1',
        requestKey: randomUUID(),
        input: { kind: 'held', domain: world.domain, lookup: { after, limit: 2 } },
      })
      if (read.kind !== 'read') throw new Error(JSON.stringify(read))
      return read.output as { items: { name: string }[]; next: string | null }
    }
    const first = await page(null)
    expect(first.items.map(held => held.name)).toEqual(['alpha', 'beta'])
    expect(first.next).not.toBeNull()
    const second = await page(first.next)
    expect(second.items.map(held => held.name)).toEqual(['gamma'])
    expect(second.next).toBeNull()
  })

  it('reads every page: with one holding a page, the sync still has all of them', async () => {
    const { world, calls } = await open({
      ownerWrap: storage => ({
        ...storage,
        read(input) {
          const asked = input.input as { kind?: string; lookup?: { after: string | null } }
          if (asked.kind !== 'held') return storage.read(input)
          const paged = { ...asked, lookup: { after: asked.lookup?.after ?? null, limit: 1 } }
          return storage.read({ ...input, input: paged as never })
        },
      }),
    })
    for (const [asset, name] of [
      ['asset-a', 'alpha'],
      ['asset-b', 'beta'],
      ['asset-c', 'gamma'],
    ] as const) {
      await publish(world, asset, name)
      await hold(world, asset)
    }
    expect(calls.at(-1)?.map(held => held.name)).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('a slow reading does not arrive after a later one: syncs come in the order of their commits', async () => {
    let heldReads = 0
    let firstRead: () => void = () => undefined
    const firstReadDone = new Promise<void>(resolve => (firstRead = resolve))
    let slow = false
    const { world, calls } = await open({
      ownerWrap: storage => ({
        ...storage,
        async read(input) {
          const result = await storage.read(input)
          if (!slow || (input.input as { kind?: string }).kind !== 'held') return result
          heldReads += 1
          if (heldReads > 1) return result
          firstRead()
          await new Promise(resolve => setTimeout(resolve, 60))
          return result
        },
      }),
    })
    await publish(world, 'asset-a', 'alpha')
    await publish(world, 'asset-b', 'beta')
    slow = true
    const first = hold(world, 'asset-a')
    await firstReadDone
    const second = hold(world, 'asset-b')
    await Promise.all([first, second])
    expect(calls.at(-2)?.map(held => held.name)).toEqual(['alpha'])
    expect(calls.at(-1)?.map(held => held.name)).toEqual(['alpha', 'beta'])
  })

  it('two changes at once: the last sync has both', async () => {
    const { world, calls } = await open()
    await publish(world, 'asset-a', 'alpha')
    await publish(world, 'asset-b', 'beta')
    await Promise.all([hold(world, 'asset-a'), hold(world, 'asset-b')])
    expect(calls.at(-1)?.map(held => held.name)).toEqual(['alpha', 'beta'])
  })

  it('a reading the store refuses is told as unread, and the commit stays committed', async () => {
    let refuse = false
    const { world, calls, missed } = await open({
      ownerWrap: storage => ({
        ...storage,
        async read(input) {
          const asked = input.input as { kind?: string }
          if (refuse && asked.kind === 'held')
            return {
              kind: 'unavailable',
              requestKey: input.requestKey,
              reason: 'read_failed',
              diagnostic: 'test',
            } as never
          return storage.read(input)
        },
      }),
    })
    await publish(world, 'asset-a', 'ledger')
    refuse = true
    const before = calls.length
    expect(await hold(world, 'asset-a')).toMatchObject({ kind: 'committed', changed: true })
    expect(calls).toHaveLength(before)
    expect(missed).toEqual(['unread'])
  })

  it('without a port there is nothing to tell: asking for a sync answers synced and reads nothing', async () => {
    let heldReads = 0
    const world = await openWorld({
      ownerWrap: storage => ({
        ...storage,
        read(input) {
          if ((input.input as { kind?: string }).kind === 'held') heldReads += 1
          return storage.read(input)
        },
      }),
    })
    worlds.push(world)
    expect(await world.owner.syncHeld()).toBe('synced')
    await world.setup()
    expect(heldReads).toBe(0)
  })

  it('recalling an operation that changed nothing, or was never made, tells nothing', async () => {
    const { world, calls } = await open()
    await publish(world, 'asset-a', 'ledger')
    await hold(world, 'asset-a')
    await change(world, 'same', 1, { kind: 'setEnabled', enabled: true })
    const before = calls.length
    expect(await world.owner.getOperation('same')).toMatchObject({
      kind: 'committed',
      changed: false,
    })
    expect(await world.owner.getOperation('never-made')).toEqual({ kind: 'not_found' })
    expect(
      await world.owner.recallChange({
        operationId: 'same',
        holdingRef: 'holding-asset-a',
        change: { kind: 'setEnabled', enabled: true },
      }),
    ).toMatchObject({ kind: 'committed', changed: false })
    expect(await world.owner.recallPublication('never-made')).toMatchObject({ kind: 'not_found' })
    expect(calls).toHaveLength(before)
  })

  it('recalling a change whose reply was lost tells what is held now', async () => {
    let lose = false
    const { world, calls } = await open({
      ownerWrap: storage => ({
        ...storage,
        async commit(input) {
          const result = await storage.commit(input)
          if (lose) throw new Error('reply lost')
          return result
        },
      }),
    })
    await publish(world, 'asset-a', 'ledger')
    await hold(world, 'asset-a')
    lose = true
    await change(world, 'lost', 1, { kind: 'setEnabled', enabled: false })
    lose = false
    const before = calls.length
    expect(
      await world.owner.recallChange({
        operationId: 'lost',
        holdingRef: 'holding-asset-a',
        change: { kind: 'setEnabled', enabled: false },
      }),
    ).toMatchObject({ kind: 'committed', changed: true })
    expect(calls).toHaveLength(before + 1)
    expect(calls.at(-1)?.[0]?.item.disabled).toBe(true)
  })

  it('recalling a publication whose reply was lost tells what is held now', async () => {
    const bundle: CategoryContribution = {
      display: { title: 'B', summary: 'S.' },
      contract: {
        category: 'bundle',
        schema: { kind: 'null' },
        judge: () => ({ ok: true }) as const,
        deriveDeclarations: () => ({ entries: [] }),
        references: () => [],
        layout: {
          namespace: 'bundles',
          limits: { files: 2, fileBytes: 16, totalBytes: 32 },
          inspect: async () => ({ ok: { kind: 'object', entries: [] } }),
        },
      },
      point: 'bundle.items',
    }
    const categories = createCategoryPoint()
    categories.contribute(bundle)
    const packageRoot = realpathSync(mkdtempSync(join(tmpdir(), 'assets-held-')))
    let lose = false
    const { world, calls } = await open({
      categories,
      packageRoot,
      ownerWrap: storage => ({
        ...storage,
        async commit(input) {
          const result = await storage.commit(input)
          if (lose) throw new Error('reply lost')
          return result
        },
      }),
    })
    const bytes = new TextEncoder().encode('hello')
    const from: PackageReader = {
      manifest: async () => ({
        ok: { entries: [{ path: 'a.txt', bytes: bytes.length, digest: digestBytes(bytes) }] },
      }),
      open: async () => ({ ok: bytes }),
    }
    const id = capabilityId('bundle', 'docs')
    if (!id.ok) throw new Error('id')
    lose = true
    const publisher = createTenantPublisher(world.owner, 'tenant-a')
    const lost = await publisher.publish({
      operationId: 'pkg-1',
      capability: id.id,
      content: { kind: 'directory', from },
    })
    expect(lost.kind).toBe('unknown')
    lose = false
    const before = calls.length
    expect(await world.owner.recallPublication('pkg-1')).toMatchObject({
      kind: 'published',
      changed: true,
    })
    expect(calls).toHaveLength(before + 1)
    expect(calls.at(-1)?.map(held => [held.category, held.name])).toEqual([['bundle', 'docs']])
  })

  it('a port whose missed throws does not change the outcome of the commit', async () => {
    const world = await openWorld({
      held: {
        sync() {
          throw new Error('the registry refused')
        },
        missed() {
          throw new Error('nobody listens')
        },
      },
    })
    worlds.push(world)
    expect(await publish(world, 'asset-a', 'ledger')).toMatchObject({ kind: 'committed' })
    expect(await world.owner.syncHeld()).toBe('missed')
  })
})
