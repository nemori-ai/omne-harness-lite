import { Context, type EffectMeta } from '@deepseek-ai/cordis'
import {
  heldPoint,
  type BodyContract,
  type CategoryContribution,
  type HeldItem,
} from '@omne-harness/assets'
import {
  AssetCategoriesService,
  assetCategoriesPlugin,
  broughtDefinitionsPlugin,
  categoryContributionPlugin,
} from '@omne-harness/assets-cordis-contract/cordis'
import { ASSET_CATEGORIES_POINT, heldEntry } from '@omne-harness/assets-cordis-contract'
import {
  ask,
  candidates,
  CATALOG,
  declare,
  list,
  standingOf,
  type Contract,
} from '@omne-harness/dynamis'
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

/** The contribution with its point declared by rules made on the spot. */
const contributionPlugin = (name: string, given: CategoryContribution) =>
  categoryContributionPlugin(
    name,
    given,
    heldPoint({ name: given.point, key: 'the item name', summary: 'The held items.' }),
  )

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
      contributionPlugin('gadget-category', contribution('gadget', 'Gadget')),
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
      contributionPlugin('gadget-category', contribution('gadget', 'Gadget')),
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
    const first = root.plugin(contributionPlugin('first', counted('First')))
    const second = root.plugin(contributionPlugin('second', counted('Second')))
    const widget = root.plugin(contributionPlugin('widget', contribution('widget', 'W')))
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
    const gadget = root.plugin(contributionPlugin('gadget', directory('gadget')))
    const widget = root.plugin(contributionPlugin('widget', directory('widget')))
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
      contributionPlugin('gadget-category', contribution('gadget', 'Gadget')),
    )
    const widget = root.plugin(
      contributionPlugin('widget-category', contribution('widget', 'Widget')),
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
      contributionPlugin('gadget-category', contribution('gadget', 'Gadget')),
    )
    await fiber.await()
    await fiber.dispose()
    expect(seen).toEqual([['gadget'], []])
  })

  it('a contribution the categories point refuses fails its plugin and leaves no key', async () => {
    const { root } = await categories()
    await root.plugin(contributionPlugin('first', contribution('gadget', 'Gadget')))
    const second = root.plugin(
      contributionPlugin('second', { ...contribution('widget', 'W'), point: '' }),
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
    await root.plugin(contributionPlugin('gadget-category', given))
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

describe('the point of a category, and what the deployment brings on it', () => {
  const item = (asset: string, version = 'v1'): HeldItem => ({
    asset,
    version,
    disabled: false,
    immutable: false,
    replaceLocked: false,
  })
  const official = (root: Context, name: string) =>
    candidates<HeldItem>(root.dynamis.registry(), 'gadget.items', name, [])

  it('is declared for exactly as long as its category is contributed', async () => {
    const { root } = await categories()
    const standing = () => standingOf(root.dynamis.registry(), 'gadget.items', []).kind
    expect(standing()).toBe('undeclared')
    const fiber = root.plugin(contributionPlugin('gadget-category', contribution('gadget', 'G')))
    await fiber.await()
    expect(standing()).toBe('declared')
    const declared = standingOf(root.dynamis.registry(), 'gadget.items', [])
    expect(declared.kind === 'declared' && declared.contract).toMatchObject({
      arity: 'keyed-one',
      resolve: 'most-specific',
      keys: 'private',
      item: { kind: 'data' },
    })
    expect(declared.kind === 'declared' && declared.holders.map(by => by.fiber)).toEqual([
      'gadget-category',
    ])
    await fiber.dispose()
    expect(standing()).toBe('undeclared')
  })

  it('takes what a plugin brings as items of the whole deployment, put as that plugin', async () => {
    const { root } = await categories()
    await root.plugin(contributionPlugin('gadget-category', contribution('gadget', 'G')))
    const bringer = root.plugin({
      name: 'release',
      inject: ['assetCategories'],
      apply(ctx: Context) {
        ctx.assetCategories.bring('gadget.items', [
          { name: 'spanner', item: item('official/gadget/spanner') },
          { name: 'wrench', item: item('official/gadget/wrench', 'v7') },
        ])
      },
    })
    await bringer.await()
    expect(labels(bringer.getEffects())).toContain('assetCategories.bring')
    const read = official(root, 'wrench')
    if (read.kind !== 'read') throw new Error(`the point is ${read.kind}`)
    expect(read.filtered).toEqual([])
    expect(
      read.entries.map(({ scope, item: held, instance }) => [scope, held, instance.fiber]),
    ).toEqual([[[], item('official/gadget/wrench', 'v7'), 'release']])
    await bringer.dispose()
    expect(official(root, 'wrench')).toMatchObject({ kind: 'read', entries: [] })
  })

  it('a plugin that only brings waits for the categories and holds up no one', async () => {
    const root = new Context()
    await root.plugin(DynamisService)
    const brought = [{ name: 'spanner', item: item('official/gadget/spanner') }]
    const fiber = root.plugin(broughtDefinitionsPlugin('gadget-official', 'gadget.items', brought))
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(fiber.state).toBe(PENDING)
    await root.plugin(assetCategoriesPlugin)
    await root.plugin(contributionPlugin('gadget-category', contribution('gadget', 'G')))
    await fiber.await()
    const read = official(root, 'spanner')
    expect(read.kind === 'read' && read.entries.map(entry => entry.instance.fiber)).toEqual([
      'gadget-official',
    ])
  })

  it('what is brought on a point no category declares reads as unavailable, not as nothing', async () => {
    const { root } = await categories()
    await root.plugin({
      name: 'release',
      inject: ['assetCategories'],
      apply(ctx: Context) {
        ctx.assetCategories.bring('gadget.items', [{ name: 'spanner', item: item('a') }])
      },
    })
    expect(official(root, 'spanner')).toMatchObject({ kind: 'unavailable', reason: 'undeclared' })
  })

  it('the digest of an entry is its item: the same held item is one, a changed one is another', () => {
    const first = heldEntry('gadget.items', 'spanner', [], item('a'))
    expect(heldEntry('gadget.items', 'spanner', [], { ...item('a') }).digest).toBe(first.digest)
    expect(first).toMatchObject({
      point: 'gadget.items',
      key: 'spanner',
      id: '',
      scope: [],
      rank: 0,
    })
    const changed: HeldItem[] = [
      item('b'),
      item('a', 'v2'),
      { ...item('a'), disabled: true },
      { ...item('a'), immutable: true },
      { ...item('a'), replaceLocked: true },
    ]
    for (const other of changed)
      expect(heldEntry('gadget.items', 'spanner', [], other).digest).not.toBe(first.digest)
  })

  it("reads what one tenant sees under a name: the official item, its own, never another tenant's", async () => {
    const { root, service } = await categories()
    await root.plugin(contributionPlugin('gadget-category', contribution('gadget', 'G')))
    const shipped = item('official/gadget/spanner')
    const mine = item('tenant-a/gadget/spanner')
    await root.plugin({
      name: 'holders',
      inject: ['assetCategories'],
      apply(ctx: Context) {
        ctx.assetCategories.bring('gadget.items', [{ name: 'spanner', item: shipped }])
        ctx.assetCategories.holdingsOf(
          'tenant-a',
          () => undefined,
        )([
          { category: 'gadget', name: 'spanner', item: mine },
          { category: 'gadget', name: 'wrench', item: item('tenant-a/gadget/wrench') },
        ])
      },
    })
    const spanner = { category: 'gadget', name: 'spanner' }
    const read = service.held(spanner, 'tenant-a')
    expect(read.kind === 'read' && read.entries.map(entry => [entry.scope, entry.item])).toEqual([
      [[], shipped],
      [['tenant', 'tenant-a'], mine],
    ])
    const other = service.held(spanner, 'tenant-b')
    expect(other.kind === 'read' && other.entries.map(entry => entry.item)).toEqual([shipped])
  })

  it('answers unavailable, and exactly that, for a category that is not registered or is a conflict', async () => {
    const { root, service } = await categories()
    expect(service.held({ category: 'gadget', name: 'spanner' }, 'tenant-a')).toStrictEqual({
      kind: 'unavailable',
    })
    await root.plugin(contributionPlugin('first', contribution('gadget', 'G')))
    const rival = root.plugin(contributionPlugin('second', contribution('gadget', 'G2')))
    await rival.await()
    expect(service.held({ category: 'gadget', name: 'spanner' }, 'tenant-a')).toStrictEqual({
      kind: 'unavailable',
    })
    await rival.dispose()
    expect(service.held({ category: 'gadget', name: 'spanner' }, 'tenant-a').kind).toBe('read')
  })

  it('when the categories point itself cannot be read, no category gives a contract and each says it is unread', async () => {
    const { root, service } = await categories()
    await root.plugin(contributionPlugin('gadget-category', contribution('gadget', 'G')))
    const again = root.plugin({
      name: 'second-declarer',
      inject: ['dynamis'],
      apply(ctx: Context) {
        ctx.dynamis.put([
          declare({
            ...heldPoint({ name: ASSET_CATEGORIES_POINT, key: 'k', summary: 'Another rule.' }),
          }),
        ])
      },
    })
    await again.await()
    expect(service.view.lookup('gadget')).toBeUndefined()
    expect(service.view.list()).toEqual([])
    expect(service.view.describe('gadget')).toMatchObject({
      category: 'gadget',
      unusable: 'unread',
    })
    await again.dispose()
    expect(service.view.lookup('gadget')?.category).toBe('gadget')
  })
})
