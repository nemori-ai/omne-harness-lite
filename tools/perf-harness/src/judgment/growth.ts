export type Blocked = Readonly<{ state: 'blocked'; reason: string }>

export const GROWTH = {
  firstRound: 11,
  lastRound: 200,
  blockSize: 10,
  minR2: 0.95,
  madFactor: 3,
  span: 180,
} as const

export const MEDIAN_THRESHOLD = 1.5

const ROUNDS = GROWTH.lastRound
const BLOCKS = (GROWTH.lastRound - GROWTH.firstRound + 1) / GROWTH.blockSize

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  const upper = sorted[middle] ?? Number.NaN
  if (sorted.length % 2 === 1) return upper
  const lower = sorted[middle - 1] ?? Number.NaN
  return lower + (upper - lower) / 2
}

export type GrowthVerdict =
  | Blocked
  | Readonly<{
      state: 'pass' | 'fail'
      slope: number
      r2: number
      residualMAD: number
      predictedGrowth: number
    }>

export function judgeGrowth(values: readonly number[]): GrowthVerdict {
  const expected = BLOCKS * GROWTH.blockSize
  if (values.length !== expected || values.some(value => !Number.isFinite(value)))
    return {
      state: 'blocked',
      reason: `requires ${String(expected)} finite values of rounds 11-200`,
    }
  const size = GROWTH.blockSize
  const centre = (GROWTH.firstRound + GROWTH.lastRound) / 2
  const blocks = Array.from({ length: BLOCKS }, (_, index) => ({
    x: GROWTH.firstRound + (size - 1) / 2 + index * size - centre,
    y: median(values.slice(index * size, index * size + size)),
  }))
  const mean = blocks.reduce((sum, block) => sum + block.y, 0) / BLOCKS
  const slope =
    blocks.reduce((sum, block) => sum + block.x * block.y, 0) /
    blocks.reduce((sum, block) => sum + block.x ** 2, 0)
  const residuals = blocks.map(block => block.y - (mean + slope * block.x))
  const variance = blocks.reduce((sum, block) => sum + (block.y - mean) ** 2, 0)
  const r2 =
    variance === 0 ? 0 : 1 - residuals.reduce((sum, value) => sum + value ** 2, 0) / variance
  const middle = median(residuals)
  const residualMAD = median(residuals.map(value => Math.abs(value - middle)))
  const predictedGrowth = slope * GROWTH.span
  if (![slope, r2, residualMAD, predictedGrowth].every(Number.isFinite))
    return { state: 'blocked', reason: 'growth statistics exceed finite numeric range' }
  const grows = slope > 0 && r2 >= GROWTH.minR2 && predictedGrowth > GROWTH.madFactor * residualMAD
  return { state: grows ? 'fail' : 'pass', slope, r2, residualMAD, predictedGrowth }
}

export type MedianVerdict =
  | Blocked
  | Readonly<{
      state: 'pass' | 'fail'
      ratio: number
      earlyMedian: number
      lateMedian: number
      threshold: number
    }>

export function judgeSeries(
  values: readonly number[],
  threshold: number = MEDIAN_THRESHOLD,
): Readonly<{ median: MedianVerdict; growth: GrowthVerdict }> {
  if (!Number.isFinite(threshold) || threshold <= 0)
    throw new Error('threshold must be a finite positive number')
  if (values.length !== ROUNDS || values.some(value => !Number.isFinite(value))) {
    const blocked = {
      state: 'blocked',
      reason: `requires ${String(ROUNDS)} finite values`,
    } as const
    return { median: blocked, growth: blocked }
  }
  const earlyMedian = median(values.slice(10, 30))
  const lateMedian = median(values.slice(180, 200))
  const ratio = lateMedian / earlyMedian
  const gate: MedianVerdict =
    earlyMedian <= 0 || !Number.isFinite(ratio)
      ? { state: 'blocked', reason: 'early median is not positive' }
      : { state: ratio <= threshold ? 'pass' : 'fail', ratio, earlyMedian, lateMedian, threshold }
  return { median: gate, growth: judgeGrowth(values.slice(10, 200)) }
}
