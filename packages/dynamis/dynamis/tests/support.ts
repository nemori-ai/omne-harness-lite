import type { Entry, Instance } from '../src/index.ts'

export const inst = (fiber: string, generation = 1): Instance => ({ fiber, generation })

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

export function shuffled<T>(random: Random, from: readonly T[]): T[] {
  const out = [...from]
  for (let index = out.length - 1; index > 0; index -= 1) {
    const other = below(random, index + 1)
    const held = out[index] as T
    out[index] = out[other] as T
    out[other] = held
  }
  return out
}
