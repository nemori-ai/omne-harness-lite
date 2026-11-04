// A seeded property harness for the Journal laws: a deterministic generator (xorshift32) and a
// `forAll` that runs a predicate over `runs` generated values and reports the seed and the value of
// the first failure. fast-check is not a dependency of this repository (its catalog and lockfile are
// shared files outside this lane), so the laws use this harness; it has no shrinking, so a failure
// reports the seed to replay.
export type Random = Readonly<{
  /** An integer in `[0, bound)`. */
  int(bound: number): number
  /** One of the items. */
  pick<T>(items: readonly T[]): T
  /** True with probability `numerator / denominator`. */
  chance(numerator: number, denominator: number): boolean
  /** A shuffled copy of the items. */
  shuffle<T>(items: readonly T[]): T[]
  seed: number
}>

export function random(seed: number): Random {
  let state = seed >>> 0 || 0x9e3779b9
  const next = (): number => {
    state ^= state << 13
    state >>>= 0
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    return state
  }
  const int = (bound: number): number => (bound <= 1 ? 0 : next() % bound)
  return {
    seed,
    int,
    pick: items => {
      if (items.length === 0) throw new Error('pick of an empty list')
      return items[int(items.length)]!
    },
    chance: (numerator, denominator) => int(denominator) < numerator,
    shuffle: items => {
      const out = [...items]
      for (let index = out.length - 1; index > 0; index -= 1) {
        const other = int(index + 1)
        const held = out[index]!
        out[index] = out[other]!
        out[other] = held
      }
      return out
    },
  }
}

export type Property<T> = Readonly<{
  /** The number of generated values; the seed of run `i` is `base + i`. */
  runs?: number
  seed?: number
  generate: (rng: Random) => T
  /** Returns null when the value satisfies the property, or the reason it does not. */
  check: (value: T, rng: Random) => string | null
}>

/**
 * Runs the property. Throws with the seed and the reason of the first failing run, so that the
 * run can be replayed with `seed`.
 */
export function forAll<T>(name: string, property: Property<T>): void {
  const runs = property.runs ?? 100
  const base = property.seed ?? 0x2545f491
  for (let index = 0; index < runs; index += 1) {
    const seed = (base + index * 0x9e3779b1) >>> 0
    const rng = random(seed)
    const value = property.generate(rng)
    const reason = property.check(value, random(seed ^ 0x5bd1e995))
    if (reason !== null) throw new Error(`${name}: run ${index} (seed ${seed}) failed: ${reason}`)
  }
}
