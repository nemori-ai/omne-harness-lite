import { describe, expect, it } from 'vitest'
import {
  deployment,
  adopt,
  bound,
  declare,
  refersTo,
  remove,
  resolve,
  retire,
  withUnread,
  type Entry,
  type Reference,
  type Registry,
} from '../src/index.ts'
import { contract, entry, inst, mustInstall, registryOf } from './support.ts'

const MEMORY = 'memory.stores'
const COMPACTION = 'context.compaction'
const impl = (point: string, key: string, fiber: string): readonly [string, readonly Entry[]] => [
  fiber,
  [entry(point, key, { digest: `${fiber}:${key}` })],
]
const world = (...more: readonly (readonly [string, readonly Entry[]])[]): Registry =>
  registryOf(
    ['memory', [declare(contract(MEMORY))]],
    ['context', [declare(contract(COMPACTION))]],
    ...more,
  )
const want = (point: string, ...anyOf: string[]): Reference => ({ point, anyOf })

describe('resolve：依次试点名的键', () => {
  const registry = world(
    impl(MEMORY, 'vector', 'mem-vector'),
    impl(COMPACTION, 'default', 'compact'),
  )

  it('第一个键有：就是它', () => {
    expect(resolve(registry, want(MEMORY, 'vector', 'graph'), deployment)).toMatchObject({
      kind: 'one',
      holders: [inst('mem-vector')],
    })
  })

  it('第一个键没有：试下一个', () => {
    expect(resolve(registry, want(MEMORY, 'graph', 'vector'), deployment)).toMatchObject({
      kind: 'one',
      holders: [inst('mem-vector')],
    })
  })

  it('都没有：没有。一个键都不写也是没有', () => {
    expect(resolve(registry, want(MEMORY, 'graph', 'kv'), deployment).kind).toBe('none')
    expect(resolve(registry, want(MEMORY), deployment)).toEqual({ kind: 'none', filtered: [] })
  })

  it('不找替代：点上有别的键也不拿来顶', () => {
    expect(resolve(registry, want(MEMORY, 'graph'), deployment).kind).toBe('none')
  })

  it('冲突不往下试', () => {
    const clash = world(
      impl(MEMORY, 'graph', 'a'),
      impl(MEMORY, 'graph', 'b'),
      impl(MEMORY, 'vector', 'mem-vector'),
    )
    expect(resolve(clash, want(MEMORY, 'graph', 'vector'), deployment).kind).toBe('conflict')
  })

  it('依据不可用不往下试', () => {
    const unread = withUnread(registry, [{ point: MEMORY, source: 'tenant-layer', scope: [] }])
    expect(resolve(unread, want(MEMORY, 'graph', 'vector'), deployment)).toMatchObject({
      kind: 'unavailable',
      reason: 'unread',
    })
    expect(resolve(registry, want('nobody.point', 'x'), deployment)).toMatchObject({
      kind: 'unavailable',
      reason: 'undeclared',
    })
  })

  it('按发问者的作用域解析', () => {
    const scoped = mustInstall(registry, inst('mem-graph'), [
      entry(MEMORY, 'graph', { scope: ['org'], digest: 'g' }),
    ])
    expect(resolve(scoped, want(MEMORY, 'graph'), deployment).kind).toBe('none')
    expect(resolve(scoped, want(MEMORY, 'graph'), ['org', 't']).kind).toBe('one')
  })
})

describe('adopt：一份定义点名的全部解析成功才算采用', () => {
  const registry = world(
    impl(MEMORY, 'vector', 'mem-vector'),
    impl(MEMORY, 'graph', 'mem-graph'),
    impl(COMPACTION, 'default', 'compact'),
  )

  it('每条引用钉住点、键、标识、作用域、摘要、实例', () => {
    const adoption = adopt(
      registry,
      {
        memory: want(MEMORY, 'graph'),
        compaction: want(COMPACTION, 'semantic', 'default'),
      },
      deployment,
    )
    expect(adoption).toEqual({
      kind: 'adopted',
      bindings: {
        compaction: {
          point: COMPACTION,
          key: 'default',
          id: '',
          scope: [],
          digest: 'compact:default',
          instance: inst('compact'),
        },
        memory: {
          point: MEMORY,
          key: 'graph',
          id: '',
          scope: [],
          digest: 'mem-graph:graph',
          instance: inst('mem-graph'),
        },
      },
    })
  })

  it('两份定义同时各用各的', () => {
    const researcher = adopt(registry, { memory: want(MEMORY, 'graph') }, deployment)
    const coder = adopt(registry, { memory: want(MEMORY, 'vector') }, deployment)
    expect(researcher).toMatchObject({ bindings: { memory: { instance: inst('mem-graph') } } })
    expect(coder).toMatchObject({ bindings: { memory: { instance: inst('mem-vector') } } })
  })

  it('有一条解析不成：整份不可用，逐条列出缺的是什么', () => {
    const clash = mustInstall(registry, inst('other'), [entry(MEMORY, 'graph', { digest: 'o' })])
    const adoption = adopt(
      clash,
      {
        memory: want(MEMORY, 'graph'),
        compaction: want(COMPACTION, 'semantic'),
        tools: want('nobody.point', 'x'),
        fine: want(MEMORY, 'vector'),
      },
      deployment,
    )
    expect(adoption).toEqual({
      kind: 'unavailable',
      missing: [
        { slot: 'compaction', reference: want(COMPACTION, 'semantic'), answer: 'none', detail: '' },
        {
          slot: 'memory',
          reference: want(MEMORY, 'graph'),
          answer: 'conflict',
          detail: 'mem-graph, other',
        },
        {
          slot: 'tools',
          reference: want('nobody.point', 'x'),
          answer: 'unavailable',
          detail: 'undeclared: nobody.point',
        },
      ],
    })
  })

  it('可选的引用：没有时记空；冲突与依据不可用照样算缺', () => {
    const optional = { ...want(COMPACTION, 'semantic'), optional: true }
    expect(adopt(registry, { compaction: optional }, deployment)).toEqual({
      kind: 'adopted',
      bindings: { compaction: null },
    })
    const clash = mustInstall(registry, inst('other'), [entry(MEMORY, 'graph', { digest: 'o' })])
    expect(
      adopt(clash, { memory: { ...want(MEMORY, 'graph'), optional: true } }, deployment).kind,
    ).toBe('unavailable')
    expect(
      adopt(registry, { x: { ...want('nobody.point', 'x'), optional: true } }, deployment).kind,
    ).toBe('unavailable')
  })

  it('什么都不点名：采用成功，没有绑定', () => {
    expect(adopt(registry, {}, deployment)).toEqual({ kind: 'adopted', bindings: {} })
  })

  it('同内容的两个持有者：钉在正规次序里最前的那个实例上', () => {
    const twin = mustInstall(registry, inst('a-twin'), [
      entry(MEMORY, 'graph', { digest: 'mem-graph:graph' }),
    ])
    expect(adopt(twin, { memory: want(MEMORY, 'graph') }, deployment)).toMatchObject({
      bindings: { memory: { instance: inst('a-twin') } },
    })
  })
})

describe('bound：采用之后按钉住的取（DY-8）', () => {
  const registry = world(impl(MEMORY, 'graph', 'mem-graph'))
  const adoption = adopt(registry, { memory: want(MEMORY, 'graph') }, deployment)
  if (adoption.kind !== 'adopted') throw new Error('unreachable')
  const binding = adoption.bindings['memory']
  if (binding === null || binding === undefined) throw new Error('unreachable')

  it('实例在服务：在', () => {
    expect(bound(registry, binding)).toMatchObject({
      kind: 'present',
      standing: 'serving',
      entry: { key: 'graph', instance: inst('mem-graph') },
    })
  })

  it('实例正在撤下：仍然在，并写明', () => {
    expect(bound(retire(registry, inst('mem-graph')), binding)).toMatchObject({
      kind: 'present',
      standing: 'retiring',
    })
  })

  it('实例不在了：不在，哪怕同一个键下有别人', () => {
    const replaced = mustInstall(remove(registry, inst('mem-graph')), inst('other'), [
      entry(MEMORY, 'graph', { digest: 'mem-graph:graph' }),
    ])
    expect(bound(replaced, binding)).toEqual({ kind: 'absent' })
  })

  it('同一个 fiber 的新一代、同样的内容：不在', () => {
    const next = mustInstall(remove(registry, inst('mem-graph')), inst('mem-graph', 2), [
      entry(MEMORY, 'graph', { digest: 'mem-graph:graph' }),
    ])
    expect(bound(next, binding)).toEqual({ kind: 'absent' })
  })

  it.each([
    ['点', { point: COMPACTION }],
    ['键', { key: 'vector' }],
    ['标识', { id: 'x' }],
    ['作用域', { scope: ['org'] }],
    ['摘要', { digest: 'changed' }],
  ] as const)('钉住的%s对不上：不在', (_name, over) => {
    expect(bound(registry, { ...binding, ...over })).toEqual({ kind: 'absent' })
  })

  it('这个实例把这一项换了内容：不在', () => {
    const changed = mustInstall(registry, inst('mem-graph'), [
      entry(MEMORY, 'graph', { digest: 'new content' }),
    ])
    expect(bound(changed, binding)).toEqual({ kind: 'absent' })
  })
})

describe('refersTo：这份采用的哪些槽位钉在这个实例上', () => {
  const registry = world(impl(MEMORY, 'graph', 'mem-graph'), impl(COMPACTION, 'default', 'compact'))

  it('列出槽位，按名字排；没采用成的没有', () => {
    const adoption = adopt(
      registry,
      {
        second: want(MEMORY, 'graph'),
        first: want(MEMORY, 'graph'),
        other: want(COMPACTION, 'default'),
        none: { ...want(COMPACTION, 'semantic'), optional: true },
      },
      deployment,
    )
    expect(refersTo(adoption, inst('mem-graph'))).toEqual(['first', 'second'])
    expect(refersTo(adoption, inst('mem-graph', 2))).toEqual([])
    expect(refersTo(adoption, inst('compact'))).toEqual(['other'])
    expect(
      refersTo(adopt(registry, { x: want(MEMORY, 'nope') }, deployment), inst('mem-graph')),
    ).toEqual([])
  })
})
