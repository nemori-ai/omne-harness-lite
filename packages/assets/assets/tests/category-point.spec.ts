import { describe, expect, it } from 'vitest'
import {
  admitCategory,
  categoryViewOf,
  createCategoryPoint,
  isReadBody,
  readBodyText,
  unknownCategory,
  type BodyContract,
  type CategoryContribution,
  type CategoryListing,
  type JsonValue,
} from '@omne-harness/assets'

function document(text: string): JsonValue {
  const read = readBodyText(text, {
    maxBytes: 1_000,
    maxDepth: 10,
    maxItems: 100,
    maxMembers: 100,
    maxStringLength: 100,
    maxNumberLength: 100,
  })
  if (read.kind !== 'ok') throw new Error(read.kind)
  return read.value
}

function contract(category: string, accepts = category): BodyContract {
  return {
    category,
    schema: { kind: 'null' },
    judge(body) {
      const record = body as JsonValue
      const name =
        record.kind === 'object'
          ? record.entries.find(entry => entry.key === 'name')?.value
          : undefined
      return name?.kind === 'string' && name.value === accepts
        ? { ok: true }
        : { ok: false, rejected: 'name-mismatch' }
    },
    deriveDeclarations: () => ({ entries: [] }),
    references: () => [],
  }
}

function contribution(category: string, title = `${category} title`): CategoryContribution {
  return {
    contract: contract(category),
    display: { title, summary: `${category} summary` },
    point: `${category.toLowerCase()}.items`,
  }
}

const creationOf = (point: { describe(category: string): unknown }, category: string) =>
  (point.describe(category) as CategoryListing | undefined)?.creation

describe('contribute to an unregistered category', () => {
  it('makes the contract findable and the category listed', () => {
    const point = createCategoryPoint()
    point.contribute(contribution('tool', '工具'))
    expect(point.lookup('tool')?.category).toBe('tool')
    expect(point.lookup('tool')?.judge(document('{"name":"tool"}'))).toEqual({ ok: true })
    expect(point.list()).toEqual([
      {
        category: 'tool',
        display: { title: '工具', summary: 'tool summary' },
        creation: 'data',
        point: 'tool.items',
      },
    ])
  })
})

describe('contribute to a registered category', () => {
  it('takes both; the category gives no contract while two stand, and says it is a conflict', () => {
    const point = createCategoryPoint()
    point.contribute({ ...contribution('tool', 'first'), contract: contract('tool', 'first') })
    point.contribute(contribution('note'))
    const withdrawSecond = point.contribute(contribution('tool', 'second'))
    expect(point.lookup('tool')).toBeUndefined()
    expect(point.describe('tool')).toEqual({
      category: 'tool',
      unusable: 'conflict',
      detail: '2 contributions',
    })
    expect(point.list().map(listing => listing.category)).toEqual(['note'])
    expect(unknownCategory(point, 'tool')).toEqual({ ok: false, rejected: 'unknown-category' })
    withdrawSecond()
    expect(point.lookup('tool')?.judge(document('{"name":"first"}'))).toEqual({ ok: true })
    expect(point.list().map(listing => listing.category)).toEqual(['note', 'tool'])
  })

  it('does not call the judge of either contribution while two stand', () => {
    const point = createCategoryPoint()
    let judged = 0
    const counting = (accepts: string): CategoryContribution => ({
      ...contribution('tool', accepts),
      contract: { ...contract('tool', accepts), judge: () => ((judged += 1), { ok: true }) },
    })
    point.contribute(counting('first'))
    point.contribute(counting('second'))
    point.lookup('tool')?.judge(document('{"name":"first"}'))
    expect(judged).toBe(0)
  })
})

describe('contribute a directory category whose namespace another category has', () => {
  const layout = (namespace: string) => ({
    namespace,
    limits: { files: 1, fileBytes: 1, totalBytes: 1 },
    inspect: async () => ({ failure: { kind: 'not-configured' as const } }),
  })
  const directory = (category: string, namespace: string): CategoryContribution => ({
    ...contribution(category),
    contract: { ...contract(category), layout: layout(namespace) },
  })

  it('neither gives a contract while both stand; another namespace is taken', () => {
    const point = createCategoryPoint()
    point.contribute(directory('gadget', 'gadgets'))
    const withdraw = point.contribute(directory('widget', 'gadgets'))
    expect(point.lookup('gadget')).toBeUndefined()
    expect(point.lookup('widget')).toBeUndefined()
    expect(point.describe('gadget')).toEqual({
      category: 'gadget',
      unusable: 'conflict',
      detail: 'the namespace gadgets is also the namespace of widget',
    })
    expect(point.describe('widget')).toMatchObject({ unusable: 'conflict' })
    withdraw()
    expect(point.lookup('gadget')?.layout?.namespace).toBe('gadgets')
    point.contribute(directory('widget', 'widgets'))
    point.contribute(contribution('note'))
    expect(point.list().map(listing => listing.category)).toEqual(['gadget', 'note', 'widget'])
  })

  it('two categories that name one point: neither gives a contract', () => {
    const point = createCategoryPoint()
    point.contribute({ ...contribution('gadget'), point: 'shop.items' })
    const withdraw = point.contribute({ ...contribution('widget'), point: 'shop.items' })
    expect(point.list()).toEqual([])
    expect(point.describe('widget')).toEqual({
      category: 'widget',
      unusable: 'conflict',
      detail: 'the point shop.items is also the point of gadget',
    })
    withdraw()
    expect(point.list().map(listing => listing.category)).toEqual(['gadget'])
  })

  it('takes the namespace again once the category that had it is withdrawn', () => {
    const point = createCategoryPoint()
    const withdraw = point.contribute(directory('gadget', 'gadgets'))
    withdraw()
    point.contribute(directory('widget', 'gadgets'))
    expect(point.lookup('widget')?.layout?.namespace).toBe('gadgets')
  })
})

describe('withdraw a registered category', () => {
  it('removes only that contribution and leaves the others', () => {
    const point = createCategoryPoint()
    const withdrawTool = point.contribute(contribution('tool'))
    point.contribute(contribution('skill'))
    withdrawTool()
    expect(point.lookup('tool')).toBeUndefined()
    expect(point.lookup('skill')?.category).toBe('skill')
    expect(point.list().map(listing => listing.category)).toEqual(['skill'])
  })

  it('takes effect once: a second call does not remove a later contribution', () => {
    const point = createCategoryPoint()
    const withdrawFirst = point.contribute(contribution('tool', 'first'))
    withdrawFirst()
    point.contribute(contribution('tool', 'second'))
    withdrawFirst()
    expect(point.list()).toEqual([
      {
        category: 'tool',
        display: { title: 'second', summary: 'tool summary' },
        creation: 'data',
        point: 'tool.items',
      },
    ])
  })

  it('lets the same category be contributed again as a new contribution', () => {
    const point = createCategoryPoint()
    point.contribute(contribution('tool', 'first'))()
    const withdrawSecond = point.contribute(contribution('tool', 'second'))
    expect(point.list()[0]?.display.title).toBe('second')
    withdrawSecond()
    expect(point.list()).toEqual([])
  })
})

describe('lookup and list', () => {
  it('answers no contract for an unregistered category', () => {
    const point = createCategoryPoint()
    expect(point.lookup('mcp')).toBeUndefined()
    expect(unknownCategory(point, 'mcp')).toEqual({ ok: false, rejected: 'unknown-category' })
    point.contribute(contribution('mcp'))
    expect(unknownCategory(point, 'mcp').ok).toBe(true)
  })

  it('lists by UTF-16 code unit order, independent of contribution order', () => {
    const point = createCategoryPoint()
    for (const category of ['tool', 'model-provider', 'Zeta', 'agent'])
      point.contribute(contribution(category))
    expect(point.list().map(listing => listing.category)).toEqual([
      'Zeta',
      'agent',
      'model-provider',
      'tool',
    ])
  })

  it('keeps its own copy of the display', () => {
    const point = createCategoryPoint()
    const display = { title: '工具', summary: 'summary' }
    point.contribute({ contract: contract('tool'), display, point: 'tool.items' })
    display.title = 'changed'
    expect(point.list()[0]?.display.title).toBe('工具')
    expect(Object.isFrozen(point.list())).toBe(true)
  })
})

describe('how the general entry creates an asset of a category', () => {
  const layout = {
    namespace: 'bundle',
    limits: { files: 1, fileBytes: 1, totalBytes: 1 },
    inspect: async () => ({ ok: { kind: 'object', entries: [] } as JsonValue }),
  }

  it('follows the contract: a layout means a directory, none means a body', () => {
    const point = createCategoryPoint()
    point.contribute(contribution('note'))
    point.contribute({ ...contribution('bundle'), contract: { ...contract('bundle'), layout } })
    expect(creationOf(point, 'note')).toBe('data')
    expect(creationOf(point, 'bundle')).toBe('directory')
  })

  it('is none when the contribution closes the general entry, whatever the contract', () => {
    const point = createCategoryPoint()
    point.contribute({ ...contribution('tool'), generalCreation: 'closed' })
    point.contribute({
      ...contribution('bundle'),
      contract: { ...contract('bundle'), layout },
      generalCreation: 'closed',
    })
    expect(point.list().map(listing => [listing.category, listing.creation])).toEqual([
      ['bundle', 'none'],
      ['tool', 'none'],
    ])
  })

  it('describes one category as it lists it, and nothing for an unregistered one', () => {
    const point = createCategoryPoint()
    point.contribute(contribution('note'))
    expect(point.describe('note')).toBe(point.list()[0])
    expect(point.describe('nobody')).toBeUndefined()
  })
})

describe('what a contribution is admitted as', () => {
  it('carries a creation hint and a closed general entry only when they were given', () => {
    const point = createCategoryPoint()
    point.contribute(contribution('note'))
    point.contribute({
      ...contribution('tool'),
      display: { title: 'T', summary: 'S', creation: 'Pick one.' },
      generalCreation: 'closed',
    })
    expect(point.describe('note')).toStrictEqual({
      category: 'note',
      display: { title: 'note title', summary: 'note summary' },
      creation: 'data',
      point: 'note.items',
    })
    expect(point.describe('tool')).toStrictEqual({
      category: 'tool',
      display: { title: 'T', summary: 'S', creation: 'Pick one.' },
      creation: 'none',
      point: 'tool.items',
    })
    expect(Object.keys(admitCategory(contribution('note'))).sort()).toEqual([
      'contract',
      'display',
      'point',
    ])
    expect(admitCategory({ ...contribution('tool'), generalCreation: 'closed' })).toMatchObject({
      generalCreation: 'closed',
    })
  })
})

describe('the readings when the contributions cannot be read', () => {
  it('gives no contract, lists nothing, and describes any category as unread', () => {
    const view = categoryViewOf(() => ({ kind: 'unavailable', detail: 'assets.categories' }))
    expect(view.lookup('tool')).toBeUndefined()
    expect(view.list()).toEqual([])
    expect(view.describe('tool')).toEqual({
      category: 'tool',
      unusable: 'unread',
      detail: 'assets.categories',
    })
  })

  it('reads again at every question', () => {
    let contributions: CategoryContribution[] = []
    const view = categoryViewOf(() => ({ kind: 'read', contributions }))
    expect(view.lookup('note')).toBeUndefined()
    contributions = [contribution('note')]
    expect(view.lookup('note')?.category).toBe('note')
  })
})

describe('contributions the point refuses', () => {
  it('rejects an empty point', () => {
    const point = createCategoryPoint()
    expect(() => point.contribute({ ...contribution('tool'), point: '' })).toThrow(
      /category point is empty/,
    )
    expect(point.list()).toEqual([])
  })

  it('rejects an empty category name and leaves the point unchanged', () => {
    const point = createCategoryPoint()
    expect(() => point.contribute(contribution(''))).toThrow(/category name is empty/)
    expect(point.list()).toEqual([])
  })

  it('rejects an empty title or summary', () => {
    const point = createCategoryPoint()
    expect(() =>
      point.contribute({ ...contribution('tool'), display: { title: '', summary: 's' } }),
    ).toThrow(/category display is incomplete/)
    expect(() =>
      point.contribute({ ...contribution('tool'), display: { title: 't', summary: '' } }),
    ).toThrow(TypeError)
    expect(point.list()).toEqual([])
  })

  it('copies a deep schema and rejects a cycle', () => {
    const point = createCategoryPoint()
    let schema: { kind: 'array'; items: unknown[] } = {
      kind: 'array',
      items: [{ kind: 'number', lexeme: '0' }],
    }
    for (let depth = 0; depth < 4000; depth += 1) schema = { kind: 'array', items: [schema] }
    point.contribute({
      ...contribution('deep'),
      contract: { ...contract('deep'), schema: schema as never },
    })
    expect(point.lookup('deep')?.schema.kind).toBe('array')
    expect(isReadBody(point.lookup('deep')?.schema)).toBe(false)
    const cycle: { kind: 'array'; items: unknown[] } = { kind: 'array', items: [] }
    cycle.items.push(cycle)
    expect(() =>
      point.contribute({
        ...contribution('cycle'),
        contract: { ...contract('cycle'), schema: cycle as never },
      }),
    ).toThrow(/schema could not be copied/)
    expect(point.lookup('cycle')).toBeUndefined()
  })
})

describe('which category a point is the point of', () => {
  it('gives the listing of the category that named it', () => {
    const point = createCategoryPoint()
    point.contribute(contribution('tool'))
    point.contribute(contribution('note'))
    expect(point.atPoint('note.items')).toBe(point.describe('note'))
  })

  it('answers nothing for a point no category named', () => {
    const point = createCategoryPoint()
    point.contribute(contribution('tool'))
    expect(point.atPoint('shell.tokens')).toBeUndefined()
  })

  it('says the category is unusable when two categories name the point', () => {
    const point = createCategoryPoint()
    point.contribute(contribution('gadget'))
    point.contribute({ ...contribution('widget'), point: 'gadget.items' })
    expect(point.atPoint('gadget.items')).toMatchObject({ unusable: 'conflict' })
  })

  it('says the category is unusable when it is contributed twice', () => {
    const point = createCategoryPoint()
    point.contribute(contribution('tool'))
    point.contribute(contribution('tool'))
    expect(point.atPoint('tool.items')).toMatchObject({ category: 'tool', unusable: 'conflict' })
  })

  it('says unread for any point when the contributions cannot be read', () => {
    const view = categoryViewOf(() => ({ kind: 'unavailable', detail: 'the tree is gone' }))
    expect(view.atPoint('tool.items')).toEqual({
      category: '',
      unusable: 'unread',
      detail: 'the tree is gone',
    })
  })
})
