import { Context } from '@deepseek-ai/cordis'
import {
  capabilityId,
  collectCandidates,
  evaluate,
  heldPoint,
  listAssets,
  type AssetLayerSource,
  type BodyContract,
  type CapabilityId,
  type HeldHolding,
  type HeldItem,
} from '@omne-harness/assets'
import {
  assetCategoriesPlugin,
  broughtDefinitionsPlugin,
  categoryContributionPlugin,
} from '@omne-harness/assets-cordis-contract/cordis'
import { DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import { describe, expect, it } from 'vitest'
import { registrySources } from '../../../src/rows/tenant-assets/registry-sources.ts'

const contract = (category: string): BodyContract => ({
  category,
  schema: { kind: 'null' },
  judge: () => ({ ok: true }),
  deriveDeclarations: () => ({ entries: [] }),
  references: () => [],
})

const categoryPlugin = (category: string, name = `${category}-category`) =>
  categoryContributionPlugin(
    name,
    { contract: contract(category), display: { title: category, summary: `${category}.` } },
    heldPoint({ name: `${category}.items`, key: 'the item name', summary: 'Held items.' }),
  )

const item = (asset: string, over: Partial<HeldItem> = {}): HeldItem => ({
  asset,
  version: 'v1',
  disabled: false,
  immutable: false,
  replaceLocked: false,
  ...over,
})

const capability = (category: string, name: string): CapabilityId => {
  const made = capabilityId(category, name)
  if (!made.ok) throw new Error('capability')
  return made.id
}

type Sync = (holdings: readonly HeldHolding[]) => void

/** A tree with one category, what the release brings on it, and a keeper of what two tenants hold. */
async function world(options: { opens?: (tenant: string) => boolean } = {}) {
  const root = new Context()
  await root.plugin(DynamisService)
  await root.plugin(assetCategoriesPlugin)
  const gadget = root.plugin(categoryPlugin('gadget'))
  await gadget.await()
  const official = item('official/gadget/spanner')
  await root.plugin(
    broughtDefinitionsPlugin('release', 'gadget.items', [{ name: 'spanner', item: official }]),
  )
  const syncs = new Map<string, Sync>()
  await root.plugin({
    name: 'tenant-assets',
    inject: ['assetCategories'],
    apply(ctx: Context) {
      for (const tenant of ['tenant-a', 'tenant-b'])
        syncs.set(
          tenant,
          ctx.assetCategories.holdingsOf(tenant, () => undefined),
        )
    },
  })
  const stale = new Set<string>()
  const waiting = new Set<string>()
  const listed: string[] = []
  const sources = (tenant: string) =>
    registrySources(
      {
        held: root.assetCategories.held,
        current: (ref, capability) => !stale.has(ref) && !waiting.has(capability.category),
        async listing(ref) {
          if (options.opens?.(ref) === false) return undefined
          return async request => {
            listed.push(`${ref}:${request.category}`)
            return {
              layer: 'tenant',
              state: 'read',
              page: { items: [], next: null, completeness: 'complete' },
            }
          }
        },
      },
      tenant,
    )
  const hold = (tenant: string, holdings: readonly HeldHolding[]) =>
    (syncs.get(tenant) as Sync)(holdings)
  return { root, gadget, official, sources, hold, stale, waiting, listed }
}

const layersOf = (sources: readonly AssetLayerSource[], name: string) =>
  collectCandidates(sources, capability('gadget', name))

describe('registrySources: the layers of one tenant, read from the points of the categories', () => {
  it('gives the official layer and the tenant layer, each with what is on the point for it', async () => {
    const w = await world()
    const mine = item('tenant-a/spanner')
    w.hold('tenant-a', [{ category: 'gadget', name: 'spanner', item: mine }])
    const layers = await layersOf(w.sources('tenant-a'), 'spanner')
    expect(layers).toEqual([
      { layer: 'official', state: 'read', candidates: [w.official] },
      { layer: 'tenant', state: 'read', candidates: [mine] },
    ])
    expect(evaluate({ layers, eligible: () => 'yes' })).toMatchObject({
      kind: 'winner',
      layer: 'tenant',
      candidate: mine,
    })
    expect(await layersOf(w.sources('tenant-a'), 'wrench')).toEqual([
      { layer: 'official', state: 'read', candidates: [] },
      { layer: 'tenant', state: 'read', candidates: [] },
    ])
  })

  it('reads at every question: a holding made after the sources were given is there', async () => {
    const w = await world()
    const sources = w.sources('tenant-a')
    expect((await layersOf(sources, 'wrench'))[1]).toMatchObject({ candidates: [] })
    const mine = item('tenant-a/wrench')
    w.hold('tenant-a', [{ category: 'gadget', name: 'wrench', item: mine }])
    expect((await layersOf(sources, 'wrench'))[1]).toMatchObject({ candidates: [mine] })
  })

  it('a tenant is given nothing another tenant holds', async () => {
    const w = await world()
    w.hold('tenant-b', [{ category: 'gadget', name: 'spanner', item: item('tenant-b/spanner') }])
    const layers = await layersOf(w.sources('tenant-a'), 'spanner')
    expect(layers[1]).toEqual({ layer: 'tenant', state: 'read', candidates: [] })
  })

  it('the assets of the tenant cannot be opened: the tenant layer is unavailable, not empty', async () => {
    const w = await world({ opens: tenant => tenant !== 'tenant-a' })
    const layers = await layersOf(w.sources('tenant-a'), 'spanner')
    expect(layers[1]).toEqual({ layer: 'tenant', state: 'unavailable' })
    expect(evaluate({ layers, eligible: () => 'yes' })).toEqual({
      kind: 'unavailable',
      layer: 'tenant',
    })
    expect((await layersOf(w.sources('tenant-b'), 'spanner'))[1]).toMatchObject({ state: 'read' })
  })

  it('what the tenant holds was not told to the registry: the tenant layer is unavailable', async () => {
    const w = await world()
    w.stale.add('tenant-a')
    expect((await layersOf(w.sources('tenant-a'), 'spanner'))[1]).toEqual({
      layer: 'tenant',
      state: 'unavailable',
    })
    w.stale.delete('tenant-a')
    expect((await layersOf(w.sources('tenant-a'), 'spanner'))[1]).toMatchObject({ state: 'read' })
  })

  it('what the tenant holds in this category waits for a point: the tenant layer of that category is unavailable', async () => {
    const w = await world()
    w.waiting.add('gadget')
    expect((await layersOf(w.sources('tenant-a'), 'spanner'))[1]).toEqual({
      layer: 'tenant',
      state: 'unavailable',
    })
    w.waiting.clear()
    w.waiting.add('widget')
    expect((await layersOf(w.sources('tenant-a'), 'spanner'))[1]).toMatchObject({ state: 'read' })
  })

  it('the category is a conflict, is gone, or was never registered: both layers are unavailable', async () => {
    const w = await world()
    const unavailable = [
      { layer: 'official', state: 'unavailable' },
      { layer: 'tenant', state: 'unavailable' },
    ]
    const rival = w.root.plugin(categoryPlugin('gadget', 'gadget-rival'))
    await rival.await()
    expect(await layersOf(w.sources('tenant-a'), 'spanner')).toEqual(unavailable)
    await rival.dispose()
    expect((await layersOf(w.sources('tenant-a'), 'spanner'))[0]).toMatchObject({ state: 'read' })
    await w.gadget.dispose()
    expect(await layersOf(w.sources('tenant-a'), 'spanner')).toEqual(unavailable)
    expect(await collectCandidates(w.sources('tenant-a'), capability('widget', 'x'))).toEqual(
      unavailable,
    )
  })

  it('listing still reads the ledger: the official layer lists nothing, the tenant layer asks the store', async () => {
    const w = await world()
    const request = { category: 'gadget', after: null, limit: 10 }
    expect(await listAssets(w.sources('tenant-a'), request)).toEqual({
      state: 'read',
      page: { items: [], next: null, completeness: 'complete' },
    })
    expect(w.listed).toEqual(['tenant-a:gadget'])
    const closed = await world({ opens: () => false })
    expect(await listAssets(closed.sources('tenant-a'), request)).toEqual({
      state: 'unavailable',
      layer: 'tenant',
    })
  })
})
