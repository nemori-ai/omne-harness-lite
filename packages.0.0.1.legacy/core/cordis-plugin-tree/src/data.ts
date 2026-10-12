import type { JsonValue } from './types.ts'

function invalid(): never {
  throw new TypeError('Invalid plugin tree data')
}

/** Inspect descriptors before reading values: validation must not invoke accessors. */
export function record(value: unknown, allowed?: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object') return invalid()
  const proto: unknown = Object.getPrototypeOf(value)
  if (proto !== null && proto !== Object.prototype) return invalid()
  const result: Record<string, unknown> = Object.create(null)
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || (allowed !== undefined && !allowed.includes(key)))
      return invalid()
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor === undefined || !('value' in descriptor) || !descriptor.enumerable)
      return invalid()
    result[key] = descriptor.value
  }
  return result
}

export function array(value: unknown): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return invalid()
  const length = Object.getOwnPropertyDescriptor(value, 'length')?.value as unknown
  if (typeof length !== 'number') return invalid()
  const keys = Reflect.ownKeys(value)
  if (keys.length !== length + 1) return invalid()
  const result: unknown[] = []
  for (let i = 0; i < length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i))
    if (descriptor === undefined || !('value' in descriptor) || !descriptor.enumerable)
      return invalid()
    result.push(descriptor.value)
  }
  return result
}

/** Finite JSON only. Opaque and lossless-number domain representations are not tree data. */
export function captureJson(value: unknown, ancestors = new Set<object>()): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'object' || ancestors.has(value)) return invalid()
  ancestors.add(value)
  try {
    if (Array.isArray(value))
      return Object.freeze(array(value).map(item => captureJson(item, ancestors)))
    const fields = record(value)
    const result: Record<string, JsonValue> = {}
    for (const key of Object.keys(fields)) {
      Object.defineProperty(result, key, {
        value: captureJson(fields[key], ancestors),
        enumerable: true,
      })
    }
    return Object.freeze(result)
  } finally {
    ancestors.delete(value)
  }
}
