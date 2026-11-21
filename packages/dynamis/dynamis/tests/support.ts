import {
  empty,
  install,
  type Contract,
  type Entry,
  type Instance,
  type Registry,
} from '../src/index.ts'

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

export function mustInstall(
  registry: Registry,
  instance: Instance,
  entries: readonly Entry[],
): Registry {
  const outcome = install(registry, instance, entries)
  if (outcome.kind !== 'installed') throw new Error(`refused: ${outcome.reason} ${outcome.detail}`)
  return outcome.registry
}

/** A registry holding what each fiber puts, installed in the order given. */
export function registryOf(...byFiber: readonly (readonly [string, readonly Entry[]])[]): Registry {
  return byFiber.reduce(
    (registry, [fiber, entries]) => mustInstall(registry, inst(fiber), entries),
    empty,
  )
}

export const contract = (name: string, over: Partial<Contract> = {}): Contract => ({
  name,
  tree: 'server',
  arity: 'keyed-one',
  keyFrom: null,
  key: 'the name of an implementation',
  gives: 'nothing',
  item: { kind: 'data', fields: { label: 'string' } },
  resolve: 'conflict',
  onError: 'the answer is unavailable',
  version: 1,
  conformance: null,
  summary: `the point ${name}`,
  ...over,
})
