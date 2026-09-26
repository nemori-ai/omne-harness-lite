import {
  LosslessNumber,
  readJsonStrict,
  writeJsonLossless,
} from '@omne-harness-lite/content-blocks'
import type { JsonObject, JsonValue } from '@omne-harness-lite/content-blocks'

export function object(value: unknown): value is JsonObject {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !LosslessNumber.is(value)
  )
}
export function copyJson(value: unknown): JsonValue | undefined {
  try {
    const result = readJsonStrict(writeJsonLossless(value))
    if ('failed' in result) throw new Error('lossless writer produced invalid JSON')
    return result.ok
  } catch (error) {
    if (error instanceof TypeError) return undefined
    throw error
  }
}
