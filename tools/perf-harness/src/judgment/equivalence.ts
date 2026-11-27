export type Equivalence =
  | Readonly<{ state: 'equivalent' }>
  | Readonly<{ state: 'unstable'; first: number }>
  | Readonly<{ state: 'different'; first: number }>

function firstDifference(a: readonly string[], b: readonly string[]): number | null {
  const length = Math.max(a.length, b.length)
  for (let index = 0; index < length; index += 1) if (a[index] !== b[index]) return index
  return null
}

/**
 * Sameness before speed. The digests each side left at the edge of the measurement, in order: the base
 * that differs from itself cannot be judged; a candidate that differs from the base is not compared for speed.
 */
export function judgeEquivalence(
  base: readonly string[],
  self: readonly string[],
  candidate: readonly string[],
): Equivalence {
  const own = firstDifference(base, self)
  if (own !== null) return { state: 'unstable', first: own }
  const other = firstDifference(base, candidate)
  return other === null ? { state: 'equivalent' } : { state: 'different', first: other }
}
