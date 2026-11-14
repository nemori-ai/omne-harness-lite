export const GROWTH = {
  firstRound: 11,
  lastRound: 200,
  blockSize: 10,
  minR2: 0.95,
  madFactor: 3,
  span: 180,
}

export const CONTROL_PER_ROUND = 0.1

export const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

export type Growth = Readonly<{ grows: boolean; slope: number; r2: number; residualMAD: number }>

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
