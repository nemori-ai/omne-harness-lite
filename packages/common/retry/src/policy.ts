export interface RetryPolicy {
  readonly maxAttempts: number
  readonly maxElapsedMs: number
  readonly delaysMs: readonly number[]
  readonly jitter: number
}

function finiteAtLeastZero(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function field<T>(
  record: Record<string, unknown>,
  name: string,
  valid: (value: unknown) => value is T,
): T {
  const value = record[name]
  if (!valid(value)) throw new TypeError(`retry policy field ${name} is missing or out of range`)
  return value
}

function attemptsLimit(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
}

function delays(value: unknown): value is readonly number[] {
  return Array.isArray(value) && value.length > 0 && value.every(finiteAtLeastZero)
}

function jitterShare(value: unknown): value is number {
  return finiteAtLeastZero(value) && value <= 1
}

export function parseRetryPolicy(value: unknown): RetryPolicy {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new TypeError('retry policy is not an object')
  const record = value as Record<string, unknown>
  return Object.freeze({
    maxAttempts: field(record, 'maxAttempts', attemptsLimit),
    maxElapsedMs: field(record, 'maxElapsedMs', finiteAtLeastZero),
    delaysMs: Object.freeze([...field(record, 'delaysMs', delays)]),
    jitter: field(record, 'jitter', jitterShare),
  })
}
