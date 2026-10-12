import {
  LosslessNumber,
  readJsonStrict,
  writeJsonLossless,
  type JsonValue,
  type JsonObject,
} from './json.ts'
import type { SchemaDocument } from './schema-runtime.ts'

export function object(value: unknown): value is JsonObject {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !LosslessNumber.is(value)
  )
}
export function copy(value: JsonValue): JsonValue {
  const result = readJsonStrict(writeJsonLossless(value))
  if ('failed' in result) throw new Error('lossless writer produced invalid JSON')
  return result.ok
}
export function copySchema(schema: SchemaDocument): SchemaDocument {
  const result = copy(schema)
  if (typeof result !== 'boolean' && !object(result))
    throw new TypeError('Schema must be an object or boolean')
  return result
}
export function projection(value: JsonValue): JsonValue {
  if (LosslessNumber.is(value)) {
    const numeric = Number(value.source)
    return Number.isFinite(numeric)
      ? numeric
      : value.source.startsWith('-')
        ? -Number.MAX_VALUE
        : Number.MAX_VALUE
  }
  if (Array.isArray(value)) return value.map(projection)
  if (object(value))
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, projection(item)]))
  return value
}
