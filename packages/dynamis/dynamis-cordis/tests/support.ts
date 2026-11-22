import { empty, install, type Entry, type Registry } from '@omne-harness/dynamis'
import { put, type Seats } from '../src/index.ts'

export const entry = (point: string, key: string, over: Partial<Entry> = {}): Entry => ({
  point,
  key,
  id: '',
  scope: [],
  rank: 0,
  digest: `${point}/${key}`,
  item: { label: key },
  ...over,
})

/** A put that must be taken: the seats after it and the batch it made. */
export function mustPut(
  seats: Seats,
  fiber: string,
  name: string,
  entries: readonly Entry[],
): Readonly<{ seats: Seats; batch: number }> {
  const outcome = put(seats, fiber, name, entries)
  if (outcome.kind !== 'put') throw new Error(`refused: ${outcome.detail}`)
  return outcome
}

/** The registry worked out again from nothing: every seated seat installs all it holds. */
export function recomputed(seats: Seats): Registry {
  return seats.seats
    .filter(seat => seat.seated)
    .reduce((registry, seat) => {
      const outcome = install(
        registry,
        seat.instance,
        seat.batches.flatMap(batch => batch.entries),
      )
      if (outcome.kind !== 'installed') throw new Error(`refused: ${outcome.detail}`)
      return outcome.registry
    }, empty)
}

export type Random = () => number

export function randomOf(seed: number): Random {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = state
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

export const below = (random: Random, limit: number): number => Math.floor(random() * limit)

export function pick<T>(random: Random, from: readonly T[]): T {
  const chosen = from[below(random, from.length)]
  if (chosen === undefined) throw new Error('pick from an empty list')
  return chosen
}
