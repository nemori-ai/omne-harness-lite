import { describe, expect, it } from 'vitest'
import {
  admit,
  complete,
  empty,
  finish,
  install,
  lost,
  noCalls,
  reconcile,
  record,
  remove,
  retire,
  standing,
  type Call,
  type Instance,
  type Ledger,
  type Registry,
} from '../src/index.ts'
import { below, inst, pick, randomOf, type Random } from './support.ts'

const FIBERS = ['a', 'b', 'c']
type World = { registry: Registry; ledger: Ledger; minted: Map<string, number>; next: number }

const present = (world: World): Instance[] => [
  ...world.registry.serving,
  ...world.registry.retiring,
]
const anyInstance = (random: Random, world: World): Instance => {
  const fiber = pick(random, FIBERS)
  return inst(fiber, 1 + below(random, (world.minted.get(fiber) ?? 0) + 1))
}
const anyCall = (random: Random, world: World): string => `c${1 + below(random, world.next + 1)}`

/** One random action of the model; returns the instance it was aimed at, when it was aimed at one. */
function act(
  random: Random,
  world: World,
): { on: Instance | null; kill: boolean; admitted: Instance | null } {
  const action = below(random, 9)
  const on = anyInstance(random, world)
  if (action === 0) {
    const generation = (world.minted.get(on.fiber) ?? 0) + 1
    const outcome = install(world.registry, inst(on.fiber, generation), [])
    if (outcome.kind !== 'installed') return { on: null, kill: false, admitted: null }
    world.minted.set(on.fiber, generation)
    world.registry = outcome.registry
    return { on: inst(on.fiber, generation), kill: false, admitted: null }
  }
  if (action <= 2) {
    const before = standing(world.registry, on)
    const outcome = admit(world.registry, world.ledger, on, `c${world.next + 1}`)
    expect(outcome.kind).toBe(before === 'serving' ? 'admitted' : 'refused')
    if (outcome.kind !== 'admitted') return { on: null, kill: false, admitted: null }
    world.ledger = outcome.ledger
    world.next += 1
    return { on: null, kill: false, admitted: on }
  }
  if (action === 3 || action === 4) {
    const outcome = (action === 3 ? record : finish)(world.ledger, anyCall(random, world))
    if (outcome.kind === 'moved') world.ledger = outcome.ledger
    return { on: null, kill: false, admitted: null }
  }
  if (action === 5) {
    world.registry = retire(world.registry, on)
    return { on, kill: false, admitted: null }
  }
  if (action === 6) {
    const outcome = complete(world.registry, world.ledger, on)
    if (outcome.kind === 'withdrawn') world.registry = outcome.registry
    return { on, kill: false, admitted: null }
  }
  if (action === 7) {
    world.registry = remove(world.registry, on)
    world.ledger = lost(world.ledger, on)
    return { on, kill: true, admitted: null }
  }
  const outcome = reconcile(world.ledger, anyCall(random, world))
  if (outcome.kind !== 'refused') world.ledger = outcome.ledger
  return { on: null, kill: false, admitted: null }
}

const same = (left: Instance, right: Instance): boolean =>
  left.fiber === right.fiber && left.generation === right.generation

describe('DY-9、DY-10：随机的受理、收场、撤下、突然没了与认回', () => {
  it('400 段动作序列：模型的四条不变式与每步断言逐步成立', () => {
    let unknowns = 0
    let withdrawn = 0
    for (let seed = 1; seed <= 400; seed += 1) {
      const random = randomOf(seed)
      const world: World = { registry: empty, ledger: noCalls, minted: new Map(), next: 0 }
      const pinned = new Map<string, Instance>()
      for (let at = 0; at < 60; at += 1) {
        const where = `seed ${seed} step ${at}`
        const before = new Map(world.ledger.calls.map(call => [call.id, call]))
        const retiringBefore = world.registry.retiring.length
        const did = act(random, world)
        if (world.registry.retiring.length < retiringBefore && !did.kill) withdrawn += 1
        for (const call of world.ledger.calls) {
          const was = before.get(call.id)
          const first = pinned.get(call.id) ?? call.instance
          pinned.set(call.id, first)
          // Pinned：一次调用只钉在一个实例上
          expect(same(call.instance, first), where).toBe(true)
          // NoOrphan：在跑的调用，它的实例还在
          if (call.state === 'running')
            expect(
              present(world).some(held => same(held, call.instance)),
              where,
            ).toBe(true)
          if (was === undefined) continue
          // 每步断言：完成的不改写；认不回的保持未知；无关的调用不受影响
          if (was.state === 'done') expect(call, where).toEqual(was)
          if (was.state === 'unknown' && !was.recorded) expect(call, where).toEqual(was)
          if (did.on !== null && !same(call.instance, did.on)) expect(call, where).toEqual(was)
          // PlannedIsClean：未知只在突然没了的那一步出现
          if (call.state === 'unknown' && was.state !== 'unknown') {
            expect(did.kill, where).toBe(true)
            unknowns += 1
          }
        }
        expect(world.ledger.calls.length, where).toBe(before.size + (did.admitted === null ? 0 : 1))
        const fresh: Call | undefined = world.ledger.calls.find(call => !before.has(call.id))
        // NoLateAdmit：新受理的调用钉在受理那一刻在服务的实例上
        if (fresh !== undefined)
          expect(same(fresh.instance, did.admitted as Instance), where).toBe(true)
      }
    }
    expect(unknowns).toBeGreaterThan(100)
    expect(withdrawn).toBeGreaterThan(100)
  })
})
