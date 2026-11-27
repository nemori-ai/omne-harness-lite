import type { Blocked } from './growth.ts'

export type ScalePoint = Readonly<{ scale: number; value: number }>

export type ScaleVerdict =
  | Blocked
  | Readonly<{
      state: 'pass' | 'fail'
      /** value at each rung over the value at the rung before it */
      ratios: readonly number[]
      allowance: number
      /** how much the value rises each time the scale doubles, fitted over all rungs; reported, never judged */
      perDoubling: number
    }>

const ratioOf = (before: number, after: number): number =>
  before === 0 ? (after === 0 ? 1 : Number.POSITIVE_INFINITY) : after / before

function slopePerDoubling(points: readonly ScalePoint[]): number {
  const xs = points.map(point => Math.log2(point.scale))
  const meanX = xs.reduce((sum, x) => sum + x, 0) / xs.length
  const meanY = points.reduce((sum, point) => sum + point.value, 0) / points.length
  const spread = xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0)
  return (
    xs.reduce((sum, x, index) => sum + (x - meanX) * ((points[index]?.value ?? 0) - meanY), 0) /
    spread
  )
}

/**
 * A reading that should not depend on a scale, taken at rungs that double: each rung may be at most
 * `1 + allowance` times the rung before it. With an allowance of zero the reading may not rise at all.
 */
export function judgeScale(points: readonly ScalePoint[], allowance: number): ScaleVerdict {
  if (!Number.isFinite(allowance) || allowance < 0)
    throw new Error('allowance must be a finite number, zero or more')
  if (points.length < 2) return { state: 'blocked', reason: 'requires at least two rungs' }
  if (points.some(point => !(point.scale > 0) || !Number.isFinite(point.value) || point.value < 0))
    return { state: 'blocked', reason: 'a rung has no positive scale or no finite value' }
  const rungs = [...points].sort((a, b) => a.scale - b.scale)
  const doubles = rungs.every(
    (rung, index) => index === 0 || rung.scale === 2 * (rungs[index - 1]?.scale ?? 0),
  )
  if (!doubles) return { state: 'blocked', reason: 'the rungs do not double' }
  const ratios = rungs.slice(1).map((rung, index) => ratioOf(rungs[index]?.value ?? 0, rung.value))
  return {
    state: ratios.every(ratio => ratio <= 1 + allowance) ? 'pass' : 'fail',
    ratios,
    allowance,
    perDoubling: slopePerDoubling(rungs),
  }
}

/** Where an expectation comes from, and what lets it stand above the budget of the cost model. */
export type Expectation = Readonly<{
  value: number
  /** the column of the cost model this number is taken from */
  from: string
  /** the budget the cost model designs for; an expectation above it needs an acceptance */
  budget: number
  accepted?: Readonly<{ card: string; reason: string }>
}>

export type CountVerdict =
  | Blocked
  | Readonly<{ state: 'pass'; measured: number; expected: number }>
  | Readonly<{ state: 'fail'; measured: number; expected: number; reason: string }>

/** A count a step decides: it equals the expectation, or the gate fails. No expectation is a blocked gate, not a pass. */
export function judgeCount(measured: number, expectation: Expectation | undefined): CountVerdict {
  if (expectation === undefined)
    return { state: 'blocked', reason: 'no expectation to compare with' }
  if (!Number.isFinite(measured)) return { state: 'blocked', reason: 'the count was not measured' }
  const { value: expected, budget, accepted } = expectation
  if (expected > budget && accepted === undefined)
    return {
      state: 'fail',
      measured,
      expected,
      reason: `the expectation ${String(expected)} is above the design budget ${String(budget)} and carries no acceptance`,
    }
  if (measured === expected) return { state: 'pass', measured, expected }
  return {
    state: 'fail',
    measured,
    expected,
    reason: `measured ${String(measured)}, expected ${String(expected)} (${expectation.from})`,
  }
}
