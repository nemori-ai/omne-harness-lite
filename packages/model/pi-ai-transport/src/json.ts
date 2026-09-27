import {
  copyJsonValue,
  isJsonNumber,
  readJsonStrict,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'

export function object(value: unknown): value is JsonObject {
  return (
    value !== null && typeof value === 'object' && !Array.isArray(value) && !isJsonNumber(value)
  )
}
export function ownedObject(value: unknown): JsonObject | undefined {
  const copied = copyJsonValue(value)
  return 'ok' in copied && object(copied.ok) ? copied.ok : undefined
}
export function strictObject(text: string): JsonObject | undefined {
  const result = readJsonStrict(text)
  return 'ok' in result && object(result.ok) ? result.ok : undefined
}
export function member(value: JsonValue | undefined, key: string): JsonValue | undefined {
  return object(value) ? value[key] : undefined
}
