import {
  LosslessNumber,
  readJsonStrict,
  writeJsonLossless,
  type JsonValue,
  type JsonObject,
} from '@omne-harness-lite/content-blocks'

export function object(value: unknown): value is JsonObject {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !LosslessNumber.is(value)
  )
}
export function snapshot(value: unknown): JsonValue | undefined {
  try {
    const parsed = readJsonStrict(writeJsonLossless(value))
    if ('failed' in parsed) throw new Error('lossless writer produced invalid JSON')
    return parsed.ok
  } catch (error) {
    if (error instanceof TypeError) return undefined
    throw error
  }
}
