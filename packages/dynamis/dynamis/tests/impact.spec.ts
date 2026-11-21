import { describe, expect, it } from 'vitest'
import {
  declare,
  deployment,
  impact,
  remove,
  report,
  retire,
  supersede,
  type Change,
  type Entry,
  type Registry,
} from '../src/index.ts'
import { below, contract, entry, inst, mustInstall, pick, randomOf, registryOf } from './support.ts'

const POINT = 'memory.stores'
const host = (): readonly [string, readonly Entry[]] => ['host', [declare(contract(POINT))]]
const put = (key: string, digest: string): Entry => entry(POINT, key, { digest })
const told = (changes: readonly Change[]): string[] =>
  changes.map(
    change =>
      `${change.entry.instance.fiber}#${change.entry.instance.generation} ${change.entry.point}/${change.entry.key}: ${change.before} -> ${change.after}${change.detail === '' ? '' : ` (${change.detail})`}`,
  )

describe('impact：一次变更让哪些条目的回执变了', () => {
  const base = (): Registry => registryOf(host(), ['good', [put('graph', 'good')]])

  it('没有变更：没有影响', () => {
    expect(impact(base(), base())).toEqual([])
    expect(impact(registryOf(), registryOf())).toEqual([])
  })

  it('装上一份不撞键的：只有它自己从没有变成生效', () => {
    const after = mustInstall(base(), inst('other'), [put('vector', 'other')])
    expect(told(impact(base(), after))).toEqual([`other#1 ${POINT}/vector: absent -> effective`])
  })

  it('装上一份撞键的：它撞键，在位的那一份也从生效变成撞键', () => {
    const after = mustInstall(base(), inst('rival'), [put('graph', 'rival')])
    expect(told(impact(base(), after))).toEqual([
      `good#1 ${POINT}/graph: effective -> conflict (rival)`,
      `rival#1 ${POINT}/graph: absent -> conflict (good)`,
    ])
  })

  it('卸下宿主：它的声明没了，别人放在这个点上的变成点不在', () => {
    expect(told(impact(base(), remove(base(), inst('host'))))).toEqual([
      `good#1 ${POINT}/graph: effective -> point-absent (${POINT})`,
      `host#1 dynamis.points/${POINT}: effective -> absent`,
    ])
  })

  it('宿主装回来：点上的东西自己变回生效', () => {
    const hostless = remove(base(), inst('host'))
    const back = mustInstall(hostless, inst('host', 2), [declare(contract(POINT))])
    expect(told(impact(hostless, back))).toEqual([
      `host#2 dynamis.points/${POINT}: absent -> effective`,
      `good#1 ${POINT}/graph: point-absent -> effective`,
    ])
  })

  it('撤下撞键的一方：它变正在撤下，另一方变回生效', () => {
    const clash = mustInstall(base(), inst('rival'), [put('graph', 'rival')])
    expect(told(impact(clash, retire(clash, inst('rival'))))).toEqual([
      `good#1 ${POINT}/graph: conflict -> effective`,
      `rival#1 ${POINT}/graph: conflict -> retiring`,
    ])
  })

  it('换代：旧的一代变正在撤下，新的一代生效', () => {
    const outcome = supersede(base(), inst('good'), inst('good', 2), [put('graph', 'good-v2')])
    if (outcome.kind !== 'installed') throw new Error(outcome.detail)
    expect(told(impact(base(), outcome.registry))).toEqual([
      `good#1 ${POINT}/graph: effective -> retiring`,
      `good#2 ${POINT}/graph: absent -> effective`,
    ])
  })

  it('一个实例把内容换了：旧的那一项没了，新的那一项出现', () => {
    const after = mustInstall(base(), inst('good'), [put('graph', 'changed')])
    expect(told(impact(base(), after))).toEqual([
      `good#1 ${POINT}/graph: absent -> effective`,
      `good#1 ${POINT}/graph: effective -> absent`,
    ])
  })

  it('状态没变、原因变了，也算影响', () => {
    const two = mustInstall(base(), inst('rival'), [put('graph', 'rival')])
    const three = mustInstall(two, inst('third'), [put('graph', 'third')])
    expect(told(impact(two, three))).toEqual([
      `good#1 ${POINT}/graph: conflict -> conflict (rival, third)`,
      `rival#1 ${POINT}/graph: conflict -> conflict (good, third)`,
      `third#1 ${POINT}/graph: absent -> conflict (good, rival)`,
    ])
  })

  it('次序：先是后一张登记表里的条目，照它的次序；再是没了的，照前一张的次序', () => {
    const before = registryOf(host(), ['z', [put('graph', 'z')]], ['a', [put('vector', 'a')]])
    const after = mustInstall(remove(remove(before, inst('z')), inst('a')), inst('m'), [
      put('vector', 'm'),
      put('graph', 'm'),
    ])
    expect(told(impact(before, after))).toEqual([
      `m#1 ${POINT}/graph: absent -> effective`,
      `m#1 ${POINT}/vector: absent -> effective`,
      `z#1 ${POINT}/graph: effective -> absent`,
      `a#1 ${POINT}/vector: effective -> absent`,
    ])
  })

  it('不改传进来的两张登记表', () => {
    const before = base()
    const after = mustInstall(before, inst('rival'), [put('graph', 'rival')])
    const texts = [JSON.stringify(before), JSON.stringify(after)]
    impact(before, after)
    expect([JSON.stringify(before), JSON.stringify(after)]).toEqual(texts)
  })
})

describe('impact：贡献只在构建时定的点', () => {
  const PAGES = 'shell.pages'
  const built = (): Registry =>
    registryOf(
      ['shell', [declare(contract(PAGES, { arity: 'list', tree: 'client', binding: 'build' }))]],
      ['session-ui', [entry(PAGES, '', { id: 'chat' })]],
    )

  it('运行中新出现的条目标成来晚了；登记表照常算它生效', () => {
    const after = mustInstall(built(), inst('plugin'), [entry(PAGES, '', { id: 'extra' })])
    const [change] = impact(built(), after)
    expect(change).toMatchObject({ before: 'absent', after: 'effective', late: true })
    expect(report(after, inst('plugin'))[0]?.state).toBe('effective')
  })

  it('来晚的撞了在位的：只有来晚的那一项标出来，在位的那一项状态变了但不标', () => {
    const after = mustInstall(built(), inst('plugin'), [
      entry(PAGES, '', { id: 'chat', digest: 'other' }),
    ])
    expect(
      impact(built(), after).map(change => [
        change.entry.instance.fiber,
        change.after,
        change.late,
      ]),
    ).toEqual([
      ['plugin', 'conflict', true],
      ['session-ui', 'conflict', false],
    ])
  })

  it('本来就在的不标；从这种点上拿走的也不标', () => {
    const changes = impact(built(), remove(built(), inst('session-ui')))
    expect(changes.map(change => [change.before, change.after, change.late])).toEqual([
      ['effective', 'absent', false],
    ])
  })

  it('运行中能变的点上新出现的不标', () => {
    const base = registryOf(['host', [declare(contract(POINT))]])
    const after = mustInstall(base, inst('a'), [put('graph', 'a')])
    expect(impact(base, after).map(change => change.late)).toEqual([false])
  })

  it('点没声明时新出现的不标', () => {
    const after = mustInstall(registryOf(), inst('a'), [put('graph', 'a')])
    expect(impact(registryOf(), after)).toMatchObject([{ after: 'point-absent', late: false }])
  })
})

describe('DY-15：影响就是两张登记表的回执之差', () => {
  const FIBERS = ['a', 'b', 'c', 'host']
  const stock = (fiber: string, variant: number): readonly Entry[] =>
    fiber === 'host'
      ? variant === 0
        ? [declare(contract(POINT))]
        : [declare(contract(POINT, { gives: 'else' }))]
      : [put(pick(randomOf(variant + fiber.length), ['graph', 'vector']), `${fiber}${variant % 2}`)]

  /** Every entry of a registry with its state, keyed by what identifies the entry. */
  const states = (registry: Registry): Map<string, string> => {
    const all = new Map<string, string>()
    for (const instance of [...registry.serving, ...registry.retiring])
      for (const effect of report(registry, instance)) {
        const { point, key, id, scope, digest } = effect.entry
        all.set(
          JSON.stringify([instance, point, key, id, scope, digest]),
          `${effect.state}|${effect.detail}`,
        )
      }
    return all
  }

  it('300 对随机的登记表：把影响套在前一张的回执上，得到后一张的回执', () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const random = randomOf(seed)
      const build = (): Registry => {
        let registry = registryOf()
        for (const fiber of FIBERS) {
          if (below(random, 3) === 0) continue
          registry = mustInstall(
            registry,
            inst(fiber, 1 + below(random, 2)),
            stock(fiber, below(random, 4)),
          )
          if (below(random, 5) === 0)
            registry = retire(registry, registry.serving.at(-1) ?? inst(fiber))
        }
        return registry
      }
      const before = build()
      const after = build()
      const expected = states(after)
      const applied = states(before)
      for (const change of impact(before, after)) {
        const { instance, point, key, id, scope, digest } = change.entry
        const mark = JSON.stringify([instance, point, key, id, scope, digest])
        expect(applied.get(mark)?.split('|')[0] ?? 'absent', `seed ${seed}`).toBe(change.before)
        if (change.after === 'absent') applied.delete(mark)
        else applied.set(mark, `${change.after}|${change.detail}`)
      }
      expect([...applied].sort(), `seed ${seed}`).toEqual([...expected].sort())
      expect(impact(before, before), `seed ${seed}`).toEqual([])
    }
  })

  it('整个部署的作用域是一个导出的常量', () => {
    expect(deployment).toEqual([])
    expect(Object.isFrozen(deployment)).toBe(true)
  })
})
