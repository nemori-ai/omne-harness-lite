import {
  empty,
  install,
  retire,
  type Entry,
  type Instance,
  type Registry,
} from '@omne-harness/dynamis'
import { describe, expect, it } from 'vitest'
import { drained, drop, gone, noSeats, put, ready, type Seats } from '../src/index.ts'
import { below, entry, pick, randomOf, type Random } from './support.ts'

/** The walk's own books, kept apart from the seats under test. */
type Live = { instance: Instance; seated: boolean; batches: Map<number, Entry[]>; drains: number[] }
type Leaving = { fiber: string; instance: Instance; entries: Entry[]; pending: number[] }
type World = { live: Map<string, Live>; leaving: Leaving[]; issued: Map<string, number> }

const FIBERS = ['f1', 'f2', 'f3']
const NAME_OF: Record<string, string> = { f1: 'a', f2: 'a', f3: 'b' }
const IDS = ['x', 'y', 'z']
const spot = (held: Entry): string => `${held.point}/${held.key}/${held.id}`
const entriesOf = (live: Live): Entry[] => [...live.batches.values()].flat()

function shuffled<T>(random: Random, items: readonly T[]): T[] {
  const out = [...items]
  for (let index = out.length - 1; index > 0; index -= 1) {
    const other = below(random, index + 1)
    ;[out[index], out[other]] = [out[other] as T, out[index] as T]
  }
  return out
}

function installed(registry: Registry, instance: Instance, entries: readonly Entry[]): Registry {
  const outcome = install(registry, instance, entries)
  if (outcome.kind !== 'installed') throw new Error(outcome.detail)
  return outcome.registry
}

/** Withdrawn generations first, each installed and retired; then whoever serves, in any order. */
function expected(random: Random, world: World): Registry {
  const withdrawn = shuffled(random, world.leaving).reduce(
    (registry, left) => retire(installed(registry, left.instance, left.entries), left.instance),
    empty,
  )
  const serving = [...world.live.values()].filter(live => live.seated)
  return shuffled(random, serving).reduce(
    (registry, live) => installed(registry, live.instance, entriesOf(live)),
    withdrawn,
  )
}

/** The name a new seat of this fiber takes: free unless another live fiber holds it. */
function nameFor(world: World, fiber: string): string {
  const held = new Set([...world.live.values()].map(live => live.instance.fiber))
  let name = NAME_OF[fiber] ?? ''
  for (let suffix = 2; held.has(name); suffix += 1) name = `${NAME_OF[fiber]}~${suffix}`
  return name
}

function putStep(random: Random, seats: Seats, world: World, fiber: string): Seats {
  const live = world.live.get(fiber)
  const batch = Array.from({ length: below(random, 3) }, () => {
    const id = pick(random, IDS)
    return entry('host.list', 'k', { id, digest: `${fiber}:${id}` })
  })
  const drains = below(random, 2) === 0
  const spots = (live === undefined ? [] : entriesOf(live)).concat(batch).map(spot)
  const outcome = put(seats, fiber, NAME_OF[fiber] ?? '', batch, drains)
  expect(outcome.kind).toBe(new Set(spots).size === spots.length ? 'put' : 'refused')
  if (outcome.kind !== 'put') return seats
  const now = live ?? opened(world, fiber)
  now.batches.set(outcome.batch, batch)
  if (drains) now.drains.push(outcome.batch)
  world.live.set(fiber, now)
  return outcome.seats
}

function opened(world: World, fiber: string): Live {
  const name = nameFor(world, fiber)
  const generation = (world.issued.get(name) ?? 0) + 1
  world.issued.set(name, generation)
  return { instance: { fiber: name, generation }, seated: false, batches: new Map(), drains: [] }
}

function dropStep(random: Random, seats: Seats, world: World, fiber: string): Seats {
  const live = world.live.get(fiber)
  const held = live === undefined ? [] : [...live.batches.keys()]
  const id = held.length === 0 || below(random, 5) === 0 ? 999 : pick(random, held)
  if (live?.batches.delete(id) === true) live.drains = live.drains.filter(batch => batch !== id)
  if (live?.batches.size === 0) world.live.delete(fiber)
  return drop(seats, fiber, id)
}

function goneStep(seats: Seats, world: World, fiber: string): Seats {
  const live = world.live.get(fiber)
  world.live.delete(fiber)
  if (live !== undefined && live.seated && live.drains.length > 0)
    world.leaving.push({
      fiber,
      instance: live.instance,
      entries: entriesOf(live),
      pending: [...live.drains],
    })
  return gone(seats, fiber)
}

function drainedStep(random: Random, seats: Seats, world: World): Seats {
  if (world.leaving.length === 0 || below(random, 6) === 0) return drained(seats, 'f1', 999)
  const left = pick(random, world.leaving)
  const batch = pick(random, left.pending)
  left.pending = left.pending.filter(id => id !== batch)
  if (left.pending.length === 0) world.leaving = world.leaving.filter(other => other !== left)
  return drained(seats, left.fiber, batch)
}

function step(random: Random, seats: Seats, world: World): Seats {
  const fiber = pick(random, FIBERS)
  const action = below(random, 8)
  if (action <= 1) return putStep(random, seats, world, fiber)
  if (action === 2) return dropStep(random, seats, world, fiber)
  if (action === 3 || action === 4) {
    const live = world.live.get(fiber)
    if (live !== undefined) live.seated = true
    return ready(seats, fiber)
  }
  if (action === 5) return goneStep(seats, world, fiber)
  return drainedStep(random, seats, world)
}

describe('随机历史，带要排空的批（DC-2、DC-3、DC-4）', () => {
  it.each([11, 12, 13, 14, 15, 16, 17, 18])(
    '种子 %i：每一步登记表等于按在位与撤下中的座位重算一遍',
    seed => {
      const random = randomOf(seed)
      const world: World = { live: new Map(), leaving: [], issued: new Map() }
      let seats = noSeats
      let withdrawals = 0
      let overlaps = 0
      for (let index = 0; index < 600; index += 1) {
        const before = seats
        seats = step(random, seats, world)
        expect(seats.registry).toEqual(expected(random, world))
        const live = seats.seats.filter(seat => seat.retiring === undefined)
        expect(live.map(seat => seat.fiber).sort()).toEqual([...world.live.keys()].sort())
        const names = live.map(seat => seat.instance.fiber)
        expect(new Set(names).size).toBe(names.length)
        expect(seats.registry.retiring).toHaveLength(world.leaving.length)
        if (seats === before) expect(seats.registry).toBe(before.registry)
        withdrawals = Math.max(withdrawals, world.leaving.length)
        const leavingNames = new Set(world.leaving.map(left => left.instance.fiber))
        if (names.some(name => leavingNames.has(name))) overlaps += 1
      }
      expect(withdrawals).toBeGreaterThan(0)
      expect(overlaps).toBeGreaterThan(0)
    },
  )
})
