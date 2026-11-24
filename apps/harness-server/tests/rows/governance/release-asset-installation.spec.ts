import { describe, expect, it } from 'vitest'
import type { AssetsLocal } from '@omne-harness/assets-local'
import { canonicalDigest } from '@omne-harness/tool'
import {
  installReleaseAsset,
  preinstalledTarget,
  type ReleasePublication,
} from '../../../src/rows/governance/release-asset-installation.ts'

const TENANT = 'tenant-1'
const target = preinstalledTarget('model-provider', 'openrouter', TENANT)

function publication(version: string, text = 'body'): ReleasePublication {
  const body = { text }
  return {
    assetRef: 'harness.model-provider.openrouter',
    pinned: {
      identity: { category: 'model-provider', name: 'openrouter' },
      version,
      source: 'release',
      body,
    } as never,
    publicationRef: {
      assetRef: 'harness.model-provider.openrouter',
      category: 'model-provider',
      name: 'openrouter',
      version,
      source: 'release',
      bodyDigest: canonicalDigest(body).slice(7),
    },
  }
}

type Holding = {
  assetRef: string
  state: 'held' | 'removed'
  enabled: boolean
  revision: number
  version: string
}

/** An in-memory assets library with only what installation reads and writes. */
function library(overrides: Partial<AssetsLocal> = {}) {
  const versions = new Map<string, Record<string, unknown>>()
  let assetRevision = 0
  let holding: Holding | undefined
  const writes: string[] = []
  const operations: string[] = []
  const held: unknown[] = []
  const base = {
    async readAsset() {
      return assetRevision === 0
        ? { kind: 'absent' }
        : { kind: 'asset', asset: { revision: assetRevision } }
    },
    async readVersion({ version }: { version: string }) {
      const found = versions.get(version)
      return found === undefined ? { kind: 'absent' } : { kind: 'version', version: found }
    },
    async publish(input: {
      operationId: string
      pinned: { version: string; body: unknown; source: string }
    }) {
      writes.push('publish')
      operations.push(input.operationId)
      versions.set(input.pinned.version, {
        assetRef: 'harness.model-provider.openrouter',
        category: 'model-provider',
        name: 'openrouter',
        version: input.pinned.version,
        source: input.pinned.source,
        body: input.pinned.body,
      })
      assetRevision += 1
      return { kind: 'committed' }
    },
    async readHolding() {
      return holding === undefined
        ? { kind: 'absent' }
        : {
            kind: 'holding',
            holding: { ...holding, holdingRef: target.holdingRef },
            selected: holding.state === 'removed' ? null : { version: holding.version },
          }
    },
    async hold(input: { operationId: string; assetRef: string; selection: { version: string } }) {
      writes.push('hold')
      operations.push(input.operationId)
      held.push(input)
      holding = {
        assetRef: input.assetRef,
        state: 'held',
        enabled: true,
        revision: 1,
        version: input.selection.version,
      }
      return { kind: 'committed' }
    },
    async changeHolding(input: {
      operationId: string
      change: { selection: { version: string } }
    }) {
      writes.push('select')
      operations.push(input.operationId)
      if (holding === undefined) return { kind: 'rejected', reason: 'not_found' }
      holding = {
        ...holding,
        version: input.change.selection.version,
        revision: holding.revision + 1,
      }
      return { kind: 'committed' }
    },
  }
  const owner = { ...base, ...overrides } as unknown as AssetsLocal
  return {
    owner,
    writes,
    operations,
    held,
    set holding(value: Holding | undefined) {
      holding = value
    },
    get holding() {
      return holding
    },
    seed(version: string, body: unknown) {
      versions.set(version, {
        assetRef: 'harness.model-provider.openrouter',
        category: 'model-provider',
        name: 'openrouter',
        version,
        source: 'release',
        body,
      })
      assetRevision = 1
    },
  }
}

const install = (owner: AssetsLocal, published = publication('v1'), ownerRef = 'release') =>
  installReleaseAsset({
    owner,
    tenantRef: TENANT,
    ownerRef,
    publication: published,
    target,
  })

describe('installing what a release brings into a tenant', () => {
  it('publishes, holds and pins once; a repeat writes nothing', async () => {
    const lib = library()
    expect(await install(lib.owner)).toEqual({ kind: 'ready', target })
    expect(lib.writes).toEqual(['publish', 'hold'])
    expect(await install(lib.owner)).toEqual({ kind: 'ready', target })
    expect(lib.writes).toEqual(['publish', 'hold'])
  })

  it('a version already there with other content is not the release: publication unavailable, nothing held', async () => {
    const lib = library()
    lib.seed('v1', { text: 'someone else' })
    expect(await install(lib.owner)).toEqual({ kind: 'unavailable', phase: 'publication' })
    expect(lib.writes).toEqual([])
  })

  it('a refused publication is unavailable; a revision conflict is recognised by reading the version back', async () => {
    const refused = library({
      publish: async () => ({ kind: 'rejected', reason: 'invalid_input' }) as never,
    })
    expect(await install(refused.owner)).toEqual({ kind: 'unavailable', phase: 'publication' })
    const raced = library()
    const owner = {
      ...raced.owner,
      publish: async (input: never) => {
        await raced.owner.publish(input)
        return { kind: 'rejected', reason: 'revision_conflict' } as never
      },
    } as AssetsLocal
    expect(await install(owner)).toEqual({ kind: 'ready', target })
  })

  it('a refused holding is unavailable; one that already exists is read back', async () => {
    const refused = library({
      hold: async () => ({ kind: 'rejected', reason: 'unavailable' }) as never,
    })
    expect(await install(refused.owner)).toEqual({ kind: 'unavailable', phase: 'holding' })
    const exists = library()
    const owner = {
      ...exists.owner,
      hold: async (input: never) => {
        await exists.owner.hold(input)
        return { kind: 'rejected', reason: 'holding_exists' } as never
      },
    } as AssetsLocal
    expect(await install(owner)).toEqual({ kind: 'ready', target })
  })

  it('a holding of another asset is unavailable; a removed or disabled one is inactive', async () => {
    const other = library()
    other.holding = {
      assetRef: 'someone.else',
      state: 'held',
      enabled: true,
      revision: 1,
      version: 'v1',
    }
    expect(await install(other.owner)).toEqual({ kind: 'unavailable', phase: 'holding' })
    const removed = library()
    removed.holding = {
      assetRef: 'harness.model-provider.openrouter',
      state: 'removed',
      enabled: true,
      revision: 2,
      version: 'v1',
    }
    expect(await install(removed.owner)).toEqual({ kind: 'inactive', target })
    const disabled = library()
    disabled.holding = {
      assetRef: 'harness.model-provider.openrouter',
      state: 'held',
      enabled: false,
      revision: 2,
      version: 'v1',
    }
    expect(await install(disabled.owner)).toEqual({ kind: 'inactive', target })
  })

  it('a new release version is pinned in place; a pin that does not commit is unavailable', async () => {
    const lib = library()
    await install(lib.owner)
    expect(await install(lib.owner, publication('v2', 'newer'))).toEqual({ kind: 'ready', target })
    expect(lib.holding).toMatchObject({ version: 'v2', revision: 2 })
    const stuck = library({
      changeHolding: async () => ({ kind: 'unknown', operationId: 'x' }) as never,
    })
    await install(stuck.owner)
    expect(await install(stuck.owner, publication('v2', 'newer'))).toEqual({
      kind: 'unavailable',
      phase: 'holding',
    })
  })

  it('an asset that cannot be read, or a publication whose reply is lost with nothing written, is unavailable', async () => {
    const unreadable = library({
      readAsset: async () => ({ kind: 'rejected', reason: 'unavailable' }) as never,
    })
    expect(await install(unreadable.owner)).toEqual({ kind: 'unavailable', phase: 'publication' })
    expect(unreadable.writes).toEqual([])
    const lost = library({ publish: async () => ({ kind: 'unknown', operationId: 'p' }) as never })
    expect(await install(lost.owner)).toEqual({ kind: 'unavailable', phase: 'publication' })
  })

  it('the holding lets the tenant set and clear its settings, from a source of the installing owner', async () => {
    const lib = library()
    await install(lib.owner)
    expect(lib.held).toMatchObject([
      {
        sources: [
          {
            sourceId: 'tenant',
            ownerRef: 'release',
            scope: { kind: 'tenant', subjectRef: TENANT },
          },
        ],
        grants: [{ sourceId: 'tenant', actions: ['set', 'clear'] }],
      },
    ])
  })

  it('each write has its own operation identity, the same on repeat and distinct per installing owner', async () => {
    const first = library()
    await install(first.owner)
    await install(first.owner, publication('v2', 'newer'))
    expect(first.writes).toEqual(['publish', 'hold', 'publish', 'select'])
    expect(new Set(first.operations).size).toBe(4)
    const again = library()
    await install(again.owner)
    await install(again.owner, publication('v2', 'newer'))
    expect(again.operations).toEqual(first.operations)
    const other = library()
    await install(other.owner, publication('v1'), 'another-owner')
    await install(other.owner, publication('v2', 'newer'), 'another-owner')
    expect(other.operations.filter(id => first.operations.includes(id))).toEqual([])
  })

  it('names the holding of a release asset by category and name in the tenant', () => {
    expect(target).toEqual({
      kind: 'asset',
      holdingRef: 'harness.preinstalled.model-provider.openrouter',
      scopeRef: TENANT,
    })
  })
})
