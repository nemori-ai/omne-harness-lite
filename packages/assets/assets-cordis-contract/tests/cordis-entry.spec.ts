import { Context, type EffectMeta } from '@deepseek-ai/cordis'
import type { BodyContract, CategoryContribution } from '@omne-harness/assets'
import {
  AssetCategoriesService,
  assetCategoriesPlugin,
  categoryContributionPlugin,
} from '@omne-harness/assets-cordis-contract/cordis'
import { ASSET_CATEGORIES_POINT } from '@omne-harness/assets-cordis-contract'
import { CATALOG, list, type Contract } from '@omne-harness/dynamis'
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
  return { contract: contract(category), display: { title, summary: `${title}.` } }
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
      { category: 'gadget', display: { title: 'Gadget', summary: 'Gadget.' }, creation: 'data' },
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

  it('a second plugin for the same category fails to start and the first one stays', async () => {
    const { root, service } = await categories()
    await root.plugin(categoryContributionPlugin('first', contribution('gadget', 'First')))
    const second = root.plugin(
      categoryContributionPlugin('second', contribution('gadget', 'Second')),
    )
    await expect(second.await()).rejects.toThrow(/category already registered/)
    expect(second.state).toBe(FAILED)
    expect(service.view.list()).toEqual([
      { category: 'gadget', display: { title: 'First', summary: 'First.' }, creation: 'data' },
    ])
    await second.dispose()
    expect(service.view.list().map(listing => listing.display.title)).toEqual(['First'])
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
    expect(point?.entry.item.item).toEqual({ kind: 'data', fields: { category: 'string' } })
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

  it('a contribution the categories point refuses leaves no key', async () => {
    const { root } = await categories()
    await root.plugin(categoryContributionPlugin('first', contribution('gadget', 'Gadget')))
    const second = root.plugin(
      categoryContributionPlugin('second', contribution('gadget', 'Again')),
    )
    await second.await().catch(() => undefined)
    expect(keysOn(root)).toEqual(['gadget'])
    await second.dispose()
    expect(keysOn(root)).toEqual(['gadget'])
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
