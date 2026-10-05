import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import {
  copyJsonValue,
  isJsonNumber,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'

export function jsonObject(value: unknown): value is JsonObject {
  return (
    value !== null && typeof value === 'object' && !Array.isArray(value) && !isJsonNumber(value)
  )
}
export function sameOwnedJson(left: JsonValue, right: JsonValue): boolean {
  if (isJsonNumber(left) && isJsonNumber(right))
    return ExactDecimal.from(left).compare(ExactDecimal.from(right)) === 0
  if (Array.isArray(left) && Array.isArray(right))
    return (
      left.length === right.length &&
      left.every((value, index) => right[index] !== undefined && sameOwnedJson(value, right[index]))
    )
  if (jsonObject(left) && jsonObject(right))
    return (
      Object.keys(left).length === Object.keys(right).length &&
      Object.entries(left).every(
        ([key, value]) =>
          Object.hasOwn(right, key) && right[key] !== undefined && sameOwnedJson(value, right[key]),
      )
    )
  return left === right
}
export function sameJson(left: unknown, right: unknown): boolean {
  const a = copyJsonValue(left),
    b = copyJsonValue(right)
  return 'ok' in a && 'ok' in b && sameOwnedJson(a.ok, b.ok)
}
