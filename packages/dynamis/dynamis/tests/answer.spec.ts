import { describe, expect, it } from 'vitest'
import {
  distinct,
  empty,
  exactlyOne,
  install,
  listed,
  mostSpecific,
  visible,
  type Entry,
  type Placed,
} from '../src/index.ts'
import { entry, inst } from './support.ts'

/** Entries of several fibers, placed and ordered by a real registry. */
function placedOf(...byFiber: readonly (readonly [string, readonly Entry[]])[]): readonly Placed[] {
  let registry = empty
  for (const [fiber, entries] of byFiber) {
    const outcome = install(registry, inst(fiber), entries)
    if (outcome.kind !== 'installed') throw new Error(outcome.detail)
    registry = outcome.registry
  }
  return registry.placed
}

const at = (over: Partial<Entry> = {}): Entry => entry('host.point', 'k', { digest: 'd', ...over })
const fibers = (entries: readonly Placed[]): string[] =>
  entries.map(placed => placed.instance.fiber)

describe('visible：条目的作用域是发问者作用域的前缀', () => {
  it.each([
    [[], [], true],
    [[], ['org', 't'], true],
    [['org'], ['org', 't'], true],
    [['org', 't'], ['org', 't'], true],
    [['org', 't'], ['org'], false],
    [['other'], ['org', 't'], false],
    [['org', 'x'], ['org', 't'], false],
  ] as const)('%j 对 %j：%s', (scope, asker, expected) => {
    expect(visible(scope, asker)).toBe(expected)
  })
})

describe('distinct：同键同标识同作用域同摘要算一项', () => {
  it('并成一项，留正规次序里最前的一份，记下全部持有者', () => {
    const items = distinct(placedOf(['b', [at()]], ['a', [at()]]))
    expect(items).toHaveLength(1)
    expect(items[0]?.entry.instance.fiber).toBe('a')
    expect(items[0]?.holders.map(holder => holder.fiber)).toEqual(['a', 'b'])
  })

  it.each([
    ['摘要不同', { digest: 'other' }],
    ['标识不同', { id: 'x' }],
    ['作用域不同', { scope: ['org'] }],
    ['键不同', { key: 'j' }],
  ] as const)('%s：是两项', (_name, over) => {
    expect(distinct(placedOf(['a', [at()]], ['b', [at(over)]]))).toHaveLength(2)
  })
})

describe('exactlyOne', () => {
  it('0 项：没有', () => {
    expect(exactlyOne([])).toEqual({ kind: 'none', filtered: [] })
  })

  it('1 项：一项', () => {
    const answer = exactlyOne(placedOf(['a', [at()]]))
    expect(answer).toMatchObject({ kind: 'one', holders: [inst('a')], filtered: [] })
  })

  it('同内容的两份：一项，两个持有者', () => {
    const answer = exactlyOne(placedOf(['a', [at()]], ['b', [at()]]))
    expect(answer.kind).toBe('one')
    if (answer.kind === 'one') expect(answer.holders).toHaveLength(2)
  })

  it('内容不同的两份：冲突，列出全部', () => {
    const answer = exactlyOne(placedOf(['a', [at()]], ['b', [at({ digest: 'e' })]]))
    expect(answer.kind).toBe('conflict')
    if (answer.kind === 'conflict') expect(fibers(answer.entries)).toEqual(['a', 'b'])
  })

  it('作用域一深一浅：仍是冲突，不替宿主选', () => {
    const answer = exactlyOne(placedOf(['a', [at()]], ['b', [at({ scope: ['org'] })]]))
    expect(answer.kind).toBe('conflict')
  })

  it('带进来的出局者原样带出去', () => {
    const [gone] = placedOf(['z', [at()]])
    const filtered = [{ entry: gone as Placed, reason: 'breach' as const, detail: 'x' }]
    expect(exactlyOne([], filtered)).toEqual({ kind: 'none', filtered })
  })
})

describe('mostSpecific', () => {
  it('0 项：没有；1 项：一项', () => {
    expect(mostSpecific([])).toEqual({ kind: 'none', filtered: [] })
    expect(mostSpecific(placedOf(['a', [at()]])).kind).toBe('one')
  })

  it('最深的一层恰好 1 项：它胜出，较浅的出局并写明被谁盖过', () => {
    const answer = mostSpecific(
      placedOf(
        ['a', [at()]],
        ['b', [at({ scope: ['org'] })]],
        ['c', [at({ scope: ['org', 't'] })]],
      ),
    )
    expect(answer.kind).toBe('one')
    if (answer.kind !== 'one') return
    expect(answer.entry.instance.fiber).toBe('c')
    expect(answer.filtered.map(out => [out.entry.instance.fiber, out.reason, out.detail])).toEqual([
      ['a', 'overridden', 'org/t'],
      ['b', 'overridden', 'org/t'],
    ])
  })

  it('最深的一层多于 1 项：冲突，只列最深的那几项，较浅的仍出局', () => {
    const answer = mostSpecific(
      placedOf(
        ['a', [at()]],
        ['b', [at({ scope: ['org'] })]],
        ['c', [at({ scope: ['org'], digest: 'e' })]],
      ),
    )
    expect(answer.kind).toBe('conflict')
    if (answer.kind !== 'conflict') return
    expect(fibers(answer.entries)).toEqual(['b', 'c'])
    expect(fibers(answer.filtered.map(out => out.entry))).toEqual(['a'])
  })

  it('最深的一层是同内容的两份：一项', () => {
    const answer = mostSpecific(
      placedOf(['a', [at({ scope: ['org'] })]], ['b', [at({ scope: ['org'] })]]),
    )
    expect(answer.kind).toBe('one')
  })
})

describe('listed', () => {
  it('没有项：空的一列', () => {
    expect(listed([])).toEqual({ kind: 'read', items: [], conflicts: [], filtered: [] })
  })

  it('按次序、标识、键排，与装的先后无关', () => {
    const one = placedOf(
      ['a', [at({ id: 'late', rank: 2 }), at({ id: 'b' })]],
      ['b', [at({ id: 'a' }), at({ id: 'a', key: 'j', digest: 'j' })]],
    )
    const listing = listed(one)
    expect(listing.kind).toBe('read')
    if (listing.kind !== 'read') return
    expect(listing.items.map(item => `${item.entry.id}@${item.entry.key}`)).toEqual([
      'a@j',
      'a@k',
      'b@k',
      'late@k',
    ])
  })

  /** Smaller at the field and larger at everything after it: the field alone decides. */
  it.each([
    ['次序先于标识、键', { rank: 0, id: 'b', key: 'b' }, { rank: 1, id: 'a', key: 'a' }],
    ['标识先于键', { rank: 0, id: 'a', key: 'b' }, { rank: 0, id: 'b', key: 'a' }],
    ['键排在最后', { rank: 0, id: 'a', key: 'a' }, { rank: 0, id: 'a', key: 'b' }],
  ] as const)('%s', (_name, first, second) => {
    const listing = listed(
      placedOf(['a', [at({ ...second, digest: 'a' })]], ['b', [at({ ...first, digest: 'z' })]]),
    )
    if (listing.kind !== 'read') throw new Error('unreachable')
    expect(listing.items.map(item => item.entry.instance.fiber)).toEqual(['b', 'a'])
  })

  it('次序是数的大小，不是文字的先后', () => {
    const listing = listed(placedOf(['a', [at({ id: 'x', rank: 10 }), at({ id: 'y', rank: 9 })]]))
    if (listing.kind !== 'read') throw new Error('unreachable')
    expect(listing.items.map(item => item.entry.id)).toEqual(['y', 'x'])
  })

  it('同一个标识来了不同内容的两项：这个标识是冲突，别的照常在列里', () => {
    const listing = listed(
      placedOf(['a', [at({ id: 'x' }), at({ id: 'y' })]], ['b', [at({ id: 'x', digest: 'e' })]]),
    )
    if (listing.kind !== 'read') throw new Error('unreachable')
    expect(listing.items.map(item => item.entry.id)).toEqual(['y'])
    expect(listing.conflicts.map(fibers)).toEqual([['a', 'b']])
  })

  it('同一个标识同内容的两项：进列，算一项', () => {
    const listing = listed(placedOf(['a', [at({ id: 'x' })]], ['b', [at({ id: 'x' })]]))
    if (listing.kind !== 'read') throw new Error('unreachable')
    expect(listing.items).toHaveLength(1)
    expect(listing.items[0]?.holders).toHaveLength(2)
  })

  it('同一个标识在一深一浅两个作用域：最深的进列，较浅的出局', () => {
    const listing = listed(
      placedOf(['a', [at({ id: 'x' })]], ['b', [at({ id: 'x', scope: ['org'], digest: 'e' })]]),
    )
    if (listing.kind !== 'read') throw new Error('unreachable')
    expect(listing.items.map(item => item.entry.instance.fiber)).toEqual(['b'])
    expect(listing.filtered.map(out => out.reason)).toEqual(['overridden'])
  })
})
