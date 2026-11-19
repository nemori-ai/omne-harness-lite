import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  capabilityId,
  createCategoryPoint,
  digestBytes,
  type CategoryContribution,
  type PackageReader,
} from '@omne-harness/assets'
import type { AssetsCommitted } from '../src/index.ts'
import { createTenantPublisher } from '../src/tenant-publisher.ts'
import { openWorld, pinned, type World } from './world.ts'

const worlds: World[] = []
afterEach(async () => {
  await Promise.all(worlds.splice(0).map(world => world.close()))
})

async function open(options: Parameters<typeof openWorld>[0] & { throwing?: boolean } = {}) {
  const signals: AssetsCommitted[] = []
  const world = await openWorld({
    ...options,
    onCommitted(signal) {
      signals.push(signal)
      if (options.throwing) throw new Error('a listener failed')
    },
  })
  worlds.push(world)
  return { world, signals }
}

const publishInput = (operationId: string, version = '1', expectedRevision = 0) => ({
  operationId,
  assetRef: 'asset-a',
  pinned: pinned(version),
  expectedRevision,
})

describe('the change signal of the local assets', () => {
  it('a commit that changed something gives exactly one signal with the domain and its revision', async () => {
    const { world, signals } = await open()
    expect(await world.owner.domainRevision()).toEqual({ kind: 'domain', revision: 0 })
    expect(await world.owner.publish(publishInput('p-1'))).toMatchObject({
      kind: 'committed',
      changed: true,
    })
    expect(signals).toEqual([{ domain: world.domain, revision: 1 }])
    expect(await world.owner.domainRevision()).toEqual({ kind: 'domain', revision: 1 })
  })

  it('a commit that changed nothing gives none', async () => {
    const { world, signals } = await open()
    await world.owner.publish(publishInput('p-1'))
    expect(await world.owner.publish(publishInput('p-2', '1', 1))).toMatchObject({
      kind: 'committed',
      changed: false,
    })
    expect(signals).toHaveLength(1)
  })

  it('a refused commit gives none', async () => {
    const { world, signals } = await open()
    expect(await world.owner.publish(publishInput('p-1', '1', 5))).toEqual({
      kind: 'rejected',
      reason: 'revision_conflict',
    })
    expect(signals).toEqual([])
  })

  it('the same operation sent again answers the old receipt and gives none', async () => {
    const { world, signals } = await open()
    const first = await world.owner.publish(publishInput('p-1'))
    expect(await world.owner.publish(publishInput('p-1'))).toEqual(first)
    expect(signals).toHaveLength(1)
  })

  it('a commit whose reply is lost is unknown and gives none', async () => {
    const { world, signals } = await open({
      ownerWrap: storage => ({
        ...storage,
        async commit(input) {
          await storage.commit(input)
          throw new Error('reply lost')
        },
      }),
    })
    expect(await world.owner.publish(publishInput('p-1'))).toEqual({
      kind: 'unknown',
      operationId: 'p-1',
    })
    expect(signals).toEqual([])
  })

  it('a listener that throws does not change the outcome', async () => {
    const { world, signals } = await open({ throwing: true })
    expect(await world.owner.publish(publishInput('p-1'))).toMatchObject({
      kind: 'committed',
      changed: true,
    })
    expect(signals).toHaveLength(1)
  })

  it('a published package and a change of its holding each give one signal, the last at the readable revision', async () => {
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
    }
    const categories = createCategoryPoint()
    categories.contribute(bundle)
    const packageRoot = realpathSync(mkdtempSync(join(tmpdir(), 'assets-signal-')))
    const { world, signals } = await open({ categories, packageRoot })
    const bytes = new TextEncoder().encode('hello')
    const from: PackageReader = {
      manifest: async () => ({
        ok: { entries: [{ path: 'a.txt', bytes: bytes.length, digest: digestBytes(bytes) }] },
      }),
      open: async () => ({ ok: bytes }),
    }
    const id = capabilityId('bundle', 'docs')
    if (!id.ok) throw new Error('id')
    const publisher = createTenantPublisher(world.owner, 'tenant-a')
    const published = await publisher.publish({
      operationId: 'pkg-1',
      capability: id.id,
      content: { kind: 'directory', from },
    })
    if (published.kind !== 'published') throw new Error(JSON.stringify(published))
    const read = await world.owner.readHolding({
      holdingRef: published.holdingRef,
      scopeRef: 'tenant-a',
    })
    if (read.kind !== 'holding') throw new Error(read.kind)
    await world.owner.changeHolding({
      operationId: 'off-1',
      holdingRef: published.holdingRef,
      scopeRef: 'tenant-a',
      expectedRevision: read.holding.revision,
      change: { kind: 'setEnabled', enabled: false },
    })
    expect(signals).toHaveLength(2)
    const [first, second] = signals
    expect(first !== undefined && second !== undefined && first.revision < second.revision).toBe(
      true,
    )
    expect(await world.owner.domainRevision()).toEqual({
      kind: 'domain',
      revision: second?.revision,
    })
  })
})
