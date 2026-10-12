import {
  LosslessNumber,
  readJsonStrict,
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'

/** Consume the released strict JSON boundary, with no caller-data mutation. */
export function jsonValue(value: unknown): JsonValue | undefined {
  let text: string
  try {
    text = writeJsonLossless(value)
  } catch (error) {
    if (error instanceof TypeError) return undefined
    throw error
  }
  const result = readJsonStrict(text)
  if ('failed' in result) throw new Error('lossless writer produced invalid JSON')
  return result.ok
}

export function isObject(value: unknown): value is JsonObject {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !LosslessNumber.is(value)
  )
}

export function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}
