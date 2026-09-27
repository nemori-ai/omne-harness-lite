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
export function projection(value: JsonValue): unknown {
  // This is only the owned ToolDefinition exchange-schema/metaschema view.
  // Concurrency and attachment bytes are guarded against the original value;
  // parameter judgments must use the shared exact Ajv adapter instead.
  if (LosslessNumber.is(value)) return 1
  if (Array.isArray(value)) return value.map(projection)
  if (object(value))
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, projection(item)]))
  return value
}
