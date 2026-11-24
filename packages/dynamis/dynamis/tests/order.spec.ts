import { describe, expect, it } from 'vitest'
import {
  deployment,
  ask,
  declare,
  empty,
  install,
  remove,
  report,
  retire,
  type Entry,
  type Instance,
  type Registry,
} from '../src/index.ts'
import {
  below,
  contract,
  entry,
  inst,
  mustInstall,
  pick,
  randomOf,
  registryOf,
  shuffled,
  type Random,
} from './support.ts'

type Held = { standing: 'serving' | 'retiring'; entries: readonly Entry[] }
type World = Map<string, Held>

const FIBERS = ['a', 'b', 'c', 'd']
const KEYS = ['k1', 'k2']
const nameOf = (instance: Instance): string => `${instance.fiber}#${instance.generation}`
const parse = (name: string): Instance => {
  const [fiber, generation] = name.split('#')
  return inst(fiber ?? '', Number(generation))
}

function entriesFor(random: Random, fiber: string): Entry[] {
  const count = below(random, 3)
  const made: Entry[] = []
  for (let index = 0; index < count; index += 1) {
    const key = pick(random, KEYS)
    const id = String(index)
    made.push(
      entry('host.point', key, { id, digest: `${fiber}:${key}:${id}`, rank: below(random, 3) }),
    )
  }
  return made
}

/** One random step on both the registry and an independent bookkeeping of what should be held. */
function step(
  random: Random,
  registry: Registry,
  world: World,
  minted: Map<string, number>,
): Registry {
  const fiber = pick(random, FIBERS)
  const present = [...world.keys()].filter(name => parse(name).fiber === fiber)
  const action = below(random, 4)
  if (action === 0) {
    const generation = (minted.get(fiber) ?? 0) + 1
    const instance = inst(fiber, generation)
    const entries = entriesFor(random, fiber)
    const outcome = install(registry, instance, entries)
    const serving = present.some(name => world.get(name)?.standing === 'serving')
    expect(outcome.kind).toBe(serving ? 'refused' : 'installed')
    if (outcome.kind !== 'installed') return registry
    minted.set(fiber, generation)
    world.set(nameOf(instance), { standing: 'serving', entries })
    return outcome.registry
  }
  const name = present[below(random, present.length)]
  if (name === undefined) return registry
  const held = world.get(name) as Held
  if (action === 1 && held.standing === 'serving') {
    const entries = entriesFor(random, fiber)
    const outcome = install(registry, parse(name), entries)
    expect(outcome.kind).toBe('installed')
    world.set(name, { standing: 'serving', entries })
    return outcome.kind === 'installed' ? outcome.registry : registry
  }
  if (action === 2) {
    world.set(name, { ...held, standing: 'retiring' })
    return retire(registry, parse(name))
  }
  world.delete(name)
  return remove(registry, parse(name))
}

/** The registry that holds exactly what the bookkeeping says: the retiring ones first, each group in the given order. */
function rebuilt(world: World, order: readonly string[]): Registry {
  let registry = empty
  const retiringFirst = [
    ...order.filter(name => world.get(name)?.standing === 'retiring'),
    ...order.filter(name => world.get(name)?.standing === 'serving'),
  ]
  for (const name of retiringFirst) {
    const held = world.get(name) as Held
    const outcome = install(registry, parse(name), held.entries)
    if (outcome.kind !== 'installed') throw new Error(`cannot rebuild ${name}: ${outcome.detail}`)
    registry =
      held.standing === 'retiring' ? retire(outcome.registry, parse(name)) : outcome.registry
  }
  return registry
}

describe('DY-1：登记表的值只由现在装着什么决定', () => {
  it('400 段随机的装卸历史：每一步的值都等于按任意次序从头装出来的值', () => {
    for (let seed = 1; seed <= 400; seed += 1) {
      const random = randomOf(seed)
      const world: World = new Map()
      const minted = new Map<string, number>()
      let registry = empty
      for (let at = 0; at < 30; at += 1) {
        registry = step(random, registry, world, minted)
        const names = [...world.keys()]
        const sorted = rebuilt(world, [...names].sort())
        expect(registry, `seed ${seed} step ${at}`).toEqual(sorted)
        expect(rebuilt(world, shuffled(random, names)), `seed ${seed} step ${at}`).toEqual(sorted)
      }
    }
  })
})

const permutations = <T>(items: readonly T[]): T[][] =>
  items.length <= 1
    ? [[...items]]
    : items.flatMap((item, at) =>
        permutations([...items.slice(0, at), ...items.slice(at + 1)]).map(rest => [item, ...rest]),
      )

describe('DY-4、DY-6：答案与回执也只由现在装着什么决定', () => {
  const POINT = 'memory.stores'
  const parts = (): readonly (readonly [string, readonly Entry[]])[] => [
    ['host', [declare(contract(POINT))]],
    ['good', [entry(POINT, 'graph', { digest: 'good' })]],
    ['rival', [entry(POINT, 'graph', { digest: 'rival' })]],
    ['sloppy', [entry(POINT, 'vector', { item: {}, digest: 'sloppy' })]],
    ['late', [entry('later.point', 'k')]],
  ]
  const seen = (registry: Registry): string =>
    JSON.stringify({
      graph: ask(registry, POINT, 'graph', deployment),
      vector: ask(registry, POINT, 'vector', deployment),
      reports: parts().map(([fiber]) => report(registry, inst(fiber))),
    })

  it('五个 fiber 的 120 种装的先后：答案与回执只有一种', () => {
    const views = new Set(permutations(parts()).map(order => seen(registryOf(...order))))
    expect(views.size).toBe(1)
    const registry = registryOf(...parts())
    expect(ask(registry, POINT, 'graph', deployment).kind).toBe('conflict')
    expect(ask(registry, POINT, 'vector', deployment)).toMatchObject({ kind: 'none' })
    expect(report(registry, inst('sloppy'))[0]?.state).toBe('breach')
  })

  it('撞了之后任何一份走了，剩下的一份立刻生效，和它单独装上一样', () => {
    for (const order of permutations(parts().slice(0, 3))) {
      const both = registryOf(...order)
      expect(ask(both, POINT, 'graph', deployment).kind).toBe('conflict')
      expect(ask(remove(both, inst('good')), POINT, 'graph', deployment)).toEqual(
        ask(
          registryOf(...parts().filter(([fiber]) => fiber === 'host' || fiber === 'rival')),
          POINT,
          'graph',
          deployment,
        ),
      )
      expect(ask(remove(both, inst('rival')), POINT, 'graph', deployment)).toMatchObject({
        kind: 'one',
        holders: [inst('good')],
      })
    }
  })

  it('宿主走了再回来，贡献方什么都没做，回执自己变回生效', () => {
    const all = registryOf(...parts().slice(0, 2))
    const hostless = remove(all, inst('host'))
    expect(report(hostless, inst('good'))[0]?.state).toBe('point-absent')
    const back = mustInstall(hostless, inst('host', 2), [declare(contract(POINT))])
    expect(report(back, inst('good'))[0]?.state).toBe('effective')
  })
})
