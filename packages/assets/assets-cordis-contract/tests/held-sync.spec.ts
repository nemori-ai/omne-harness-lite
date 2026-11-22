import { Context } from '@deepseek-ai/cordis'
import {
  heldPoint,
  scopeOfLayer,
  type BodyContract,
  type HeldHolding,
  type HeldItem,
} from '@omne-harness/assets'
import {
  assetCategoriesPlugin,
  categoryContributionPlugin,
} from '@omne-harness/assets-cordis-contract/cordis'
import { candidates } from '@omne-harness/dynamis'
import { DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import { describe, expect, it } from 'vitest'

const CATEGORIES = ['gadget', 'widget']
const NAMES = ['alpha', 'beta', 'gamma']
const TENANTS = ['tenant-a', 'tenant-b']

function contract(category: string): BodyContract {
  return {
    category,
    schema: { kind: 'null' },
    judge: () => ({ ok: true }),
    deriveDeclarations: () => ({ entries: [] }),
    references: () => [],
  }
}

const categoryPlugin = (category: string, name = `${category}-category`) =>
  categoryContributionPlugin(
    name,
    { contract: contract(category), display: { title: category, summary: `${category}.` } },
    heldPoint({ name: `${category}.items`, key: 'the item name', summary: 'Held items.' }),
  )

type Sync = (holdings: readonly HeldHolding[]) => void

/** A tree with the categories and one plugin that keeps what each tenant holds, as a tenant row does. */
async function world(categories = CATEGORIES) {
  const root = new Context()
  await root.plugin(DynamisService)
  await root.plugin(assetCategoriesPlugin)
  const fibers = new Map<string, ReturnType<Context['plugin']>>()
  for (const category of categories) {
    const fiber = root.plugin(categoryPlugin(category))
    await fiber.await()
    fibers.set(category, fiber)
  }
  const syncs = new Map<string, Sync>()
  const skipped: HeldHolding[] = []
  const keeper = root.plugin({
    name: 'tenant-assets',
    inject: ['assetCategories'],
    apply(ctx: Context) {
      for (const tenant of TENANTS)
        syncs.set(
          tenant,
          ctx.assetCategories.holdingsOf(tenant, held => void skipped.push(held)),
        )
    },
  })
  await keeper.await()
  const placed = (point: string, asker: readonly string[]) => {
    const read = candidates<HeldItem>(root.dynamis.registry(), point, null, asker)
    if (read.kind !== 'read') return read.kind
    return read.entries
      .map(entry => ({ key: entry.key, scope: entry.scope, item: entry.item }))
      .sort((left, right) =>
        left.key + left.scope.join('/') < right.key + right.scope.join('/') ? -1 : 1,
      )
  }
  const sync = (tenant: string, holdings: readonly HeldHolding[]) =>
    (syncs.get(tenant) as Sync)(holdings)
  return { root, fibers, keeper, sync, placed, skipped }
}

let minted = 0
const item = (asset: string, over: Partial<HeldItem> = {}): HeldItem => ({
  asset,
  version: `v${(minted += 1)}`,
  disabled: false,
  immutable: false,
  replaceLocked: false,
  ...over,
})

const held = (category: string, name: string, of: HeldItem): HeldHolding => ({
  category,
  name,
  item: of,
})

function randomOf(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = state
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

describe('what a tenant holds, kept on the points of the categories', () => {
  it('puts every holding at the scope of its tenant, on the point of its category', async () => {
    const { sync, placed } = await world()
    const alpha = item('asset-alpha')
    const beta = item('asset-beta', { disabled: true })
    sync('tenant-a', [held('gadget', 'alpha', alpha), held('widget', 'beta', beta)])
    const scope = scopeOfLayer('tenant', 'tenant-a')
    expect(placed('gadget.items', scope)).toEqual([{ key: 'alpha', scope, item: alpha }])
    expect(placed('widget.items', scope)).toEqual([{ key: 'beta', scope, item: beta }])
  })

  it('what one tenant holds is not seen by another tenant, nor by the whole deployment', async () => {
    const { sync, placed } = await world()
    sync('tenant-a', [held('gadget', 'alpha', item('asset-alpha'))])
    expect(placed('gadget.items', scopeOfLayer('tenant', 'tenant-b'))).toEqual([])
    expect(placed('gadget.items', scopeOfLayer('official'))).toEqual([])
    sync('tenant-b', [])
    expect(placed('gadget.items', scopeOfLayer('tenant', 'tenant-a'))).toHaveLength(1)
  })

  it('a changed item replaces the old one, a holding no longer held is taken, the rest is not touched', async () => {
    const { root, sync, placed } = await world()
    const scope = scopeOfLayer('tenant', 'tenant-a')
    const alpha = item('asset-alpha')
    const beta = item('asset-beta')
    sync('tenant-a', [held('gadget', 'alpha', alpha), held('gadget', 'beta', beta)])
    let changes = 0
    root.on('dynamis-cordis/changed', () => void (changes += 1))
    const disabled = { ...alpha, disabled: true }
    sync('tenant-a', [held('gadget', 'alpha', disabled), held('gadget', 'beta', beta)])
    expect(placed('gadget.items', scope)).toEqual([
      { key: 'alpha', scope, item: disabled },
      { key: 'beta', scope, item: beta },
    ])
    expect(changes).toBe(2)
    sync('tenant-a', [held('gadget', 'alpha', disabled), held('gadget', 'beta', beta)])
    expect(changes).toBe(2)
    sync('tenant-a', [held('gadget', 'beta', beta)])
    expect(placed('gadget.items', scope)).toEqual([{ key: 'beta', scope, item: beta }])
  })

  it('on a random history, after every sync the entries of each tenant are exactly what it holds', async () => {
    for (let seed = 1; seed <= 12; seed += 1) {
      const random = randomOf(seed)
      const below = (limit: number) => Math.floor(random() * limit)
      const { sync, placed } = await world()
      const books = new Map(TENANTS.map(tenant => [tenant, new Map<string, HeldHolding>()]))
      for (let turn = 0; turn < 50; turn += 1) {
        const tenant = TENANTS[below(2)] as string
        const book = books.get(tenant) as Map<string, HeldHolding>
        const category = CATEGORIES[below(2)] as string
        const name = NAMES[below(3)] as string
        const key = `${category}/${name}`
        const current = book.get(key)
        const action = current === undefined ? 0 : below(4)
        if (action === 0) book.set(key, held(category, name, item(`${tenant}/${key}`)))
        else if (action === 1)
          book.set(
            key,
            held(category, name, { ...current!.item, disabled: !current!.item.disabled }),
          )
        else if (action === 2) book.delete(key)
        else book.set(key, held(category, name, { ...current!.item, version: `v${(minted += 1)}` }))
        sync(tenant, [...book.values()])
        for (const [who, theirs] of books)
          for (const each of CATEGORIES) {
            const scope = scopeOfLayer('tenant', who)
            const expected = [...theirs.values()]
              .filter(holding => holding.category === each)
              .map(holding => ({ key: holding.name, scope, item: holding.item }))
              .sort((left, right) => (left.key < right.key ? -1 : 1))
            expect(placed(`${each}.items`, scope), `seed ${seed} turn ${turn} ${who}`).toEqual(
              expected,
            )
          }
      }
    }
  })

  it('a holding of a category that is not registered, or is a conflict, is not put and is told', async () => {
    const { root, sync, placed, skipped } = await world(['gadget'])
    const stray = held('widget', 'beta', item('asset-beta'))
    const kept = held('gadget', 'alpha', item('asset-alpha'))
    sync('tenant-a', [kept, stray])
    expect(skipped).toEqual([stray])
    const scope = scopeOfLayer('tenant', 'tenant-a')
    expect(placed('gadget.items', scope)).toHaveLength(1)
    const rival = root.plugin(categoryPlugin('gadget', 'gadget-rival'))
    await rival.await()
    sync('tenant-a', [kept])
    expect(skipped).toEqual([stray, kept])
    expect(placed('gadget.items', scope)).toEqual([])
    await rival.dispose()
    sync('tenant-a', [kept])
    expect(placed('gadget.items', scope)).toHaveLength(1)
  })

  it('when the category leaves, its entries stay and read as unavailable; when it is back they read again', async () => {
    const { root, fibers, sync, placed } = await world()
    const scope = scopeOfLayer('tenant', 'tenant-a')
    sync('tenant-a', [held('gadget', 'alpha', item('asset-alpha'))])
    await fibers.get('gadget')?.dispose()
    expect(placed('gadget.items', scope)).toBe('unavailable')
    expect(root.dynamis.registry().placed.some(entry => entry.point === 'gadget.items')).toBe(true)
    await root.plugin(categoryPlugin('gadget'))
    expect(placed('gadget.items', scope)).toHaveLength(1)
  })

  it('everything it put goes when the one who keeps it unloads', async () => {
    const { root, keeper, sync } = await world()
    sync('tenant-a', [held('gadget', 'alpha', item('asset-alpha'))])
    sync('tenant-b', [held('widget', 'beta', item('asset-beta'))])
    await keeper.dispose()
    const left = root.dynamis.registry().placed.filter(entry => entry.scope.length > 0)
    expect(left).toEqual([])
  })
})
