import {
  capabilityId,
  collectCandidates,
  heldPoint,
  type BodyContract,
  type HeldItem,
} from '@omne-harness/assets'
import { Context } from '@deepseek-ai/cordis'
import {
  assetCategoriesPlugin,
  categoryContributionPlugin,
} from '@omne-harness/assets-cordis-contract/cordis'
import { DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import { describe, expect, it } from 'vitest'
import { heldOnRegistry, type HeldOnRegistry } from '../../../src/rows/tenant-assets/held.ts'
import { heldRegistry } from '../../support/held-registry.ts'

const contract = (category: string): BodyContract => ({
  category,
  schema: { kind: 'null' },
  judge: () => ({ ok: true }),
  deriveDeclarations: () => ({ entries: [] }),
  references: () => [],
})

const categoryPlugin = (category: string) =>
  categoryContributionPlugin(
    `${category}-category`,
    { contract: contract(category), display: { title: category, summary: `${category}.` } },
    heldPoint({ name: `${category}.items`, key: 'the item name', summary: 'Held items.' }),
  )

const item = (asset: string): HeldItem => ({
  asset,
  version: 'v1',
  disabled: false,
  immutable: false,
  replaceLocked: false,
})

const store = { listHeld: async () => ({ kind: 'page', items: [], next: null }) } as never

const tenantLayer = async (
  registry: Awaited<ReturnType<typeof heldRegistry>>,
  tenant: string,
  category: string,
  name: string,
) => {
  const made = capabilityId(category, name)
  if (!made.ok) throw new Error('capability')
  const sources = registry.held.sourcesOf(async () => store)(tenant)
  return (await collectCandidates(sources, made.id)).find(layer => layer.layer === 'tenant')
}

describe('what a tenant holds in a category that gives no point yet', () => {
  it('reads as unavailable, and is put once the category is registered: never as nothing', async () => {
    const registry = await heldRegistry([categoryPlugin('gadget')])
    const widget = item('tenant-a/widget/beta')
    registry.held.heldOf('tenant-a').sync([
      { category: 'gadget', name: 'alpha', item: item('tenant-a/gadget/alpha') },
      { category: 'widget', name: 'beta', item: widget },
    ])
    expect(await tenantLayer(registry, 'tenant-a', 'gadget', 'alpha')).toMatchObject({
      state: 'read',
      candidates: [{ asset: 'tenant-a/gadget/alpha' }],
    })
    expect(await tenantLayer(registry, 'tenant-a', 'widget', 'beta')).toEqual({
      layer: 'tenant',
      state: 'unavailable',
    })
    await registry.root.plugin(categoryPlugin('widget'))
    expect(await tenantLayer(registry, 'tenant-a', 'widget', 'beta')).toEqual({
      layer: 'tenant',
      state: 'read',
      candidates: [widget],
    })
  })

  it('a category that left while the tenant changed something comes back with what the tenant holds', async () => {
    const registry = await heldRegistry([])
    const gadget = registry.root.plugin(categoryPlugin('gadget'))
    await gadget.await()
    const port = registry.held.heldOf('tenant-a')
    const held = [{ category: 'gadget', name: 'alpha', item: item('tenant-a/gadget/alpha') }]
    port.sync(held)
    await gadget.dispose()
    port.sync(held)
    expect(await tenantLayer(registry, 'tenant-a', 'gadget', 'alpha')).toMatchObject({
      state: 'unavailable',
    })
    await registry.root.plugin(categoryPlugin('gadget'))
    expect(await tenantLayer(registry, 'tenant-a', 'gadget', 'alpha')).toMatchObject({
      state: 'read',
      candidates: [{ asset: 'tenant-a/gadget/alpha' }],
    })
  })

  it('a tenant that was never told reads as unavailable', async () => {
    const registry = await heldRegistry([categoryPlugin('gadget')])
    expect(await tenantLayer(registry, 'tenant-z', 'gadget', 'alpha')).toEqual({
      layer: 'tenant',
      state: 'unavailable',
    })
  })

  it('a later telling that failed makes the tenant unavailable until one succeeds', async () => {
    const registry = await heldRegistry([categoryPlugin('gadget')])
    const port = registry.held.heldOf('tenant-a')
    const held = [{ category: 'gadget', name: 'alpha', item: item('tenant-a/gadget/alpha') }]
    port.sync(held)
    expect(await tenantLayer(registry, 'tenant-a', 'gadget', 'alpha')).toMatchObject({
      state: 'read',
    })
    port.missed('failed')
    expect(await tenantLayer(registry, 'tenant-a', 'gadget', 'alpha')).toEqual({
      layer: 'tenant',
      state: 'unavailable',
    })
    port.sync(held)
    expect(await tenantLayer(registry, 'tenant-a', 'gadget', 'alpha')).toMatchObject({
      state: 'read',
    })
  })

  it('before the tenant is told again, a category that has just been registered reads as unavailable', async () => {
    const root = new Context()
    await root.plugin(DynamisService)
    await root.plugin(assetCategoriesPlugin)
    let held: HeldOnRegistry | undefined
    await root.plugin({
      name: 'tenant-assets',
      inject: ['assetCategories'],
      apply(ctx: Context) {
        held = heldOnRegistry(
          () => ctx.assetCategories,
          () => undefined,
        )
      },
    })
    if (held === undefined) throw new Error('the keeper did not start')
    const unheard = { root, categories: root.assetCategories.view, held }
    const widget = item('tenant-a/widget/beta')
    held.heldOf('tenant-a').sync([{ category: 'widget', name: 'beta', item: widget }])
    await root.plugin(categoryPlugin('widget'))
    expect(await tenantLayer(unheard, 'tenant-a', 'widget', 'beta')).toEqual({
      layer: 'tenant',
      state: 'unavailable',
    })
    held.registryChanged()
    expect(await tenantLayer(unheard, 'tenant-a', 'widget', 'beta')).toEqual({
      layer: 'tenant',
      state: 'read',
      candidates: [widget],
    })
  })
})
