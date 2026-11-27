export type Blocked = Readonly<{ state: 'blocked'; reason: string }>

/** The rounds a growth verdict reads and the three conditions that together say a series grows. */
export const GROWTH = {
  firstRound: 11,
  lastRound: 200,
  blockSize: 10,
  minR2: 0.95,
  madFactor: 3,
  span: 180,
} as const

/** The later window may be this many times the earlier one before the median gate fails. */
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

/** Whether rounds 11 to 200 grow: a positive slope over the block medians, a close fit, and a rise well above the scatter. */
export function judgeGrowth(values: readonly number[]): GrowthVerdict {
  const expected = BLOCKS * GROWTH.blockSize
  if (values.length !== expected || values.some(value => !Number.isFinite(value)))
    return {
      state: 'blocked',
      reason: `requires ${String(expected)} finite values of rounds 11-200`,
    }
  const size = GROWTH.blockSize
  const blocks = Array.from({ length: BLOCKS }, (_, index) => ({
    x: GROWTH.firstRound + (size - 1) / 2 + index * size,
    y: median(values.slice(index * size, index * size + size)),
  }))
  const scale = Math.max(...blocks.map(block => block.y)) || 1
  const ys = blocks.map(block => block.y / scale)
  const mean = ys.reduce((sum, value) => sum + value / BLOCKS, 0)
  const centre = (GROWTH.firstRound + GROWTH.lastRound) / 2
  const xs = blocks.map(block => block.x - centre)
  const slope =
    xs.reduce((sum, x, index) => sum + x * ((ys[index] ?? 0) - mean), 0) /
    xs.reduce((sum, x) => sum + x * x, 0)
  const residuals = ys.map((y, index) => y - (mean + slope * (xs[index] ?? 0)))
  const variance = ys.reduce((sum, y) => sum + (y - mean) ** 2, 0)
  const r2 =
    variance === 0 ? 0 : 1 - residuals.reduce((sum, value) => sum + value * value, 0) / variance
  const middle = median(residuals)
  const mad = median(residuals.map(value => Math.abs(value - middle)))
  const predictedGrowth = slope * GROWTH.span * scale
  if (![slope * scale, r2, mad * scale, predictedGrowth].every(Number.isFinite))
    return { state: 'blocked', reason: 'growth statistics exceed finite numeric range' }
  const grows = slope > 0 && r2 >= GROWTH.minR2 && slope * GROWTH.span > GROWTH.madFactor * mad
  return {
    state: grows ? 'fail' : 'pass',
    slope: slope * scale,
    r2,
    residualMAD: mad * scale,
    predictedGrowth,
  }
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

/** The two gates a series of 200 rounds passes: the late window against the early one, and growth. */
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
