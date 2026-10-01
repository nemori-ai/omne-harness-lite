import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import {
  LosslessNumber,
  isJsonNumber,
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

export function equal(a: JsonValue, b: JsonValue): boolean {
  if (isJsonNumber(a) && isJsonNumber(b))
    return ExactDecimal.from(a).compare(ExactDecimal.from(b)) === 0
  if (Array.isArray(a) && Array.isArray(b))
    return (
      a.length === b.length &&
      a.every((item, i) => {
        const other = b[i]
        return other !== undefined && equal(item, other)
      })
    )
  if (isObject(a) && isObject(b)) {
    const keys = Object.keys(a)
    return (
      keys.length === Object.keys(b).length &&
      keys.every(key => {
        const one = a[key],
          two = b[key]
        return one !== undefined && two !== undefined && Object.hasOwn(b, key) && equal(one, two)
      })
    )
  }
  return a === b
}
