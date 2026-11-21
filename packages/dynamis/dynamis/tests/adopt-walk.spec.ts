import { describe, expect, it } from 'vitest'
import {
  adopt,
  bound,
  declare,
  install,
  remove,
  retire,
  type Binding,
  type Instance,
  type Registry,
} from '../src/index.ts'
import { below, contract, entry, inst, pick, randomOf, registryOf, type Random } from './support.ts'

const POINT = 'memory.stores'
const KEY_OF: Readonly<Record<string, string>> = {
  'vector-a': 'vector',
  'graph-a': 'graph',
  'graph-b': 'graph',
}
const WANTS: Readonly<Record<string, readonly string[]>> = {
  researcher: ['graph'],
  coder: ['vector'],
  flexible: ['kv', 'vector', 'graph'],
}
type Live = Map<string, { generation: number; standing: 'serving' | 'retiring' }[]>
type Run = { definition: string; binding: Binding; seen: Set<string> }

const nameOf = (instance: Instance): string => `${instance.fiber}#${instance.generation}`

/** What the definition should get, worked out from the bookkeeping alone. */
function expected(live: Live, definition: string): Instance | 'unavailable' {
  for (const key of WANTS[definition] ?? []) {
    const serving = [...live.entries()].flatMap(([fiber, held]) =>
      KEY_OF[fiber] === key
        ? held.filter(one => one.standing === 'serving').map(one => inst(fiber, one.generation))
        : [],
    )
    if (serving.length === 1) return serving[0] as Instance
    if (serving.length > 1) return 'unavailable'
  }
  return 'unavailable'
}

function change(
  random: Random,
  registry: Registry,
  live: Live,
  minted: Map<string, number>,
): Registry {
  const fiber = pick(random, Object.keys(KEY_OF))
  const held = live.get(fiber) ?? []
  const serving = held.find(one => one.standing === 'serving')
  const action = below(random, 3)
  if (action === 0 && serving === undefined) {
    const generation = (minted.get(fiber) ?? 0) + 1
    minted.set(fiber, generation)
    const outcome = install(registry, inst(fiber, generation), [
      entry(POINT, KEY_OF[fiber] ?? '', { digest: fiber }),
    ])
    if (outcome.kind !== 'installed') throw new Error(outcome.detail)
    live.set(fiber, [...held, { generation, standing: 'serving' }])
    return outcome.registry
  }
  if (action === 1 && serving !== undefined) {
    serving.standing = 'retiring'
    return retire(registry, inst(fiber, serving.generation))
  }
  const gone = held[0]
  if (gone === undefined) return registry
  live.set(fiber, held.slice(1))
  return remove(registry, inst(fiber, gone.generation))
}

describe('DY-7、DY-8：随机的装卸、换代、采用与调用', () => {
  it('300 段历史：采用只绑点名过的键上的恰好一项；一轮只见过一个实例', () => {
    let adopted = 0
    let absent = 0
    for (let seed = 1; seed <= 300; seed += 1) {
      const random = randomOf(seed)
      const live: Live = new Map()
      const minted = new Map<string, number>()
      const runs: Run[] = []
      let registry = registryOf(['host', [declare(contract(POINT))]])
      for (let at = 0; at < 40; at += 1) {
        const where = `seed ${seed} step ${at}`
        const what = below(random, 4)
        if (what < 2) registry = change(random, registry, live, minted)
        else if (what === 2) {
          const definition = pick(random, Object.keys(WANTS))
          const adoption = adopt(registry, {
            memory: { point: POINT, anyOf: WANTS[definition] ?? [] },
          })
          const should = expected(live, definition)
          expect(adoption.kind, where).toBe(should === 'unavailable' ? 'unavailable' : 'adopted')
          if (adoption.kind !== 'adopted' || should === 'unavailable') continue
          const binding = adoption.bindings['memory'] as Binding
          expect(binding.instance, where).toEqual(should)
          expect(WANTS[definition], where).toContain(binding.key)
          runs.push({ definition, binding, seen: new Set() })
          adopted += 1
        } else if (runs.length > 0) {
          const run = pick(random, runs)
          const { fiber, generation } = run.binding.instance
          const present = (live.get(fiber) ?? []).some(one => one.generation === generation)
          const got = bound(registry, run.binding)
          expect(got.kind, where).toBe(present ? 'present' : 'absent')
          if (got.kind === 'present') run.seen.add(nameOf(got.entry.instance))
          else absent += 1
          expect(run.seen.size, where).toBeLessThanOrEqual(1)
          expect(
            [...run.seen].every(name => name === nameOf(run.binding.instance)),
            where,
          ).toBe(true)
        }
      }
    }
    expect(adopted).toBeGreaterThan(300)
    expect(absent).toBeGreaterThan(300)
  })
})
