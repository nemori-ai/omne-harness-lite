import { LosslessNumber, type JsonObject } from '@omne-harness-lite/content-blocks'
export function isObject(value: unknown): value is JsonObject {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !LosslessNumber.is(value)
  )
}
