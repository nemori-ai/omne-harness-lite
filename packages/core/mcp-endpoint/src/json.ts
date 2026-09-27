import {
  LosslessNumber,
  readJsonStrict,
  writeJsonLossless,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'

export function object(value: unknown): value is JsonObject {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !LosslessNumber.is(value)
  )
}

/** Validate unknown JS data before it is treated as JSON, without rounding JSON numbers. */
export function jsonValue(value: unknown): JsonValue | undefined {
  let text: string
  try {
    text = writeJsonLossless(value)
  } catch (error) {
    if (error instanceof TypeError) return undefined
    throw error
  }
  const parsed = readJsonStrict(text)
  if ('failed' in parsed) throw new Error('lossless JSON writer produced invalid data')
  return parsed.ok
}
