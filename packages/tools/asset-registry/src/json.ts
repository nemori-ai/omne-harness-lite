import {
  copyJsonValue,
  isJsonNumber,
  LosslessNumber,
  type JsonValue,
  type JsonObject,
} from '@omne-harness-lite/content-blocks'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
export function object(value: unknown): value is JsonObject {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !LosslessNumber.is(value)
  )
}
function protect(value: JsonValue): JsonValue {
  if (value !== null && typeof value === 'object' && !LosslessNumber.is(value)) {
    for (const child of Object.values(value)) protect(child)
    Object.freeze(value)
  }
  return value
}
export function own(value: unknown): JsonValue | undefined {
  const result = copyJsonValue(value)
  return 'failed' in result ? undefined : protect(result.ok)
}
export function requiredOwn<T>(value: T): T {
  const copy = own(value)
  if (copy === undefined) throw new TypeError('registry output is not strict lossless JSON')
  return copy as T
}
export function equal(left: unknown, right: unknown): boolean {
  if (isJsonNumber(left) || isJsonNumber(right))
    return (
      isJsonNumber(left) &&
      isJsonNumber(right) &&
      ExactDecimal.from(left).compare(ExactDecimal.from(right)) === 0
    )
  if (left === right) return true
  if (Array.isArray(left) || Array.isArray(right))
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => equal(item, right[index]))
    )
  return (
    object(left) &&
    object(right) &&
    Object.keys(left).length === Object.keys(right).length &&
    Object.keys(left).every(key => Object.hasOwn(right, key) && equal(left[key], right[key]))
  )
}
export function closed(value: unknown, keys: readonly string[]): value is JsonObject {
  return (
    object(value) &&
    Object.keys(value).length === keys.length &&
    keys.every(key => Object.hasOwn(value, key))
  )
}
