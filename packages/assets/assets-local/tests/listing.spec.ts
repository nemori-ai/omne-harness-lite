import { afterEach, describe, expect, it } from 'vitest'
import {
  capabilityId,
  listAssets,
  pinBody,
  readBodyText,
  type CapabilityId,
} from '@omne-harness/assets'
import { tenantLayerSource } from '../src/index.ts'
import { ownerSources } from './sources.ts'
import { lookupOf } from './lookup.ts'
import { grants, openWorld, type World } from './world.ts'

const categories = lookupOf(
  ...['service', 'gadget'].map(category => ({
    category,
    schema: { kind: 'null' } as const,
    judge: () => ({ ok: true }) as const,
    deriveDeclarations: () => ({ entries: [] }),
    references: () => [],
  })),
)

const worlds: World[] = []
afterEach(async () => {
  await Promise.all(worlds.splice(0).map(world => world.close()))
})

async function open(options: Parameters<typeof openWorld>[0] = {}) {
  const world = await openWorld({ categories, ...options })
  worlds.push(world)
  return world
}

function id(category: string, name: string): CapabilityId {
  const made = capabilityId(category, name)
  if (!made.ok) throw new Error('invalid fixture')
  return made.id
}

function body(version: string) {
  const read = readBodyText(JSON.stringify({ version }), {
    maxBytes: 1000,
    maxDepth: 8,
    maxItems: 100,
    maxMembers: 100,
    maxStringLength: 100,
    maxNumberLength: 100,
  })
  if (read.kind !== 'ok') throw new Error('invalid fixture')
  return read.value
}

async function publish(world: World, category: string, name: string, version = '1') {
  const assetRef = `${category}/${name}`
  const current = await world.owner.readAsset({ assetRef })
  const published = await world.owner.publish({
    operationId: `publish-${assetRef}-${version}`,
    assetRef,
    pinned: pinBody({
      identity: id(category, name),
      version,
      source: 'source',
      body: body(version),
    }),
    expectedRevision: current.kind === 'asset' ? current.asset.revision : 0,
  })
  if (published.kind !== 'committed') throw new Error(JSON.stringify(published))
  return assetRef
}

async function hold(
  world: World,
  category: string,
  name: string,
  selection: { kind: 'follow' } | { kind: 'pinned'; version: string } = { kind: 'follow' },
) {
  const assetRef = `${category}/${name}`
  const held = await world.owner.hold({
    operationId: `hold-${assetRef}`,
    holdingRef: `holding-${category}-${name}`,
    scopeRef: 'tenant-a',
    assetRef,
    selection,
    sources: ownerSources('tenant'),
    grants,
  })
  if (held.kind !== 'committed') throw new Error(JSON.stringify(held))
  return `holding-${category}-${name}`
}

async function change(
  world: World,
  holdingRef: string,
  change: { kind: 'remove' } | { kind: 'setEnabled'; enabled: boolean },
) {
  const read = await world.owner.readHolding({ holdingRef, scopeRef: 'tenant-a' })
  if (read.kind !== 'holding') throw new Error(JSON.stringify(read))
  const changed = await world.owner.changeHolding({
    operationId: `change-${holdingRef}-${change.kind}`,
    holdingRef,
    scopeRef: 'tenant-a',
    expectedRevision: read.holding.revision,
    change,
  })
  if (changed.kind !== 'committed') throw new Error(JSON.stringify(changed))
}

async function held(world: World, category: string, names: readonly string[]) {
  for (const name of names) {
    await publish(world, category, name)
    await hold(world, category, name)
  }
}

function listed(
  category: string,
  name: string,
  extra: { version?: string; selection?: 'follow' | 'pinned'; enabled?: boolean } = {},
) {
  return {
    category,
    name,
    assetRef: `${category}/${name}`,
    version: extra.version ?? '1',
    holdingRef: `holding-${category}-${name}`,
    selection: extra.selection ?? 'follow',
    enabled: extra.enabled ?? true,
    origin: 'official',
    summary: null,
  }
}

describe('listHeld: one category of the held assets, page by page', () => {
  it('reads one category in pages, in name order, nothing repeated or lost', async () => {
    const world = await open()
    await held(world, 'service', ['delta', 'alpha', 'echo', 'charlie', 'bravo'])
    await held(world, 'gadget', ['alpha', 'zulu'])
    const first = await world.owner.listHeld({ category: 'service', after: null, limit: 2 })
    expect(first).toEqual({
      kind: 'page',
      items: [listed('service', 'alpha'), listed('service', 'bravo')],
      next: 'bravo',
    })
    const second = await world.owner.listHeld({ category: 'service', after: 'bravo', limit: 2 })
    expect(second).toEqual({
      kind: 'page',
      items: [listed('service', 'charlie'), listed('service', 'delta')],
      next: 'delta',
    })
    const third = await world.owner.listHeld({ category: 'service', after: 'delta', limit: 2 })
    expect(third).toEqual({ kind: 'page', items: [listed('service', 'echo')], next: null })
    expect(await world.owner.listHeld({ category: 'gadget', after: null, limit: 10 })).toEqual({
      kind: 'page',
      items: [listed('gadget', 'alpha'), listed('gadget', 'zulu')],
      next: null,
    })
  })

  it('a page that ends exactly at the last holding has no next page', async () => {
    const world = await open()
    await held(world, 'service', ['alpha', 'bravo'])
    expect(await world.owner.listHeld({ category: 'service', after: null, limit: 2 })).toEqual({
      kind: 'page',
      items: [listed('service', 'alpha'), listed('service', 'bravo')],
      next: null,
    })
  })

  it('includes a disabled holding and leaves out a removed one', async () => {
    const world = await open()
    await held(world, 'service', ['alpha', 'bravo', 'charlie'])
    await change(world, 'holding-service-alpha', { kind: 'setEnabled', enabled: false })
    await change(world, 'holding-service-bravo', { kind: 'remove' })
    expect(await world.owner.listHeld({ category: 'service', after: null, limit: 10 })).toEqual({
      kind: 'page',
      items: [listed('service', 'alpha', { enabled: false }), listed('service', 'charlie')],
      next: null,
    })
  })

  it('a pinned holding lists its pinned version, a following one the latest', async () => {
    const world = await open()
    for (const name of ['alpha', 'bravo']) {
      await publish(world, 'service', name, '1')
      await publish(world, 'service', name, '2')
    }
    await hold(world, 'service', 'alpha', { kind: 'pinned', version: '1' })
    await hold(world, 'service', 'bravo')
    expect(await world.owner.listHeld({ category: 'service', after: null, limit: 10 })).toEqual({
      kind: 'page',
      items: [
        listed('service', 'alpha', { version: '1', selection: 'pinned' }),
        listed('service', 'bravo', { version: '2' }),
      ],
      next: null,
    })
  })

  it('a domain with no records yet answers an empty last page', async () => {
    const world = await open()
    expect(await world.owner.listHeld({ category: 'service', after: null, limit: 10 })).toEqual({
      kind: 'page',
      items: [],
      next: null,
    })
  })

  it.each([
    ['limit 0', { category: 'service', after: null, limit: 0 }],
    ['limit 101', { category: 'service', after: null, limit: 101 }],
    ['limit 1.5', { category: 'service', after: null, limit: 1.5 }],
    ['an empty category', { category: '', after: null, limit: 10 }],
    ['a cursor that cannot be a name', { category: 'service', after: '"quoted"', limit: 10 }],
  ])('%s is invalid input', async (_what, request) => {
    const world = await open()
    expect(await world.owner.listHeld(request)).toEqual({
      kind: 'rejected',
      reason: 'invalid_input',
    })
  })

  it.each([1, 100])('limit %s is accepted', async limit => {
    const world = await open()
    expect(await world.owner.listHeld({ category: 'service', after: null, limit })).toMatchObject({
      kind: 'page',
    })
  })

  it('a storage that cannot be read answers unavailable, not an empty page', async () => {
    const world = await open({
      ownerWrap: storage => ({
        ...storage,
        read: () => Promise.reject(new Error('named read transport failure')),
      }),
    })
    expect(await world.owner.listHeld({ category: 'service', after: null, limit: 10 })).toEqual({
      kind: 'rejected',
      reason: 'unavailable',
    })
  })

  it('a request for another domain is refused', async () => {
    const world = await open({
      ownerWrap: storage => ({
        ...storage,
        read: input =>
          storage.read({
            ...input,
            input: {
              ...(input.input as object),
              domain: { ...input.domain, scope: { kind: 'tenant', tenant: 'tenant-b' } },
            },
          }),
      }),
    })
    await held(world, 'service', ['alpha'])
    expect(await world.owner.listHeld({ category: 'service', after: null, limit: 10 })).toEqual({
      kind: 'rejected',
      reason: 'forbidden',
    })
  })
})

describe('tenantLayerSource: the tenant layer of the asset layers', () => {
  it('a held asset is one candidate that is not disabled', async () => {
    const world = await open()
    await held(world, 'service', ['alpha'])
    expect(await tenantLayerSource(world.owner).candidates(id('service', 'alpha'))).toEqual({
      layer: 'tenant',
      state: 'read',
      candidates: [
        {
          asset: 'service/alpha',
          version: '1',
          disabled: false,
          immutable: false,
          replaceLocked: false,
        },
      ],
    })
  })

  it('a disabled holding is one disabled candidate', async () => {
    const world = await open()
    await held(world, 'service', ['alpha'])
    await change(world, 'holding-service-alpha', { kind: 'setEnabled', enabled: false })
    expect(await tenantLayerSource(world.owner).candidates(id('service', 'alpha'))).toEqual({
      layer: 'tenant',
      state: 'read',
      candidates: [
        {
          asset: 'service/alpha',
          version: '1',
          disabled: true,
          immutable: false,
          replaceLocked: false,
        },
      ],
    })
  })

  it('a capability that is not held has no candidates', async () => {
    const world = await open()
    await held(world, 'service', ['alpha'])
    await publish(world, 'service', 'bravo')
    const source = tenantLayerSource(world.owner)
    for (const name of ['bravo', 'charlie'])
      expect(await source.candidates(id('service', name))).toEqual({
        layer: 'tenant',
        state: 'read',
        candidates: [],
      })
    expect(await source.candidates(id('gadget', 'alpha'))).toEqual({
      layer: 'tenant',
      state: 'read',
      candidates: [],
    })
  })

  it('a storage that cannot be read makes the layer unavailable', async () => {
    const world = await open({
      ownerWrap: storage => ({
        ...storage,
        read: () => Promise.reject(new Error('named read transport failure')),
      }),
    })
    expect(await tenantLayerSource(world.owner).candidates(id('service', 'alpha'))).toEqual({
      layer: 'tenant',
      state: 'unavailable',
    })
    expect(
      await tenantLayerSource(world.owner).list({ category: 'service', after: null, limit: 10 }),
    ).toEqual({ layer: 'tenant', state: 'unavailable' })
  })

  it('lists the tenant layer as asset entries, and an invalid request as invalid', async () => {
    const world = await open()
    await held(world, 'service', ['alpha', 'bravo'])
    await change(world, 'holding-service-bravo', { kind: 'setEnabled', enabled: false })
    const source = tenantLayerSource(world.owner)
    expect(source.layer).toBe('tenant')
    expect(await source.list({ category: 'service', after: null, limit: 1 })).toEqual({
      layer: 'tenant',
      state: 'read',
      page: {
        items: [
          {
            capability: id('service', 'alpha'),
            layer: 'tenant',
            asset: 'service/alpha',
            version: '1',
            selection: 'follow',
            enabled: true,
          },
        ],
        next: 'alpha',
        completeness: 'complete',
      },
    })
    expect(await source.list({ category: 'service', after: null, limit: 0 })).toEqual({
      state: 'invalid',
    })
  })

  it('the asset contract pages across the tenant layer to the end', async () => {
    const world = await open()
    await held(world, 'service', ['alpha', 'bravo', 'charlie'])
    const source = tenantLayerSource(world.owner)
    const names: string[] = []
    let after: string | null = null
    do {
      const answer = await listAssets([source], { category: 'service', after, limit: 2 })
      if (answer.state !== 'read') throw new Error(JSON.stringify(answer))
      names.push(...answer.page.items.map(item => item.capability.name))
      after = answer.page.next
    } while (after !== null)
    expect(names).toEqual(['alpha', 'bravo', 'charlie'])
  })
})

describe('listHeld: the count has no hard ceiling', () => {
  it('250 held assets of one category are read in three pages', async () => {
    const world = await open()
    const names = Array.from(
      { length: 250 },
      (_, index) => `item-${String(index).padStart(3, '0')}`,
    )
    await held(world, 'service', names)
    const pages: number[] = []
    const seen: string[] = []
    let after: string | null = null
    do {
      const page = await world.owner.listHeld({ category: 'service', after, limit: 100 })
      if (page.kind !== 'page') throw new Error(JSON.stringify(page))
      pages.push(page.items.length)
      seen.push(...page.items.map(item => item.name))
      after = page.next
    } while (after !== null)
    expect(pages).toEqual([100, 100, 50])
    expect(seen).toEqual(names)
  })
})

describe('listVersions: the versions of one asset, page by page', () => {
  it('reads every version of the asset across pages, in version order, and none of another asset', async () => {
    const world = await open()
    for (const version of ['3', '1', '2']) await publish(world, 'service', 'alpha', version)
    await publish(world, 'service', 'alphabet', '0')
    await publish(world, 'gadget', 'alpha', '9')
    const first = await world.owner.listVersions({
      assetRef: 'service/alpha',
      after: null,
      limit: 2,
    })
    expect(first).toEqual({ kind: 'page', versions: ['1', '2'], next: '2' })
    expect(
      await world.owner.listVersions({ assetRef: 'service/alpha', after: '2', limit: 2 }),
    ).toEqual({ kind: 'page', versions: ['3'], next: null })
    expect(
      await world.owner.listVersions({ assetRef: 'service/alpha', after: null, limit: 3 }),
    ).toEqual({ kind: 'page', versions: ['1', '2', '3'], next: null })
  })

  it('an asset with no version answers an empty last page', async () => {
    const world = await open()
    expect(
      await world.owner.listVersions({ assetRef: 'service/none', after: null, limit: 10 }),
    ).toEqual({ kind: 'page', versions: [], next: null })
  })

  it('a storage that cannot be read answers unavailable, not an empty page', async () => {
    const world = await open({
      ownerWrap: storage => ({
        ...storage,
        read: () => Promise.reject(new Error('named read transport failure')),
      }),
    })
    expect(
      await world.owner.listVersions({ assetRef: 'service/alpha', after: null, limit: 10 }),
    ).toEqual({ kind: 'rejected', reason: 'unavailable' })
  })

  it.each([
    ['limit 0', { assetRef: 'service/alpha', after: null, limit: 0 }],
    ['limit 101', { assetRef: 'service/alpha', after: null, limit: 101 }],
    ['an empty asset', { assetRef: '', after: null, limit: 10 }],
  ])('%s is invalid input', async (_what, request) => {
    const world = await open()
    expect(await world.owner.listVersions(request)).toEqual({
      kind: 'rejected',
      reason: 'invalid_input',
    })
  })
})
