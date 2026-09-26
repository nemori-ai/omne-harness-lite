import {
  LosslessNumber,
  readJsonStrict,
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'

/** The shared JSON boundary rejects non-JSON data without invoking getters or dropping fields. */
export function snapshot(value: unknown): JsonValue | undefined {
  try {
    const result = readJsonStrict(writeJsonLossless(value))
    if ('failed' in result) throw new Error('lossless writer produced invalid JSON')
    return result.ok
  } catch (error) {
    if (error instanceof TypeError) return undefined
    throw error
  }
}
export function isObject(value: unknown): value is JsonObject {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !LosslessNumber.is(value)
  )
}
