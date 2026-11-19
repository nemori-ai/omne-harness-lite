export interface AckCoalesceOptions {
  bytes: number
  delayMs: number
}

const MAX_TIMER_MS = 2 ** 31 - 1

export function positiveInteger(name: string, value: unknown, fallback: number): number {
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer, got ${show(value)}`)
  }
  return value
}

export function optionalTimeout(name: string, value: unknown): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > MAX_TIMER_MS) {
    throw new RangeError(
      `${name} must be a number of milliseconds between 0 and ${MAX_TIMER_MS}, got ${show(value)}`,
    )
  }
  return value
}

export function chunkBytes(value: unknown, windowBytes: number): number {
  const chunk = positiveInteger('maxChunkBytes', value, windowBytes)
  if (chunk > windowBytes) {
    throw new RangeError(`maxChunkBytes (${chunk}) must not exceed windowBytes (${windowBytes})`)
  }
  return chunk
}

export function ackCoalesce(value: unknown): AckCoalesceOptions | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'object' || value === null)
    throw new TypeError('ackCoalesce must be { bytes, delayMs }')
  const bytes: unknown = Reflect.get(value, 'bytes')
  const delayMs: unknown = Reflect.get(value, 'delayMs')
  if (
    typeof delayMs !== 'number' ||
    !Number.isFinite(delayMs) ||
    delayMs < 0 ||
    delayMs > MAX_TIMER_MS
  ) {
    throw new RangeError(
      `ackCoalesce.delayMs must be between 0 and ${MAX_TIMER_MS} ms, got ${show(delayMs)}`,
    )
  }
  if (bytes === undefined) throw new RangeError('ackCoalesce.bytes is required')
  return { bytes: positiveInteger('ackCoalesce.bytes', bytes, 1), delayMs }
}

function show(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value)
  return typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === undefined ||
    value === null
    ? String(value)
    : typeof value
}
