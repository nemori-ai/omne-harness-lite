export const STAGES = [
  'sessionIO',
  'projectionInterpretation',
  'requestAssembly',
  'agentProgression',
]
export const THRESHOLD_SOURCE = '初值，R2-D1 第5条'

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
  return sorted[9] + (sorted[10] - sorted[9]) / 2
}

export function evaluateMedian(rounds, threshold = 1.5) {
  thresholdValue(threshold)
  validateRounds(rounds)
  if (rounds.length < 200)
    return { state: 'blocked', reason: 'requires full windows 11-30 and 181-200' }
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
      fsync: unmeasured('synthetic fixture does not execute SQLite'),
    }
  })
}
