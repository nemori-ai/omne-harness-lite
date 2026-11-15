export type Random = Readonly<{
  int(bound: number): number
  pick<T>(items: readonly T[]): T
  chance(numerator: number, denominator: number): boolean
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
  runs?: number
  seed?: number
  generate: (rng: Random) => T
  check: (value: T, rng: Random) => string | null
}>

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
