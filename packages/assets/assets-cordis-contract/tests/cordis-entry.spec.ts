import { Context, type EffectMeta } from '@deepseek-ai/cordis'
import type { BodyContract, CategoryContribution } from '@omne-harness/assets'
import {
  AssetCategoriesService,
  assetCategoriesPlugin,
  categoryContributionPlugin,
} from '@omne-harness/assets-cordis-contract/cordis'
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
  await root.plugin(assetCategoriesPlugin)
  return { root, service: root.assetCategories as AssetCategoriesService }
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
