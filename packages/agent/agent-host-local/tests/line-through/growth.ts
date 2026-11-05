// The growth rule of the E9 measurement (R2-D17), taken for the timed counts of J6 (R2-D118): the
// rounds 11 to 200 in blocks of 10, the median of each block, a least-squares line through the 19
// medians. A count grows when the slope is positive, R² is at least 0.95 and the growth over 180
// rounds exceeds three times the median absolute deviation of the residuals.
//
// The rule is the same as `METHOD.growth` of `tools/e9/metrics.mjs` (R2-D17). This module is a copy
// in code, not an import: a test of this member does not depend on the runtime of tools. The fast
// case `growth.spec.ts` reads that file and checks that the constants are equal item by item.

export const GROWTH = {
  firstRound: 11,
  lastRound: 200,
  blockSize: 10,
  minR2: 0.95,
  madFactor: 3,
  span: 180,
}

/** The negative control of R2-D118: this much per round added to a count must be judged growth. */
export const CONTROL_PER_ROUND = 0.1

export const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

export type Growth = Readonly<{ grows: boolean; slope: number; r2: number; residualMAD: number }>

/** Judges one count per round (index 0 is round 1) by the rule of `GROWTH`. */
export function roundGrowthOf(values: readonly number[]): Growth {
  const samples = values.slice(GROWTH.firstRound - 1, GROWTH.lastRound)
  const xs: number[] = []
  const ys: number[] = []
  for (let block = 0; block * GROWTH.blockSize < samples.length; block += 1) {
    xs.push(GROWTH.firstRound + block * GROWTH.blockSize + (GROWTH.blockSize - 1) / 2)
    ys.push(median(samples.slice(block * GROWTH.blockSize, (block + 1) * GROWTH.blockSize)))
  }
  const meanX = xs.reduce((sum, x) => sum + x, 0) / xs.length
  const meanY = ys.reduce((sum, y) => sum + y, 0) / ys.length
  const slope =
    xs.reduce((sum, x, index) => sum + (x - meanX) * (ys[index]! - meanY), 0) /
    xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0)
  const residuals = ys.map((y, index) => y - (meanY + slope * (xs[index]! - meanX)))
  const variance = ys.reduce((sum, y) => sum + (y - meanY) ** 2, 0)
  const r2 = variance === 0 ? 0 : 1 - residuals.reduce((sum, r) => sum + r * r, 0) / variance
  const center = median(residuals)
  const residualMAD = median(residuals.map(r => Math.abs(r - center)))
  const grows =
    slope > 0 && r2 >= GROWTH.minR2 && slope * GROWTH.span > GROWTH.madFactor * residualMAD
  return { grows, slope, r2, residualMAD }
}
