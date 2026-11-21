import { describe, expect, it } from 'vitest'
import {
  ask,
  candidates,
  CATALOG,
  catalogContract,
  declare,
  list,
  report,
  retire,
  standingOf,
  withdrawOf,
  withUnread,
  type Entry,
  type Registry,
} from '../src/index.ts'
import { contract, entry, inst, mustInstall, registryOf } from './support.ts'

const POINT = 'memory.stores'
/** Built inside each case, so a broken `declare` fails cases instead of the whole file. */
const host = (): Entry => declare(contract(POINT))
const put = (key: string, over: Partial<Entry> = {}): Entry =>
  entry(POINT, key, { digest: `impl:${key}`, ...over })
const hosted = (...more: readonly (readonly [string, readonly Entry[]])[]): Registry =>
  registryOf(['host', [host()]], ...more)

describe('declare：声明一个点就是往目录里放一项', () => {
  it('落在目录这个点上，键是点的名字，内容是规矩', () => {
    expect(host()).toMatchObject({
      point: CATALOG,
      key: POINT,
      id: '',
      scope: [],
      item: contract(POINT),
    })
  })

  it('摘要只看内容，不看字段写的先后', () => {
    const { name, ...rest } = contract(POINT)
    expect(declare({ ...rest, name }).digest).toBe(host().digest)
    expect(declare(contract(POINT, { gives: 'other' })).digest).not.toBe(host().digest)
  })

  it('可以声明在一个作用域里', () => {
    expect(declare(contract(POINT), ['org']).scope).toEqual(['org'])
  })

  it('带副作用的项撤下要排空，其余立刻', () => {
    const of = (kind: 'data' | 'pure' | 'effect') => contract(POINT, { item: { kind, fields: {} } })
    expect([withdrawOf(of('data')), withdrawOf(of('pure')), withdrawOf(of('effect'))]).toEqual([
      'immediate',
      'immediate',
      'drain',
    ])
  })
})

describe('standingOf：一个点的四种状态', () => {
  it('目录自己：总是声明了，规矩是内建的', () => {
    expect(standingOf(registryOf(), CATALOG)).toEqual({
      kind: 'declared',
      contract: catalogContract,
      holders: [],
    })
    expect(catalogContract.name).toBe(CATALOG)
  })

  it('内建的规矩：按点名放，每个名字一份，撞了答冲突', () => {
    expect(catalogContract).toEqual({
      name: 'dynamis.points',
      tree: 'server',
      arity: 'keyed-one',
      keyFrom: null,
      key: 'the name of the declared point, <host>.<name>',
      gives: 'nothing: a declaration is data',
      item: { kind: 'data', fields: { name: 'string', item: 'object' } },
      resolve: 'conflict',
      onError: 'a point whose declaration cannot be read answers unavailable',
      version: 1,
      conformance: null,
      summary: 'The catalog: one item declares one extension point and carries its contract.',
    })
    expect(Object.isFrozen(catalogContract) && Object.isFrozen(catalogContract.item.fields)).toBe(
      true,
    )
  })

  it('别的点的声明不算这个点的', () => {
    const registry = hosted(['other', [declare(contract('other.point'))]])
    expect(standingOf(registry, 'third.point')).toEqual({ kind: 'undeclared' })
    expect(standingOf(registry, POINT).kind).toBe('declared')
    expect(standingOf(registry, 'other.point')).toMatchObject({ holders: [inst('other')] })
  })

  it('没有声明：没声明', () => {
    expect(standingOf(registryOf(), POINT)).toEqual({ kind: 'undeclared' })
  })

  it('一份声明：声明了', () => {
    expect(standingOf(hosted(), POINT)).toEqual({
      kind: 'declared',
      contract: contract(POINT),
      holders: [inst('host')],
    })
  })

  it('两个 fiber 声明内容相同的一份：算一份，两个持有者', () => {
    const standing = standingOf(hosted(['twin', [host()]]), POINT)
    expect(standing).toMatchObject({ kind: 'declared', holders: [inst('host'), inst('twin')] })
  })

  it('两份内容不同：声明了两次，带两家', () => {
    const other = declare(contract(POINT, { gives: 'something else' }))
    expect(standingOf(hosted(['fork', [other]]), POINT)).toEqual({
      kind: 'ambiguous',
      by: [inst('fork'), inst('host')],
    })
  })

  it('正在撤下的 fiber 的声明不算', () => {
    expect(standingOf(retire(hosted(), inst('host')), POINT)).toEqual({ kind: 'undeclared' })
  })

  it('声明在一个作用域里：只有那个作用域之下的发问者看得见', () => {
    const scoped = registryOf(['host', [declare(contract(POINT), ['org'])]])
    expect(standingOf(scoped, POINT, ['org', 't']).kind).toBe('declared')
    expect(standingOf(scoped, POINT).kind).toBe('undeclared')
    expect(standingOf(scoped, POINT, ['other']).kind).toBe('undeclared')
  })

  it('目录有读不出的来源：读不出', () => {
    const registry = withUnread(hosted(), [{ point: CATALOG, source: 'plugins', scope: [] }])
    expect(standingOf(registry, POINT)).toEqual({ kind: 'unreadable', source: 'plugins' })
  })

  const good = contract(POINT)
  const bad = (): readonly (readonly [string, Entry])[] => [
    ['名字不等于键', { ...host(), item: contract('memory.other') }],
    ['键是目录自己', { ...declare(contract(CATALOG)) }],
    ['带了标识', { ...host(), id: 'x' }],
    ['内容不是对象', { ...host(), item: 'a contract' }],
    ['内容是 null', { ...host(), item: null }],
    ['名字不是点名', { ...declare({ ...good, name: 'Memory' }), key: POINT }],
    ['名字是数组', { ...host(), item: { ...good, name: [POINT] } }],
    ['键取自的是数组', { ...host(), item: { ...good, keyFrom: ['assets.categories'] } }],
    ['树不认识', { ...host(), item: { ...good, tree: 'edge' } }],
    ['能放几项不认识', { ...host(), item: { ...good, arity: 'many' } }],
    ['键取自自己', { ...host(), item: { ...good, keyFrom: POINT } }],
    ['键取自的不是点名', { ...host(), item: { ...good, keyFrom: 'nowhere' } }],
    ['说明不是文字', { ...host(), item: { ...good, summary: 7 } }],
    ['键的说明不是文字', { ...host(), item: { ...good, key: null } }],
    ['宿主给什么不是文字', { ...host(), item: { ...good, gives: undefined } }],
    ['出错时怎样答不是文字', { ...host(), item: { ...good, onError: [] } }],
    ['项的种类不认识', { ...host(), item: { ...good, item: { kind: 'magic', fields: {} } } }],
    ['项没写', { ...host(), item: { ...good, item: null } }],
    ['字段表不是对象', { ...host(), item: { ...good, item: { kind: 'data', fields: null } } }],
    [
      '字段的种类不认识',
      { ...host(), item: { ...good, item: { kind: 'data', fields: { a: 'date' } } } },
    ],
    ['答法不认识', { ...host(), item: { ...good, resolve: 'first' } }],
    ['主版本不是正整数', { ...host(), item: { ...good, version: 0 } }],
    ['主版本不是整数', { ...host(), item: { ...good, version: 1.5 } }],
    ['符合性用例既不是文字也不是空', { ...host(), item: { ...good, conformance: 3 } }],
  ]
  const why: Readonly<Record<string, string>> = {
    名字不等于键: 'the contract names another point',
    键是目录自己: 'the catalog declares itself; this key is reserved',
    带了标识: 'this point takes no id',
    内容不是对象: 'the contract is not an object',
    '内容是 null': 'the contract is not an object',
    名字不是点名: 'the name is not a point name',
    名字是数组: 'the name is not a point name',
    键取自的是数组: 'keyFrom names no other point',
    树不认识: 'the tree is unknown',
    能放几项不认识: 'the arity is unknown',
    键取自自己: 'keyFrom names no other point',
    键取自的不是点名: 'keyFrom names no other point',
    说明不是文字: 'summary is not text',
    键的说明不是文字: 'key is not text',
    宿主给什么不是文字: 'gives is not text',
    出错时怎样答不是文字: 'onError is not text',
    项的种类不认识: 'the item kind is unknown',
    项没写: 'the item kind is unknown',
    字段表不是对象: 'the item fields are not an object',
    字段的种类不认识: 'the kind of field a is unknown',
    答法不认识: 'the resolve rule is unknown',
    主版本不是正整数: 'the version is not a positive integer',
    主版本不是整数: 'the version is not a positive integer',
    符合性用例既不是文字也不是空: 'conformance is neither text nor null',
  }
  it.each(Object.keys(why))('不合法的声明不算数：%s', name => {
    const found = bad().find(([title]) => title === name)
    if (found === undefined) throw new Error(`no declaration named ${name}`)
    const declaration = found[1]
    const registry = registryOf(['host', [declaration]])
    expect(standingOf(registry, declaration.key === CATALOG ? 'nothing.here' : POINT)).toEqual({
      kind: 'undeclared',
    })
    expect(Object.keys(why)).toHaveLength(bad().length)
    expect(report(registry, inst('host'))[0]).toMatchObject({ state: 'breach', detail: why[name] })
  })

  it('键取自另一个点、符合性用例写了路径：合法', () => {
    const declaration = declare(
      contract(POINT, { keyFrom: 'assets.categories', conformance: 'memory-contract/conformance' }),
    )
    expect(standingOf(registryOf(['host', [declaration]]), POINT).kind).toBe('declared')
  })
})

describe('candidates 与 ask：读一个点的前置', () => {
  it('没声明：依据不可用 undeclared', () => {
    expect(ask(registryOf(['a', [put('graph')]]), POINT, 'graph')).toEqual({
      kind: 'unavailable',
      reason: 'undeclared',
      detail: POINT,
    })
  })

  it('声明了两次：依据不可用 ambiguous，带两家', () => {
    const fork = declare(contract(POINT, { gives: 'else' }))
    expect(ask(hosted(['fork', [fork]]), POINT, 'graph')).toEqual({
      kind: 'unavailable',
      reason: 'ambiguous',
      detail: 'fork, host',
    })
  })

  it('目录读不出：依据不可用 unread', () => {
    const registry = withUnread(hosted(), [{ point: CATALOG, source: 'plugins', scope: [] }])
    expect(ask(registry, POINT, 'graph')).toEqual({
      kind: 'unavailable',
      reason: 'unread',
      detail: 'plugins',
    })
    expect(ask(registry, CATALOG, POINT)).toMatchObject({ kind: 'unavailable', reason: 'unread' })
  })

  it('这个点有对发问者可见的读不出的来源：依据不可用 unread', () => {
    const registry = withUnread(hosted(['a', [put('graph')]]), [
      { point: POINT, source: 'tenant-layer', scope: ['org'] },
    ])
    expect(ask(registry, POINT, 'graph', ['org', 't'])).toEqual({
      kind: 'unavailable',
      reason: 'unread',
      detail: 'tenant-layer',
    })
    expect(ask(registry, POINT, 'graph').kind).toBe('one')
    expect(ask(registry, POINT, 'graph', ['other']).kind).toBe('one')
  })

  it('别的点读不出，不影响这个点', () => {
    const registry = withUnread(hosted(['a', [put('graph')]]), [
      { point: 'other.point', source: 'x', scope: [] },
    ])
    expect(ask(registry, POINT, 'graph').kind).toBe('one')
  })

  it('读得出：没有、一项', () => {
    const registry = hosted(['a', [put('graph')]])
    expect(ask(registry, POINT, 'vector')).toEqual({ kind: 'none', filtered: [] })
    expect(ask(registry, POINT, 'graph')).toMatchObject({ kind: 'one', holders: [inst('a')] })
  })

  it('正在撤下的实例放的不看', () => {
    const registry = retire(hosted(['a', [put('graph')]]), inst('a'))
    expect(ask(registry, POINT, 'graph')).toEqual({ kind: 'none', filtered: [] })
  })

  it('发问者看不见的作用域里的不看', () => {
    const registry = hosted(['a', [put('graph', { scope: ['org', 't'] })]])
    expect(ask(registry, POINT, 'graph', ['org']).kind).toBe('none')
    expect(ask(registry, POINT, 'graph', ['org', 't']).kind).toBe('one')
  })

  it('规矩写冲突：一深一浅也是冲突；规矩写最具体的胜出：深的胜出', () => {
    const entries: readonly (readonly [string, readonly Entry[]])[] = [
      ['a', [put('graph')]],
      ['b', [put('graph', { scope: ['org'], digest: 'tenant' })]],
    ]
    expect(ask(hosted(...entries), POINT, 'graph', ['org']).kind).toBe('conflict')
    const layered = registryOf(
      ['host', [declare(contract(POINT, { resolve: 'most-specific' }))]],
      ...entries,
    )
    const answer = ask(layered, POINT, 'graph', ['org'])
    expect(answer).toMatchObject({ kind: 'one', holders: [inst('b')] })
    expect(ask(layered, POINT, 'graph')).toMatchObject({ kind: 'one', holders: [inst('a')] })
  })

  it('candidates 不给键时给出全部键下的条目，连同规矩', () => {
    const read = candidates(hosted(['a', [put('graph'), put('vector')]]), POINT, null)
    expect(read.kind).toBe('read')
    if (read.kind !== 'read') return
    expect(read.contract).toEqual(contract(POINT))
    expect(read.entries.map(placed => placed.key)).toEqual(['graph', 'vector'])
  })
})

describe('核规矩是答案的一部分（DY-6）', () => {
  const shaped = (arity: 'one' | 'list' | 'keyed-one' | 'keyed-list', fields = {}) =>
    declare(contract(POINT, { arity, item: { kind: 'data', fields } }))
  const breachOf = (declaration: Entry, entries: readonly Entry[]): readonly string[] => {
    const read = candidates(registryOf(['host', [declaration]], ['a', entries]), POINT, null)
    if (read.kind !== 'read') throw new Error('unreachable')
    expect(read.entries).toHaveLength(entries.length - read.filtered.length)
    return read.filtered.map(out => `${out.reason}: ${out.detail}`)
  }

  it.each(['one', 'list'] as const)('%s 的点上键不为空：出局', arity => {
    expect(breachOf(shaped(arity), [put('k'), put('')])).toEqual([
      'breach: this point takes no key',
    ])
  })

  it.each(['one', 'keyed-one'] as const)('%s 的点上标识不为空：出局', arity => {
    expect(breachOf(shaped(arity), [put('', { id: 'x' }), put('')])).toEqual([
      'breach: this point takes no id',
    ])
  })

  it('每键一列的点上键与标识都可以有', () => {
    expect(breachOf(shaped('keyed-list'), [put('k', { id: 'x' })])).toEqual([])
  })

  it.each([
    ['内容不是对象', 'text', 'the item is not an object'],
    ['内容是 null', null, 'the item is not an object'],
    ['内容是数组', ['label'], 'the item is not an object'],
    ['缺字段', {}, 'the item lacks label (string)'],
    ['字段种类不对', { label: 7 }, 'the item lacks label (string)'],
  ] as const)('%s：出局并写明', (_name, item, detail) => {
    const declaration = shaped('keyed-one', { label: 'string' })
    expect(breachOf(declaration, [put('k', { item })])).toEqual([`breach: ${detail}`])
  })

  it('六种字段种类各自认得', () => {
    const fields = {
      s: 'string',
      n: 'number',
      b: 'boolean',
      f: 'function',
      o: 'object',
      a: 'array',
    }
    const good = { s: '', n: 0, b: false, f: () => 0, o: {}, a: [] }
    const declaration = shaped('keyed-one', fields)
    expect(breachOf(declaration, [put('k', { item: good })])).toEqual([])
    const swapped = { s: 0, n: '', b: 0, f: {}, o: [], a: {} }
    for (const field of Object.keys(fields) as (keyof typeof fields)[]) {
      const item = { ...good, [field]: swapped[field] }
      expect(breachOf(declaration, [put('k', { item })])).toEqual([
        `breach: the item lacks ${field} (${fields[field]})`,
      ])
    }
    expect(breachOf(declaration, [put('k', { item: { ...good, o: null } })])).toEqual([
      'breach: the item lacks o (object)',
    ])
  })

  it('不合规矩的不挡合规矩的：答案里它在出局者里', () => {
    const registry = hosted(
      ['good', [put('graph')]],
      ['sloppy', [put('graph', { item: {}, digest: 's' })]],
    )
    const answer = ask(registry, POINT, 'graph')
    expect(answer).toMatchObject({ kind: 'one', holders: [inst('good')] })
    if (answer.kind === 'one') expect(answer.filtered.map(out => out.reason)).toEqual(['breach'])
  })
})

describe('list：放一列的点', () => {
  const listPoint = (): Entry => declare(contract(POINT, { arity: 'list' }))

  it('按次序给出，不合规矩的出局', () => {
    const registry = registryOf(
      ['host', [listPoint()]],
      ['a', [put('', { id: 'second', rank: 2 }), put('', { id: 'bad', item: {} })]],
      ['b', [put('', { id: 'first', rank: 1 })]],
    )
    const listing = list(registry, POINT, null)
    expect(listing.kind).toBe('read')
    if (listing.kind !== 'read') return
    expect(listing.items.map(item => item.entry.id)).toEqual(['first', 'second'])
    expect(listing.filtered.map(out => out.entry.id)).toEqual(['bad'])
  })

  it('只要一个键下的', () => {
    const keyed = declare(contract(POINT, { arity: 'keyed-list' }))
    const registry = registryOf(
      ['host', [keyed]],
      ['a', [put('k', { id: '1' }), put('j', { id: '2' })]],
    )
    const listing = list(registry, POINT, 'k')
    if (listing.kind !== 'read') throw new Error('unreachable')
    expect(listing.items.map(item => item.entry.id)).toEqual(['1'])
  })

  it('点没声明：依据不可用', () => {
    expect(list(registryOf(), POINT, null)).toMatchObject({
      kind: 'unavailable',
      reason: 'undeclared',
    })
  })
})

describe('report：一个实例放的每一项的回执', () => {
  const stateOf = (registry: Registry, fiber: string): readonly string[] =>
    report(registry, inst(fiber)).map(
      effect => `${effect.entry.point}/${effect.entry.key}: ${effect.state}`,
    )

  it('生效', () => {
    expect(stateOf(hosted(['a', [put('graph')]]), 'a')).toEqual([`${POINT}/graph: effective`])
    expect(stateOf(hosted(), 'host')).toEqual([`${CATALOG}/${POINT}: effective`])
  })

  it('点不在', () => {
    expect(stateOf(registryOf(['a', [put('graph')]]), 'a')).toEqual([
      `${POINT}/graph: point-absent`,
    ])
  })

  it('点被声明了两次', () => {
    const fork = declare(contract(POINT, { gives: 'else' }))
    const registry = hosted(['fork', [fork]], ['a', [put('graph')]])
    const [effect] = report(registry, inst('a'))
    expect(effect).toMatchObject({ state: 'point-ambiguous', detail: 'fork, host' })
    expect(stateOf(registry, 'fork')).toEqual([`${CATALOG}/${POINT}: conflict`])
  })

  it('读不出', () => {
    const registry = withUnread(hosted(['a', [put('graph')]]), [
      { point: POINT, source: 'tenant-layer', scope: [] },
    ])
    expect(report(registry, inst('a'))[0]).toMatchObject({
      state: 'unread',
      detail: 'tenant-layer',
    })
  })

  it('不合规矩，写明缺什么', () => {
    const registry = hosted(['a', [put('graph', { item: {} })]])
    expect(report(registry, inst('a'))[0]).toMatchObject({
      state: 'breach',
      detail: 'the item lacks label (string)',
    })
  })

  it('撞键，写明和谁', () => {
    const registry = hosted(['a', [put('graph')]], ['b', [put('graph', { digest: 'b' })]])
    expect(report(registry, inst('a'))[0]).toMatchObject({ state: 'conflict', detail: 'b' })
    expect(report(registry, inst('b'))[0]).toMatchObject({ state: 'conflict', detail: 'a' })
  })

  it('撞了三家：写明另外两家', () => {
    const registry = hosted(
      ['a', [put('graph')]],
      ['b', [put('graph', { digest: 'b' })]],
      ['c', [put('graph', { digest: 'c' })]],
    )
    expect(report(registry, inst('a'))[0]).toMatchObject({ state: 'conflict', detail: 'b, c' })
  })

  it('同一个键下别人的不合规矩，不连累合规矩的这一份', () => {
    const registry = hosted(['a', [put('graph')]], ['b', [put('graph', { item: {}, digest: 'b' })]])
    expect(report(registry, inst('a'))[0]).toEqual({
      entry: { ...put('graph'), instance: inst('a') },
      state: 'effective',
      detail: '',
    })
    expect(report(registry, inst('b'))[0]?.state).toBe('breach')
  })

  it('别的键下的不算撞', () => {
    const registry = hosted(['a', [put('graph')]], ['b', [put('vector', { digest: 'b' })]])
    expect(stateOf(registry, 'a')).toEqual([`${POINT}/graph: effective`])
  })

  describe('一深一浅、内容不同的两份', () => {
    const parts: readonly (readonly [string, readonly Entry[]])[] = [
      ['wide', [put('graph')]],
      ['deep', [put('graph', { scope: ['org'], digest: 'deep' })]],
    ]

    it('规矩写冲突：深的那一份撞键，浅的在自己的作用域里生效', () => {
      const registry = hosted(...parts)
      expect(report(registry, inst('deep'))[0]).toMatchObject({ state: 'conflict', detail: 'wide' })
      expect(report(registry, inst('wide'))[0]?.state).toBe('effective')
    })

    it('规矩写最具体的胜出：两份都生效', () => {
      const registry = registryOf(
        ['host', [declare(contract(POINT, { resolve: 'most-specific' }))]],
        ...parts,
      )
      expect(report(registry, inst('deep'))[0]?.state).toBe('effective')
      expect(report(registry, inst('wide'))[0]?.state).toBe('effective')
    })

    it('放一列的点：同一个标识一深一浅，两份都生效', () => {
      const registry = registryOf(
        ['host', [declare(contract(POINT, { arity: 'keyed-list' }))]],
        ['wide', [put('graph', { id: 'x' })]],
        ['deep', [put('graph', { id: 'x', scope: ['org'], digest: 'deep' })]],
      )
      expect(report(registry, inst('deep'))[0]?.state).toBe('effective')
      expect(report(registry, inst('wide'))[0]?.state).toBe('effective')
    })
  })

  it('同内容的两份不算撞键：两边都生效', () => {
    const registry = hosted(['a', [put('graph')]], ['b', [put('graph')]])
    expect(stateOf(registry, 'a')).toEqual([`${POINT}/graph: effective`])
    expect(stateOf(registry, 'b')).toEqual([`${POINT}/graph: effective`])
  })

  it('正在撤下', () => {
    const registry = retire(hosted(['a', [put('graph')]]), inst('a'))
    expect(stateOf(registry, 'a')).toEqual([`${POINT}/graph: retiring`])
    expect(report(registry, inst('a'))[0]?.detail).toBe('')
  })

  it('放一列的点：同一个标识撞了算撞键，别的生效', () => {
    const registry = registryOf(
      ['host', [declare(contract(POINT, { arity: 'list' }))]],
      ['a', [put('', { id: 'x' }), put('', { id: 'y', digest: 'y' })]],
      ['b', [put('', { id: 'x', digest: 'other' })]],
    )
    expect(
      report(registry, inst('a')).map(effect => `${effect.entry.id}: ${effect.state}`),
    ).toEqual(['x: conflict', 'y: effective'])
  })

  it('不在的实例没有回执', () => {
    expect(report(hosted(), inst('nobody'))).toEqual([])
  })

  it('回执按这一项自己的作用域问', () => {
    const scoped = mustInstall(hosted(), inst('a'), [put('graph', { scope: ['org'] })])
    expect(stateOf(scoped, 'a')).toEqual([`${POINT}/graph: effective`])
  })
})
