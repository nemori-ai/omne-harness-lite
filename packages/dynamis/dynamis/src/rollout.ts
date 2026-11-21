import {
  install,
  retire,
  standing,
  type Entry,
  type Installed,
  type Instance,
  type Registry,
} from './registry.ts'

/** The highest generation given out per fiber. The caller keeps it durable: a generation is never reused. */
export type Mint = Readonly<Record<string, number>>

export type Superseded =
  | Installed
  | Readonly<{
      kind: 'refused'
      reason: 'different-fiber' | 'not-newer' | 'old-not-serving'
      detail: string
    }>

export const noMint: Mint = Object.freeze({})

export function mint(minted: Mint, fiber: string): { minted: Mint; instance: Instance } {
  const generation = (minted[fiber] ?? 0) + 1
  return {
    minted: Object.freeze({ ...minted, [fiber]: generation }),
    instance: { fiber, generation },
  }
}

const tagOf = (instance: Instance): string => `${instance.fiber}#${instance.generation}`

/** One step: the old generation starts to withdraw and the new one serves. */
export function supersede(
  registry: Registry,
  old: Instance,
  next: Instance,
  entries: readonly Entry[],
): Superseded {
  if (next.fiber !== old.fiber)
    return {
      kind: 'refused',
      reason: 'different-fiber',
      detail: `${tagOf(next)} is not a generation of ${old.fiber}`,
    }
  if (next.generation <= old.generation)
    return {
      kind: 'refused',
      reason: 'not-newer',
      detail: `generation ${next.generation} does not follow generation ${old.generation}`,
    }
  const held = standing(registry, old)
  if (held !== 'serving')
    return { kind: 'refused', reason: 'old-not-serving', detail: `${tagOf(old)} is ${held}` }
  return install(retire(registry, old), next, entries)
}
