import { empty, install, type Entry, type Registry } from '@omne-harness/dynamis'
import { describe, expect, it } from 'vitest'
import { drop, gone, noSeats, put, ready, type Seats } from '../src/index.ts'
import { below, entry, pick, randomOf, type Random } from './support.ts'

/** What the walk itself believes each live fiber holds, kept apart from the seats under test. */
type Held = { name: string; seated: boolean; batches: Map<number, Entry[]> }
type World = Map<string, Held>

const FIBERS = ['f1', 'f2', 'f3', 'f4']
const NAME_OF: Record<string, string> = { f1: 'a', f2: 'a', f3: 'b', f4: 'c' }
const IDS = ['x', 'y', 'z']
const spot = (held: Entry): string => `${held.point}/${held.key}/${held.id}`

function batchFor(random: Random, fiber: string): Entry[] {
  const made: Entry[] = []
  for (let count = below(random, 3); count > 0; count -= 1) {
    const id = pick(random, IDS)
    const point = below(random, 12) === 0 ? 'not a point' : 'host.list'
    made.push(entry(point, 'k', { id, digest: `${fiber}:${id}`, rank: below(random, 3) }))
  }
  return made
}

const heldBy = (held: Held): Entry[] => [...held.batches.values()].flat()

function refusedBy(held: Held | undefined, batch: readonly Entry[]): boolean {
  const spots = (held === undefined ? [] : heldBy(held)).concat(batch).map(spot)
  return batch.some(made => made.point !== 'host.list') || new Set(spots).size !== spots.length
}

/** The registry from the walk's own books, installing the seated fibers in a shuffled order. */
function expected(random: Random, world: World, seats: Seats): Registry {
  const seated = [...world.entries()].filter(([, held]) => held.seated)
  for (let index = seated.length - 1; index > 0; index -= 1) {
    const other = below(random, index + 1)
    ;[seated[index], seated[other]] = [seated[other]!, seated[index]!]
  }
  return seated.reduce((registry, [fiber, held]) => {
    const seat = seats.seats.find(found => found.fiber === fiber)
    if (seat === undefined) throw new Error(`the walk seats ${fiber} and the seats do not`)
    const outcome = install(registry, seat.instance, heldBy(held))
    if (outcome.kind !== 'installed') throw new Error(outcome.detail)
    return outcome.registry
  }, empty)
}

function step(random: Random, seats: Seats, world: World, minted: Map<string, number>): Seats {
  const fiber = pick(random, FIBERS)
  const held = world.get(fiber)
  const action = below(random, 6)
  if (action <= 1) {
    const batch = batchFor(random, fiber)
    const outcome = put(seats, fiber, NAME_OF[fiber] ?? '', batch)
    expect(outcome.kind).toBe(refusedBy(held, batch) ? 'refused' : 'put')
    if (outcome.kind !== 'put') return seats
    const now = held ?? { name: NAME_OF[fiber] ?? '', seated: false, batches: new Map() }
    now.batches.set(outcome.batch, batch)
    world.set(fiber, now)
    if (held === undefined) {
      const instance = outcome.seats.seats.find(seat => seat.fiber === fiber)?.instance
      if (instance === undefined) throw new Error('a put that opens no seat')
      expect(instance.generation).toBeGreaterThan(minted.get(instance.fiber) ?? 0)
      minted.set(instance.fiber, instance.generation)
    }
    return outcome.seats
  }
  if (action === 2) {
    const ids = held === undefined ? [] : [...held.batches.keys()]
    const id = ids.length === 0 || below(random, 5) === 0 ? 999 : pick(random, ids)
    held?.batches.delete(id)
    if (held?.batches.size === 0) world.delete(fiber)
    return drop(seats, fiber, id)
  }
  if (action === 3 || action === 4) {
    if (held !== undefined) held.seated = true
    return ready(seats, fiber)
  }
  world.delete(fiber)
  return gone(seats, fiber)
}

describe('随机历史（DC-1、DC-3、DC-4）', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])('种子 %i：每一步登记表等于按在位的座位重算一遍', seed => {
    const random = randomOf(seed)
    const world: World = new Map()
    const minted = new Map<string, number>()
    let seats = noSeats
    for (let index = 0; index < 400; index += 1) {
      const before = seats
      seats = step(random, seats, world, minted)
      expect(seats.registry).toEqual(expected(random, world, seats))
      expect(seats.seats.map(seat => seat.fiber).sort()).toEqual([...world.keys()].sort())
      const names = seats.seats.map(seat => seat.instance.fiber)
      expect(new Set(names).size).toBe(names.length)
      expect(seats.registry.retiring).toEqual([])
      if (seats === before) expect(seats.registry).toBe(before.registry)
    }
  })

  it('备着的座位怎样变，登记表的值都是同一个对象', () => {
    const one = put(noSeats, 'f1', 'a', [entry('host.list', 'k', { id: 'x' })])
    if (one.kind !== 'put') throw new Error(one.detail)
    expect(one.seats.registry).toBe(noSeats.registry)
    expect(drop(one.seats, 'f1', one.batch).registry).toBe(noSeats.registry)
    expect(gone(one.seats, 'f1').registry).toBe(noSeats.registry)
  })
})
