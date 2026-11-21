import { describe, expect, it } from 'vitest'
import {
  CATALOG,
  declare,
  find,
  render,
  retire,
  tree,
  withUnread,
  type Entry,
  type TreeNode,
} from '../src/index.ts'
import { contract, entry, inst, registryOf } from './support.ts'

const CATEGORIES = 'assets.categories'
const HOLDINGS = 'assets.holdings'
const PAGE = 'assets.category-page'
const PAGES = 'shell.pages'

/** A small system: a keyed point, a point and a client point keyed from it, and a client list. */
const parts = (): readonly (readonly [string, readonly Entry[]])[] => [
  [
    'assets',
    [
      declare(contract(CATEGORIES)),
      declare(contract(HOLDINGS, { keyFrom: CATEGORIES, arity: 'keyed-list' })),
    ],
  ],
  ['assets-ui', [declare(contract(PAGE, { keyFrom: CATEGORIES, tree: 'client' }))]],
  ['shell', [declare(contract(PAGES, { arity: 'list', tree: 'client' }))]],
  ['skill', [entry(CATEGORIES, 'skill'), entry(HOLDINGS, 'skill', { id: 'pdf-tools' })]],
  ['tool', [entry(CATEGORIES, 'tool')]],
  ['mcp-ui', [entry(PAGE, 'mcp', { digest: 'mcp-page' })]],
  ['session-ui', [entry(PAGES, '', { id: 'chat', rank: 0 })]],
  ['usage-ui', [entry(PAGES, '', { id: 'usage', rank: 30 })]],
]

const all = (node: TreeNode): TreeNode[] => [node, ...node.children.flatMap(all)]
const paths = (node: TreeNode): string[] => all(node).map(one => one.path)
const pointsNamed = (node: TreeNode, name: string): TreeNode[] =>
  all(node).filter(one => one.kind === 'point' && one.label === name)

describe('tree：点、键、条目排成一棵树', () => {
  it('只有底：树上只有目录这个点', () => {
    const { root, problems } = tree(registryOf())
    expect(render(root)).toBe(
      ['system', '  server', '    dynamis', `      ${CATALOG}  [keyed-one]`, '  client'].join('\n'),
    )
    expect(problems).toEqual([])
  })

  it('全貌：宿主下是点，点下是键，键下是条目与键取自它的点', () => {
    const { root, problems } = tree(registryOf(...parts()))
    expect(problems).toEqual([])
    expect(render(root)).toBe(
      [
        'system',
        '  server',
        '    assets',
        `      ${CATEGORIES}  [keyed-one]`,
        '        mcp',
        `          ${PAGE}  [keyed-one, client]`,
        '            mcp-ui#1  [effective]',
        '        skill',
        '          skill#1  [effective]',
        `          ${HOLDINGS}  [keyed-list]`,
        '            pdf-tools  [effective, skill#1]',
        '        tool',
        '          tool#1  [effective]',
        '    dynamis',
        `      ${CATALOG}  [keyed-one]`,
        `        ${CATEGORIES}`,
        '          assets#1  [effective]',
        `        ${PAGE}`,
        '          assets-ui#1  [effective]',
        `        ${HOLDINGS}`,
        '          assets#1  [effective]',
        `        ${PAGES}`,
        '          shell#1  [effective]',
        '  client',
        '    shell',
        `      ${PAGES}  [list]`,
        '        chat  [effective, session-ui#1]',
        '        usage  [effective, usage-ui#1]',
      ].join('\n'),
    )
  })

  it('每个节点的路径唯一，按路径找得到（DY-13）', () => {
    const { root } = tree(registryOf(...parts()))
    const every = paths(root)
    expect(new Set(every).size).toBe(every.length)
    for (const node of all(root)) expect(find(root, node.path)).toBe(node)
    expect(
      find(root, `server/assets/${CATEGORIES}/skill/${HOLDINGS}/skill#1:pdf-tools`)?.label,
    ).toBe('pdf-tools')
    expect(find(root, 'server/nobody')).toBeUndefined()
  })

  it('节点的种类：根、边、宿主、点、键、条目', () => {
    const { root } = tree(registryOf(...parts()))
    expect([root.kind, root.label, root.path, root.note]).toEqual(['root', 'system', '', ''])
    const kinds = [
      'server',
      'server/assets',
      `server/assets/${CATEGORIES}`,
      `server/assets/${CATEGORIES}/skill`,
      `server/assets/${CATEGORIES}/skill/skill#1`,
    ].map(path => find(root, path)?.kind)
    expect(kinds).toEqual(['side', 'host', 'point', 'key', 'entry'])
  })

  it('键可以取自目录：这个点挂在每个被声明的点的名字下', () => {
    const registry = registryOf(
      ['docs', [declare(contract('docs.notes', { keyFrom: CATALOG }))]],
      ['writer', [entry('docs.notes', 'docs.notes', { digest: 'about itself' })]],
    )
    const { root, problems } = tree(registry)
    expect(problems).toEqual([])
    expect(find(root, `server/dynamis/${CATALOG}/docs.notes/docs.notes/writer#1`)?.kind).toBe(
      'entry',
    )
  })

  it('每个点恰有一个父：不取键的点只出现一次，取键的点在父的每个有它条目的键下各一次', () => {
    const { root } = tree(registryOf(...parts()))
    expect(pointsNamed(root, CATEGORIES)).toHaveLength(1)
    expect(pointsNamed(root, PAGES)).toHaveLength(1)
    expect(pointsNamed(root, HOLDINGS).map(node => node.path)).toEqual([
      `server/assets/${CATEGORIES}/skill/${HOLDINGS}`,
    ])
    expect(pointsNamed(root, PAGE)).toHaveLength(1)
  })

  it('与装的先后无关', () => {
    const forward = render(tree(registryOf(...parts())).root)
    expect(render(tree(registryOf(...[...parts()].reverse())).root)).toBe(forward)
  })

  it('条目的状态写在节点上：撞键、不合规矩', () => {
    const registry = registryOf(
      ...parts(),
      ['rival', [entry(CATEGORIES, 'tool', { digest: 'rival' })]],
      ['sloppy', [entry(CATEGORIES, 'bad', { item: {} })]],
    )
    const text = render(tree(registry).root)
    expect(text).toContain('          rival#1  [conflict: tool]')
    expect(text).toContain('          tool#1  [conflict: rival]')
    expect(text).toContain('          sloppy#1  [breach: the item lacks label (string)]')
  })

  it('正在撤下的实例放的不上树', () => {
    const registry = retire(registryOf(...parts()), inst('tool'))
    expect(render(tree(registry).root)).not.toContain('tool#1')
  })

  it('读不出的点：点在树上，写明读不出，它自己的条目一个都不列；键取自它的点照常在', () => {
    const registry = withUnread(registryOf(...parts()), [
      { point: CATEGORIES, source: 'tenant-layer', scope: [] },
    ])
    const node = find(tree(registry).root, `server/assets/${CATEGORIES}`)
    expect(node?.note).toBe('keyed-one, unread: tenant-layer')
    expect(node?.children.map(key => key.label)).toEqual(['mcp', 'skill'])
    expect(node?.children.flatMap(key => key.children.map(child => child.kind))).toEqual([
      'point',
      'point',
    ])
  })

  it('按发问者的作用域看', () => {
    const registry = registryOf(...parts(), [
      'tenant-plugin',
      [entry(CATEGORIES, 'notes', { scope: ['org', 't'] })],
    ])
    expect(render(tree(registry).root)).not.toContain('notes')
    const text = render(tree(registry, ['org', 't']).root)
    expect(text).toContain('        notes\n          tenant-plugin#1  [effective, @org/t]')
  })
})

describe('tree：上不了树的列在问题里', () => {
  it('键的来历成环：两个点都不上树', () => {
    const registry = registryOf([
      'loop',
      [
        declare(contract('loop.first', { keyFrom: 'loop.second' })),
        declare(contract('loop.second', { keyFrom: 'loop.first' })),
      ],
    ])
    const { root, problems } = tree(registry)
    expect(pointsNamed(root, 'loop.first')).toEqual([])
    expect(problems).toEqual([
      { kind: 'cyclic', point: 'loop.first', detail: 'loop.first -> loop.second -> loop.first' },
      { kind: 'cyclic', point: 'loop.second', detail: 'loop.second -> loop.first -> loop.second' },
    ])
  })

  it('键取自一个没声明的点：不上树；键取自它的也不上', () => {
    const registry = registryOf([
      'child',
      [
        declare(contract('child.point', { keyFrom: 'nobody.point' })),
        declare(contract('child.deeper', { keyFrom: 'child.point' })),
      ],
    ])
    const { root, problems } = tree(registry)
    expect(pointsNamed(root, 'child.point')).toEqual([])
    expect(problems).toEqual([
      { kind: 'orphan', point: 'child.deeper', detail: 'nobody.point is not declared' },
      { kind: 'orphan', point: 'child.point', detail: 'nobody.point is not declared' },
    ])
  })

  it('放了东西而点没声明；点被声明了两次', () => {
    const registry = registryOf(
      ['a', [entry('nobody.point', 'k'), declare(contract('twice.point'))]],
      ['b', [entry('nobody.point', 'j'), declare(contract('twice.point', { gives: 'else' }))]],
      ['c', [entry('twice.point', 'k'), declare(contract('fine.point'))]],
      ['d', [entry('fine.point', 'twice.point', { digest: 'd' })]],
    )
    const { root, problems } = tree(registry)
    expect(pointsNamed(root, 'twice.point')).toEqual([])
    expect(problems).toEqual([
      { kind: 'stray', point: 'nobody.point', detail: 'a, b' },
      { kind: 'ambiguous', point: 'twice.point', detail: 'a, b' },
    ])
  })

  it('不算问题的：只有一份不合法的声明；目录读不出；正在撤下的与发问者看不见的', () => {
    const invalid = registryOf(['a', [{ ...declare(contract('bad.point')), id: 'x' }]])
    expect(tree(invalid).problems).toEqual([])
    const unread = withUnread(registryOf(['a', [entry('nobody.point', 'k')]]), [
      { point: CATALOG, source: 'plugins', scope: [] },
    ])
    expect(tree(unread).problems).toEqual([])
    const gone = retire(registryOf(['a', [entry('nobody.point', 'k')]]), inst('a'))
    expect(tree(gone).problems).toEqual([])
    const scoped = registryOf(['a', [entry('nobody.point', 'k', { scope: ['org'] })]])
    expect(tree(scoped).problems).toEqual([])
    expect(tree(scoped, ['org']).problems).toHaveLength(1)
  })
})
