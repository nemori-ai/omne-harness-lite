import { describe, expect, it } from 'vitest'
import {
  empty,
  install,
  placedBy,
  remove,
  retire,
  standing,
  withUnread,
  type Entry,
  type Instance,
  type Registry,
} from '../src/index.ts'
import { entry, inst } from './support.ts'

function installed(registry: Registry, instance: Instance, entries: readonly Entry[]): Registry {
  const outcome = install(registry, instance, entries)
  if (outcome.kind !== 'installed') throw new Error(`refused: ${outcome.reason} ${outcome.detail}`)
  return outcome.registry
}

const a = inst('a')
const b = inst('b')
const one = entry('host.point', 'k1')
const two = entry('host.point', 'k2')

describe('install：一个实例的三种状态', () => {
  it('不在：装上，变在服务，条目带上它的标签', () => {
    const registry = installed(empty, a, [one])
    expect(standing(registry, a)).toBe('serving')
    expect(placedBy(registry, a)).toEqual([{ ...one, instance: a }])
  })

  it('空的登记表什么都没有', () => {
    expect(empty).toEqual({ serving: [], retiring: [], placed: [], unread: [] })
    expect(standing(empty, a)).toBe('absent')
  })

  it('placedBy 只给这个实例的', () => {
    const both = installed(installed(empty, a, [one]), b, [two])
    expect(placedBy(both, a).map(placed => placed.key)).toEqual(['k1'])
    expect(placedBy(both, inst('c'))).toEqual([])
  })

  it('不在，没有条目：仍然算在服务', () => {
    expect(standing(installed(empty, a, []), a)).toBe('serving')
  })

  it('在服务，同一组：值不变', () => {
    const once = installed(empty, a, [one, two])
    expect(installed(once, a, [two, one])).toEqual(once)
  })

  it('在服务，另一组：整份换成这一组', () => {
    const registry = installed(installed(empty, a, [one]), a, [two])
    expect(placedBy(registry, a).map(placed => placed.key)).toEqual(['k2'])
  })

  it('正在撤下：拒绝 retiring', () => {
    const retiring = retire(installed(empty, a, [one]), a)
    const outcome = install(retiring, a, [two])
    expect(outcome).toMatchObject({ kind: 'refused', reason: 'retiring' })
    expect(outcome.kind === 'refused' && outcome.detail).toContain('withdrawn')
  })

  it('这个 fiber 另一代在服务：拒绝 generation-serving', () => {
    const registry = installed(empty, a, [one])
    const outcome = install(registry, inst('a', 2), [one])
    expect(outcome).toMatchObject({ kind: 'refused', reason: 'generation-serving' })
    expect(outcome.kind === 'refused' && outcome.detail).toBe('generation 1 of a is serving')
  })

  it('这个 fiber 另一代正在撤下：可以装上', () => {
    const registry = installed(retire(installed(empty, a, [one]), a), inst('a', 2), [one])
    expect(standing(registry, a)).toBe('retiring')
    expect(standing(registry, inst('a', 2))).toBe('serving')
  })

  it('条目上自带的实例标签不算数，以装上的实例为准', () => {
    const forged = { ...one, instance: b } as Entry
    expect(placedBy(installed(empty, a, [forged]), a)).toEqual([{ ...one, instance: a }])
    expect(standing(installed(empty, a, [forged]), b)).toBe('absent')
  })
})

describe('install：不合法的输入都拒绝 invalid', () => {
  const cases: readonly (readonly [string, Instance, readonly Entry[]])[] = [
    ['fiber 为空', inst(''), [one]],
    ['代数为 0', inst('a', 0), [one]],
    ['代数不是整数', inst('a', 1.5), [one]],
    ['代数为负', inst('a', -1), [one]],
    ['点名没有宿主', a, [entry('point', 'k')]],
    ['点名有大写', a, [entry('Host.point', 'k')]],
    ['点名有三段', a, [entry('host.point.more', 'k')]],
    ['作用域里有空段', a, [entry('host.point', 'k', { scope: ['org', ''] })]],
    ['次序不是数', a, [entry('host.point', 'k', { rank: Number.NaN })]],
    ['次序无穷大', a, [entry('host.point', 'k', { rank: Number.POSITIVE_INFINITY })]],
    ['摘要为空', a, [entry('host.point', 'k', { digest: '' })]],
    ['同一处放了两次', a, [one, { ...one, digest: 'other' }]],
  ]
  for (const [name, instance, entries] of cases) {
    it(name, () => {
      const outcome = install(empty, instance, entries)
      expect(outcome.kind).toBe('refused')
      if (outcome.kind === 'refused') {
        expect(outcome.reason).toBe('invalid')
        expect(outcome.detail).not.toBe('')
      }
    })
  }

  it('同点同键、标识不同或作用域不同，不算同一处', () => {
    const entries = [one, { ...one, id: 'x' }, { ...one, scope: ['org'] }]
    expect(install(empty, a, entries).kind).toBe('installed')
  })
})

describe('retire', () => {
  it('在服务：变正在撤下，条目留着', () => {
    const registry = retire(installed(empty, a, [one]), a)
    expect(standing(registry, a)).toBe('retiring')
    expect(placedBy(registry, a)).toHaveLength(1)
  })

  it('正在撤下、不在：值不变', () => {
    const retiring = retire(installed(empty, a, [one]), a)
    expect(retire(retiring, a)).toBe(retiring)
    expect(retire(retiring, b)).toBe(retiring)
  })
})

describe('remove：只按实例标签取走（DY-2）', () => {
  it('同一个键下两个实例，取走一个，另一个原样在', () => {
    const both = installed(installed(empty, a, [one]), b, [one, two])
    const left = remove(both, a)
    expect(standing(left, a)).toBe('absent')
    expect(left).toEqual(installed(empty, b, [one, two]))
  })

  it('同一个 fiber 的两代，取走旧的不动新的', () => {
    const next = inst('a', 2)
    const both = installed(retire(installed(empty, a, [one]), a), next, [one])
    expect(remove(both, a)).toEqual(installed(empty, next, [one]))
  })

  it('正在撤下的也取得走，标记一起走', () => {
    expect(remove(retire(installed(empty, a, [one]), a), a)).toEqual(empty)
  })

  it('不在：值不变', () => {
    const registry = installed(empty, a, [one])
    expect(remove(registry, b)).toBe(registry)
    expect(remove(remove(registry, a), a)).toEqual(empty)
  })
})

describe('登记表是值', () => {
  it('拒绝不改原来的值', () => {
    const registry = installed(empty, a, [one])
    const before = JSON.stringify(registry)
    install(registry, inst('a', 2), [two])
    install(registry, b, [entry('bad', 'k')])
    expect(JSON.stringify(registry)).toBe(before)
  })

  it('值是冻结的，条目的作用域也是', () => {
    const registry = installed(empty, a, [entry('host.point', 'k', { scope: ['org'] })])
    expect(Object.isFrozen(registry)).toBe(true)
    expect(Object.isFrozen(registry.placed)).toBe(true)
    expect(Object.isFrozen(registry.placed[0])).toBe(true)
    expect(Object.isFrozen(registry.placed[0]?.scope)).toBe(true)
  })

  it('装上之后改传进来的数组，登记表不跟着变', () => {
    const scope = ['org']
    const registry = installed(empty, a, [entry('host.point', 'k', { scope })])
    scope.push('tenant')
    expect(registry.placed[0]?.scope).toEqual(['org'])
  })
})

describe('正规次序只认条目自己带的', () => {
  const low = { point: 'a.point', key: 'a', scope: [] as string[], rank: 0, id: 'a', digest: 'a' }
  const high = { point: 'b.point', key: 'b', scope: ['a'], rank: 1, id: 'b', digest: 'b' }
  const fields = ['point', 'key', 'scope', 'rank', 'id', 'digest'] as const

  /** Equal before the field, smaller at it, and larger at everything after it, the instance included. */
  it.each(fields.map((field, at) => [field, at] as const))(
    '%s 排在它后面的各项之前',
    (_field, at) => {
      const first: Record<string, unknown> = { item: null }
      const second: Record<string, unknown> = { item: null }
      fields.forEach((field, index) => {
        first[field] = index <= at ? low[field] : high[field]
        second[field] = index < at ? low[field] : index === at ? high[field] : low[field]
      })
      const registry = installed(installed(empty, inst('y'), [first as Entry]), inst('x'), [
        second as Entry,
      ])
      expect(registry.placed.map(placed => placed.instance.fiber)).toEqual(['y', 'x'])
    },
  )

  it('别的都相同时按实例排：fiber，再代数', () => {
    const same = entry('host.point', 'k')
    const old = retire(installed(empty, inst('b', 1), [same]), inst('b', 1))
    const registry = installed(installed(old, inst('b', 2), [same]), a, [same])
    expect(registry.placed.map(placed => placed.instance)).toEqual([a, inst('b', 1), inst('b', 2)])
    expect(registry.retiring).toEqual([inst('b', 1)])
    expect(registry.serving).toEqual([a, inst('b', 2)])
  })

  it('作用域：浅的在前；同深度逐段比，前面的段相同才看后面的', () => {
    const at = (id: string, scope: string[]): Entry => entry('host.point', 'k', { id, scope })
    const registry = installed(empty, a, [
      at('1', ['b', 'a']),
      at('2', ['a', 'b']),
      at('3', ['a', 'a']),
      at('4', ['z']),
      at('5', []),
    ])
    expect(registry.placed.map(placed => placed.id)).toEqual(['5', '4', '3', '2', '1'])
  })
})

describe('withUnread', () => {
  const unread = { point: 'host.point', source: 'tenant-layer', scope: ['org'] }

  it('整份换成给出的那一组，次序正规，重复的并掉', () => {
    const other = { point: 'a.point', source: 'x', scope: [] }
    const registry = withUnread(empty, [unread, other, unread])
    expect(registry.unread).toEqual([other, unread])
    expect(withUnread(registry, [])).toEqual(empty)
  })

  it('次序：点，再来源，再作用域', () => {
    const of = (point: string, source: string, scope: string[]) => ({ point, source, scope })
    const sorted = [
      of('a.point', 'z', ['z']),
      of('b.point', 'a', ['z']),
      of('b.point', 'b', []),
      of('b.point', 'b', ['a']),
    ]
    expect(withUnread(empty, [...sorted].reverse()).unread).toEqual(sorted)
  })

  it('不动实例与条目', () => {
    const registry = withUnread(installed(empty, a, [one]), [unread])
    expect(standing(registry, a)).toBe('serving')
    expect(placedBy(registry, a)).toHaveLength(1)
  })
})
