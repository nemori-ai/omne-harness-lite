export type Equivalence =
  | Readonly<{ state: 'equivalent' }>
  | Readonly<{ state: 'unstable'; first: number }>
  | Readonly<{ state: 'different'; first: number }>

function firstDifference(a: readonly string[], b: readonly string[]): number | null {
  const length = Math.max(a.length, b.length)
  for (let index = 0; index < length; index += 1) if (a[index] !== b[index]) return index
  return null
}

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
