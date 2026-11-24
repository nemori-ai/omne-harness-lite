import {
  capabilityId,
  collectCandidates,
  heldPoint,
  type BodyContract,
  type HeldHolding,
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

type Listed = readonly { category: string; point: string }[]

/** The keeper over categories that only record: what was placed for whom, what was skipped, what was warned. */
function recorded(options: { skip?: string } = {}) {
  const placed: [string, readonly HeldHolding[]][] = []
  const warned: string[] = []
  const state: { fail?: Error; listed: Listed } = {
    listed: [{ category: 'gadget', point: 'gadget.items' }],
  }
  const held = heldOnRegistry(
    () =>
      ({
        held: () => ({ kind: 'read', entries: [] }),
        holdingsOf:
          (tenant: string, skipped: (holding: HeldHolding) => void) =>
          (holdings: readonly HeldHolding[]) => {
            if (state.fail !== undefined) throw state.fail
            placed.push([tenant, holdings])
            for (const holding of holdings) if (holding.category === options.skip) skipped(holding)
          },
        view: { list: () => state.listed },
      }) as never,
    message => warned.push(message),
  )
  const layer = async (tenant: string, opens = true) => {
    const made = capabilityId('gadget', 'alpha')
    if (!made.ok) throw new Error('capability')
    const sources = held.sourcesOf(async () => (opens ? store : undefined))(tenant)
    return (await collectCandidates(sources, made.id)).find(each => each.layer === 'tenant')
  }
  return { held, placed, warned, state, layer }
}

describe('the keeper of what tenants hold', () => {
  const holdings = [{ category: 'gadget', name: 'alpha', item: item('tenant-a/gadget/alpha') }]
  const unavailable = { layer: 'tenant', state: 'unavailable' }

  it('a tenant whose assets are opened and not told yet reads as unavailable', async () => {
    const w = recorded()
    w.held.heldOf('tenant-a')
    expect(await w.layer('tenant-a')).toEqual(unavailable)
  })

  it('a telling that cannot be put throws to the one who told, is warned of, and reads as unavailable', async () => {
    const w = recorded()
    const port = w.held.heldOf('tenant-a')
    port.sync(holdings)
    expect(await w.layer('tenant-a')).toMatchObject({ state: 'read' })
    w.state.fail = new Error('no room')
    expect(() => port.sync(holdings)).toThrow('no room')
    expect(w.warned).toEqual([expect.stringMatching(/tenant-a.*not put.*no room/u)])
    expect(await w.layer('tenant-a')).toEqual(unavailable)
    delete w.state.fail
    port.sync(holdings)
    expect(await w.layer('tenant-a')).toMatchObject({ state: 'read' })
  })

  it('warns of each holding that waits for its category, and of a telling that was missed', () => {
    const w = recorded({ skip: 'widget' })
    const port = w.held.heldOf('tenant-a')
    port.sync([{ category: 'widget', name: 'beta', item: item('tenant-a/widget/beta') }])
    expect(w.warned).toEqual([expect.stringMatching(/tenant-a.*widget:beta.*waits/u)])
    port.missed('unread')
    expect(w.warned[1]).toMatch(/tenant-a.*not told.*unread/u)
  })

  it('a tenant that was told reads as unavailable once its assets cannot be opened', async () => {
    const w = recorded()
    w.held.heldOf('tenant-a').sync(holdings)
    expect(await w.layer('tenant-a')).toMatchObject({ state: 'read' })
    expect(await w.layer('tenant-a', false)).toEqual(unavailable)
  })

  it('tells every told tenant again when the categories or their points differ, and only then', () => {
    const w = recorded()
    w.held.heldOf('tenant-a').sync(holdings)
    w.held.heldOf('tenant-b')
    expect(w.placed).toEqual([['tenant-a', holdings]])
    w.held.registryChanged()
    expect(w.placed).toHaveLength(2)
    w.held.registryChanged()
    expect(w.placed).toHaveLength(2)
    w.state.listed = [{ category: 'widget', point: 'gadget.items' }]
    w.held.registryChanged()
    expect(w.placed).toHaveLength(3)
    w.state.listed = [{ category: 'widget', point: 'widget.items' }]
    w.held.registryChanged()
    expect(w.placed).toEqual(Array.from({ length: 4 }, () => ['tenant-a', holdings]))
    expect(w.warned).toEqual([])
  })

  it('a tenant that cannot be told again does not stop the others', () => {
    const w = recorded()
    w.held.heldOf('tenant-a').sync(holdings)
    w.held.heldOf('tenant-b').sync(holdings)
    w.state.fail = new Error('no room')
    expect(() => w.held.registryChanged()).not.toThrow()
    expect(w.warned).toHaveLength(2)
  })
})
