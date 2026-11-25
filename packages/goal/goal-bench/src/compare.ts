import { quantile } from './score.ts'

/** What one parent's cases came to in one run: how many entries were graded and what they cost. */
export type ParentTally = Readonly<{
  entries: number
  loss: number
  notHolds: number
  falseHolds: number
}>
export type Tallies = Readonly<Record<string, ParentTally>>

function generator(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

function meanLoss(tallies: Tallies, parents: readonly string[]): number {
  let entries = 0
  let loss = 0
  for (const parent of parents) {
    const tally = tallies[parent] as ParentTally
    entries += tally.entries
    loss += tally.loss
  }
  return entries === 0 ? 0 : loss / entries
}

export type Paired = Readonly<{ difference: number; low: number; high: number; parents: number }>

/** The candidate's mean loss minus the base's over the same parents, with a 95% interval from resampling parents. */
export function pairedLoss(
  base: Tallies,
  candidate: Tallies,
  options: Readonly<{ draws?: number; seed?: number }> = {},
): Paired {
  const parents = Object.keys(base).toSorted()
  if (parents.join('\n') !== Object.keys(candidate).toSorted().join('\n'))
    throw new Error('the two runs do not cover the same parents')
  const difference = (drawn: readonly string[]): number =>
    meanLoss(candidate, drawn) - meanLoss(base, drawn)
  const random = generator(options.seed ?? 1)
  const draws = Array.from({ length: options.draws ?? 2000 }, () =>
    difference(parents.map(() => parents[Math.floor(random() * parents.length)] as string)),
  )
  return {
    difference: difference(parents),
    low: quantile(draws, 0.025),
    high: quantile(draws, 0.975),
    parents: parents.length,
  }
}
