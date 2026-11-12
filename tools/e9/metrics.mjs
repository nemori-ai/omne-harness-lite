export const STAGES = [
  'sessionIO',
  'projectionInterpretation',
  'requestAssembly',
  'agentProgression',
]
export const THRESHOLD_SOURCE = '初值，R2-D1 第5条'
export const METHOD = {
  definitionId: 'e9-wall-residue-ols-r2-d17-v1',
  eventSchemaVersion: 1,
  source: 'Reduce批复R2-D17',
  clockScope: 'same processId/clockId/generation; no clock conversion',
  growth: { firstRound: 11, lastRound: 200, blockSize: 10, minR2: 0.95, madFactor: 3, span: 180 },
}

export function measured(value, unit, source) {
  if (!Number.isFinite(value) || value < 0)
    throw new Error('measurement must be finite and nonnegative')
  if (typeof unit !== 'string' || !unit || typeof source !== 'string' || !source.trim())
    throw new Error('measurement requires unit and source')
  if (unit === 'count' && !Number.isSafeInteger(value))
    throw new Error('count must be a safe integer')
  return { state: 'measured', value, unit, source }
}

export function unmeasured(reason) {
  if (typeof reason !== 'string' || reason.trim() === '')
    throw new Error('unmeasured requires reason')
  return { state: 'unmeasured', reason }
}

function validateMeasurement(value, unit) {
  if (value?.state === 'unmeasured') return unmeasured(value.reason)
  if (value?.state !== 'measured') throw new Error('invalid measurement state')
  if (value.unit !== unit) throw new Error(`measurement unit must be ${unit}`)
  return measured(value.value, value.unit, value.source)
}

export function validateRounds(rounds) {
  if (!Array.isArray(rounds) || rounds.length > 200)
    throw new Error('rounds must contain at most 200 rounds')
  let previousEntries = 0
  return rounds.map((row, index) => {
    if (row.round !== index + 1) throw new Error('round numbers must be contiguous from 1')
    if (!Number.isSafeInteger(row.logEntries) || row.logEntries < previousEntries)
      throw new Error('invalid cumulative log entries')
    if (previousEntries >= 10000) throw new Error('round recorded after 10000-entry stop')
    previousEntries = row.logEntries
    validateMeasurement(row.endToEnd, 'ms')
    validateMeasurement(row.ownOverhead, 'ms')
    for (const stage of STAGES) validateMeasurement(row.stages?.[stage], 'ms')
    validateMeasurement(row.fsync, 'count')
    return row
  })
}

export function thresholdValue(value = 1.5) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
    throw new Error('threshold must be a finite positive number')
  return value
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[middle]
    : sorted[middle - 1] + (sorted[middle] - sorted[middle - 1]) / 2
}

export function clockKey(clock) {
  if (
    !clock ||
    !['processId', 'clockId', 'generation'].every(
      key => typeof clock[key] === 'string' && clock[key].trim(),
    )
  )
    return undefined
  return JSON.stringify([clock.processId, clock.clockId, clock.generation])
}

export function evaluateGrowth(rounds) {
  validateRounds(rounds)
  return Object.fromEntries(STAGES.map(stage => [stage, stageGrowth(rounds, stage)]))
}

function stageGrowth(rounds, stage) {
  const samples = rounds.slice(10, 200)
  if (samples.length !== 190) return { state: 'blocked', reason: 'requires fixed rounds 11-200' }
  if (samples.some(row => row.stages[stage].state !== 'measured'))
    return { state: 'blocked', reason: 'unmeasured stage' }
  const clocks = samples.map(row => clockKey(row.stageClocks?.[stage]))
  if (!clocks[0] || clocks.some(clock => clock !== clocks[0]))
    return { state: 'blocked', reason: 'stage clock scope changed or missing' }
  const growth = blockGrowth(samples.map(row => row.stages[stage].value))
  return growth.state === 'blocked' ? growth : { ...growth, clock: samples[0].stageClocks[stage] }
}

/**
 * DP2 B on the 190 values of rounds 11 to 200 of one series: 19 blocks of ten rounds, the median of
 * each block against its middle round, an OLS line through the blocks. The series grows when the
 * slope is positive, R² is at least 0.95 and the growth over 180 rounds exceeds three residual MADs.
 */
export function blockGrowth(values) {
  if (values.length !== 190 || values.some(value => !Number.isFinite(value)))
    return { state: 'blocked', reason: 'requires 190 finite values of rounds 11-200' }
  const blocks = Array.from({ length: 19 }, (_, index) => ({
    x: 15.5 + index * 10,
    y: median(values.slice(index * 10, index * 10 + 10)),
  }))
  // Scaling preserves OLS shape and avoids overflow for large finite durations.
  const scale = Math.max(...blocks.map(block => block.y)) || 1
  const ys = blocks.map(block => block.y / scale)
  const mean = ys.reduce((sum, value) => sum + value / 19, 0)
  const xs = blocks.map(block => block.x - 105.5)
  const slope =
    xs.reduce((sum, x, index) => sum + x * (ys[index] - mean), 0) /
    xs.reduce((sum, x) => sum + x * x, 0)
  const residuals = ys.map((y, index) => y - (mean + slope * xs[index]))
  const variance = ys.reduce((sum, y) => sum + (y - mean) ** 2, 0)
  const r2 =
    variance === 0 ? 0 : 1 - residuals.reduce((sum, value) => sum + value * value, 0) / variance
  const center = median(residuals)
  const mad = median(residuals.map(value => Math.abs(value - center)))
  const rule = METHOD.growth
  const predictedGrowth = slope * rule.span * scale
  if (![slope * scale, r2, mad * scale, predictedGrowth].every(Number.isFinite))
    return { state: 'blocked', reason: 'growth statistics exceed finite numeric range', blocks }
  return {
    state:
      slope > 0 && r2 >= rule.minR2 && slope * rule.span > rule.madFactor * mad ? 'fail' : 'pass',
    blocks,
    slope: slope * scale,
    r2,
    residualMAD: mad * scale,
    predictedGrowth,
  }
}

export function evaluateMedian(rounds, threshold = 1.5) {
  thresholdValue(threshold)
  validateRounds(rounds)
  if (rounds.length < 200)
    return { state: 'blocked', reason: 'requires full windows 11-30 and 181-200' }
  const clocks = rounds.slice(10).map(row => clockKey(row.roundClock))
  if (!clocks[0] || clocks.some(clock => clock !== clocks[0]))
    return { state: 'blocked', reason: 'round clock scope changed or missing' }
  const early = rounds.slice(10, 30).map(row => row.ownOverhead)
  const late = rounds.slice(180, 200).map(row => row.ownOverhead)
  if ([...early, ...late].some(value => value.state !== 'measured'))
    return { state: 'blocked', reason: 'window contains unmeasured own overhead' }
  const earlyMedian = median(early.map(row => row.value))
  const lateMedian = median(late.map(row => row.value))
  if (earlyMedian === 0) return { state: 'blocked', reason: 'early median is zero' }
  const ratio = lateMedian / earlyMedian
  if (!Number.isFinite(ratio))
    return { state: 'blocked', reason: 'median ratio exceeds finite numeric range' }
  return {
    state: ratio <= threshold ? 'pass' : 'fail',
    ratio,
    earlyMedian,
    lateMedian,
    unit: 'ms',
    threshold,
  }
}

/**
 * The two gates on any series of 200 per-round values (`docs/engineering/perf-baseline.md` uses
 * them for own overhead, memory and new disk bytes): the median of rounds 181-200 over the median of
 * rounds 11-30 against `threshold`, and `blockGrowth` on rounds 11-200.
 */
export function evaluateSeries(values, threshold = 1.5) {
  thresholdValue(threshold)
  if (values.length !== 200 || values.some(value => !Number.isFinite(value)))
    return {
      median: { state: 'blocked', reason: 'requires 200 finite values' },
      growth: { state: 'blocked', reason: 'requires 200 finite values' },
    }
  const earlyMedian = median(values.slice(10, 30))
  const lateMedian = median(values.slice(180, 200))
  const ratio = lateMedian / earlyMedian
  const medianGate =
    earlyMedian <= 0 || !Number.isFinite(ratio)
      ? { state: 'blocked', reason: 'early median is not positive', earlyMedian, lateMedian }
      : { state: ratio <= threshold ? 'pass' : 'fail', ratio, earlyMedian, lateMedian, threshold }
  return { median: medianGate, growth: blockGrowth(values.slice(10, 200)) }
}

export function syntheticRounds(kind) {
  return Array.from({ length: 200 }, (_, index) => {
    const value = kind === 'growth' ? index + 1 : 10
    return {
      round: index + 1,
      logEntries: (index + 1) * 2,
      endToEnd: measured(value + 20, 'ms', 'synthetic fixture'),
      ownOverhead: measured(value, 'ms', 'synthetic fixture'),
      stages: Object.fromEntries(
        STAGES.map(stage => [stage, measured(value / 4, 'ms', 'synthetic fixture')]),
      ),
      fsync: measured(2, 'count', 'synthetic fixture; no SQLite execution'),
      externalWaits: [{ provider: 'model', definedDelayMs: 20 }],
      roundClock: { processId: 'synthetic', clockId: 'monotonic', generation: '1' },
      stageClocks: Object.fromEntries(
        STAGES.map(stage => [
          stage,
          { processId: 'synthetic', clockId: 'monotonic', generation: '1' },
        ]),
      ),
    }
  })
}
