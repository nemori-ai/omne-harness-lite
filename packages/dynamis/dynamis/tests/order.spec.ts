import { describe, expect, it } from 'vitest'
import {
  empty,
  install,
  remove,
  retire,
  type Entry,
  type Instance,
  type Registry,
} from '../src/index.ts'
import { below, entry, inst, pick, randomOf, shuffled, type Random } from './support.ts'

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
