import { describe, expect, it } from 'vitest'
import {
  createCategoryPoint,
  readBodyText,
  unknownCategory,
  type BodyContract,
  type CategoryContribution,
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
  return { contract: contract(category), display: { title, summary: `${category} summary` } }
}

describe('contribute to an unregistered category', () => {
  it('makes the contract findable and the category listed', () => {
    const point = createCategoryPoint()
    point.contribute(contribution('tool', '工具'))
    expect(point.lookup('tool')?.category).toBe('tool')
    expect(point.lookup('tool')?.judge(document('{"name":"tool"}'))).toEqual({ ok: true })
    expect(point.list()).toEqual([
      { category: 'tool', display: { title: '工具', summary: 'tool summary' } },
    ])
  })
})

describe('contribute to a registered category', () => {
  it('throws an assembly error and keeps the first contribution', () => {
    const point = createCategoryPoint()
    point.contribute({ ...contribution('tool', 'first'), contract: contract('tool', 'first') })
    const before = point.list()
    expect(() => point.contribute(contribution('tool', 'second'))).toThrow(TypeError)
    expect(() => point.contribute(contribution('tool', 'second'))).toThrow(/already registered/)
    expect(point.lookup('tool')?.judge(document('{"name":"first"}'))).toEqual({ ok: true })
    expect(point.list()).toEqual(before)
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
      { category: 'tool', display: { title: 'second', summary: 'tool summary' } },
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
    point.contribute({ contract: contract('tool'), display })
    display.title = 'changed'
    expect(point.list()[0]?.display.title).toBe('工具')
    expect(Object.isFrozen(point.list())).toBe(true)
  })
})

describe('contributions the point refuses', () => {
  it('rejects an empty category name and leaves the point unchanged', () => {
    const point = createCategoryPoint()
    expect(() => point.contribute(contribution(''))).toThrow(/category name is empty/)
    expect(point.list()).toEqual([])
  })

  it('rejects an empty title or summary', () => {
    const point = createCategoryPoint()
    expect(() =>
      point.contribute({ contract: contract('tool'), display: { title: '', summary: 's' } }),
    ).toThrow(TypeError)
    expect(() =>
      point.contribute({ contract: contract('tool'), display: { title: 't', summary: '' } }),
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
