import { Context, type EffectMeta } from '@deepseek-ai/cordis'
import type { BodyContract, CategoryContribution } from '@omne-harness/assets'
import {
  AssetCategoriesService,
  assetCategoriesPlugin,
  categoryContributionPlugin,
} from '@omne-harness/assets-cordis-contract/cordis'
import { ASSET_CATEGORIES_POINT } from '@omne-harness/assets-cordis-contract'
import { ask, CATALOG, list, type Contract } from '@omne-harness/dynamis'
import { DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import { describe, expect, it } from 'vitest'

const ACTIVE = 2
const PENDING = 0
const FAILED = 3

function contract(category: string): BodyContract {
  return {
    category,
    schema: { kind: 'null' },
    judge: () => ({ ok: true }),
    deriveDeclarations: () => ({ entries: [] }),
    references: () => [],
  }
}

function contribution(category: string, title: string): CategoryContribution {
  return {
    contract: contract(category),
    display: { title, summary: `${title}.` },
    point: `${category}.items`,
  }
}

function labels(effects: readonly EffectMeta[]): string[] {
  return effects.flatMap(effect => [effect.label, ...labels(effect.children)])
}

async function categories() {
  const root = new Context()
  await root.plugin(DynamisService)
  await root.plugin(assetCategoriesPlugin)
  return { root, service: root.assetCategories as AssetCategoriesService }
}

/** The fibers that now hold an item at one key of the categories point. */
function placedOn(root: Context, category: string): string[] {
  return root.dynamis
    .registry()
    .placed.filter(placed => placed.point === ASSET_CATEGORIES_POINT && placed.key === category)
    .map(placed => placed.instance.fiber)
}

/** The keys now on the categories point of the tree's registry. */
function keysOn(root: Context): string[] {
  const read = list(root.dynamis.registry(), ASSET_CATEGORIES_POINT, null, [])
  if (read.kind !== 'read') throw new Error(`the categories point is ${read.kind}`)
  return read.items.map(({ entry }) => entry.key).sort()
}

describe('the categories service on a real Cordis root', () => {
  it('takes a contribution when the plugin starts and withdraws it when its scope unloads', async () => {
    const { root, service } = await categories()
    const fiber = root.plugin(
      categoryContributionPlugin('gadget-category', contribution('gadget', 'Gadget')),
    )
    await fiber.await()
    expect(labels(fiber.getEffects())).toContain('assetCategories.contribute')
    expect(service.view.lookup('gadget')?.category).toBe('gadget')
    expect(service.view.list()).toEqual([
      {
        category: 'gadget',
        display: { title: 'Gadget', summary: 'Gadget.' },
        creation: 'data',
        point: 'gadget.items',
      },
    ])
    await fiber.dispose()
    expect(service.view.lookup('gadget')).toBeUndefined()
    expect(service.view.list()).toEqual([])
  })

  it('does not start a contribution plugin until the service is there', async () => {
    const root = new Context()
    await root.plugin(DynamisService)
    const fiber = root.plugin(
      categoryContributionPlugin('gadget-category', contribution('gadget', 'Gadget')),
    )
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(fiber.state).toBe(PENDING)
    const service = root.plugin(assetCategoriesPlugin)
    await service
    await fiber.await()
    expect(fiber.state).toBe(ACTIVE)
    expect(root.assetCategories.view.list().map(listing => listing.category)).toEqual(['gadget'])
    await service.dispose()
    expect(fiber.state).toBe(PENDING)
  })

  it('two plugins for one category both start; the category is a conflict until one leaves', async () => {
    const { root, service } = await categories()
    let judged = 0
    const counted = (title: string): CategoryContribution => {
      const made = contribution('gadget', title)
      return { ...made, contract: { ...made.contract, judge: () => ((judged += 1), { ok: true }) } }
    }
    const first = root.plugin(categoryContributionPlugin('first', counted('First')))
    const second = root.plugin(categoryContributionPlugin('second', counted('Second')))
    const widget = root.plugin(categoryContributionPlugin('widget', contribution('widget', 'W')))
    await Promise.all([first.await(), second.await(), widget.await()])
    expect([first.state, second.state]).toEqual([ACTIVE, ACTIVE])
    expect(service.view.lookup('gadget')).toBeUndefined()
    expect(service.view.describe('gadget')).toEqual({
      category: 'gadget',
      unusable: 'conflict',
      detail: '2 contributions',
    })
    service.view.lookup('gadget')?.judge(null)
    expect(judged).toBe(0)
    expect(service.view.list().map(listing => listing.category)).toEqual(['widget'])
    expect(placedOn(root, 'gadget').sort()).toEqual(['first', 'second'])
    expect(ask(root.dynamis.registry(), ASSET_CATEGORIES_POINT, 'gadget', []).kind).toBe('conflict')
    await second.dispose()
    expect(service.view.lookup('gadget')?.category).toBe('gadget')
    expect(service.view.list().map(listing => listing.display.title)).toEqual(['First', 'W'])
  })

  it('two categories with one namespace: neither gives a contract, and both plugins start', async () => {
    const { root, service } = await categories()
    const layout = {
      namespace: 'things',
      limits: { files: 1, fileBytes: 1, totalBytes: 1 },
      inspect: async () => ({ failure: { kind: 'not-configured' as const } }),
    }
    const directory = (category: string): CategoryContribution => {
      const made = contribution(category, category)
      return { ...made, contract: { ...made.contract, layout } }
    }
    const gadget = root.plugin(categoryContributionPlugin('gadget', directory('gadget')))
    const widget = root.plugin(categoryContributionPlugin('widget', directory('widget')))
    await Promise.all([gadget.await(), widget.await()])
    expect([gadget.state, widget.state]).toEqual([ACTIVE, ACTIVE])
    expect(service.view.list()).toEqual([])
    expect(service.view.describe('widget')).toMatchObject({ unusable: 'conflict' })
    await gadget.dispose()
    expect(service.view.list().map(listing => listing.category)).toEqual(['widget'])
  })

  it('names the plugin that provides the service after the extension point', () => {
    expect(assetCategoriesPlugin.name).toBe('asset-categories')
  })

  it('gives readers a view that cannot contribute', async () => {
    const { service } = await categories()
    expect(Object.keys(service.view).sort()).toEqual(['describe', 'list', 'lookup'])
    expect(Object.isFrozen(service.view)).toBe(true)
  })
})

describe('the categories as keys on the registry of the tree', () => {
  it('declares the point with public keys, put by the service itself', async () => {
    const { root } = await categories()
    const declared = list<Contract>(root.dynamis.registry(), CATALOG, null, [])
    if (declared.kind !== 'read') throw new Error('the catalog is not read')
    const point = declared.items.find(({ entry }) => entry.key === ASSET_CATEGORIES_POINT)
    expect(point?.entry.item).toMatchObject({ tree: 'server', arity: 'keyed-one', keys: 'public' })
    expect(point?.entry.item.item).toEqual({
      kind: 'pure',
      fields: { category: 'string', point: 'string', contract: 'object', display: 'object' },
    })
    // The rules are read by people and go into the digest the other tree sees: none is left empty.
    const texts = Object.values(point?.entry.item ?? {}).filter(value => typeof value === 'string')
    expect(texts.length).toBeGreaterThan(8)
    expect(texts.every(text => text !== '')).toBe(true)
    expect(point?.entry.instance.fiber).toBe('asset-categories')
  })

  it('a category is a key for exactly as long as it is on the categories point', async () => {
    const { root, service } = await categories()
    const gadget = root.plugin(
      categoryContributionPlugin('gadget-category', contribution('gadget', 'Gadget')),
    )
    const widget = root.plugin(
      categoryContributionPlugin('widget-category', contribution('widget', 'Widget')),
    )
    await Promise.all([gadget.await(), widget.await()])
    expect(keysOn(root)).toEqual(['gadget', 'widget'])
    await gadget.dispose()
    expect(keysOn(root)).toEqual(['widget'])
    expect(service.view.list().map(each => each.category)).toEqual(['widget'])
    await widget.dispose()
    expect(keysOn(root)).toEqual([])
  })

  it('tells every change of the keys once, when the category is already readable or gone', async () => {
    const { root, service } = await categories()
    const seen: string[][] = []
    root.on('dynamis-cordis/changed', () => {
      seen.push(service.view.list().map(each => each.category))
    })
    const fiber = root.plugin(
      categoryContributionPlugin('gadget-category', contribution('gadget', 'Gadget')),
    )
    await fiber.await()
    await fiber.dispose()
    expect(seen).toEqual([['gadget'], []])
  })

  it('a contribution the categories point refuses fails its plugin and leaves no key', async () => {
    const { root } = await categories()
    await root.plugin(categoryContributionPlugin('first', contribution('gadget', 'Gadget')))
    const second = root.plugin(
      categoryContributionPlugin('second', { ...contribution('widget', 'W'), point: '' }),
    )
    await expect(second.await()).rejects.toThrow(/category point is empty/)
    expect(second.state).toBe(FAILED)
    expect(keysOn(root)).toEqual(['gadget'])
    await second.dispose()
    expect(keysOn(root)).toEqual(['gadget'])
  })

  it('the item is the whole contribution, put by the one who contributes', async () => {
    const { root } = await categories()
    const given = contribution('gadget', 'Gadget')
    await root.plugin(categoryContributionPlugin('gadget-category', given))
    const [placed] = root.dynamis.registry().placed.filter(each => each.key === 'gadget')
    expect(placed?.instance.fiber).toBe('gadget-category')
    expect(placed?.item).toMatchObject({ category: 'gadget', point: 'gadget.items' })
    expect(placed?.item).toHaveProperty('contract.judge', given.contract.judge)
  })

  it('does not start until the registry service is there', async () => {
    const root = new Context()
    const fiber = root.plugin(assetCategoriesPlugin)
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(root.get('assetCategories')).toBeUndefined()
    await root.plugin(DynamisService)
    await fiber.await()
    expect(root.get('assetCategories')).toBeDefined()
  })
})
