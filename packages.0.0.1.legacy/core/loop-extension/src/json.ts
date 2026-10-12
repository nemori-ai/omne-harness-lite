import {
  readJsonStrict,
  writeJsonLossless,
  LosslessNumber,
  jsonNumberSource,
  isJsonNumber,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'

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
export function object(value: unknown): value is JsonObject {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !LosslessNumber.is(value)
  )
}
/** JSON numeric values compare mathematically; a decimal token is never rounded through JS. */
function numericKey(value: Parameters<typeof jsonNumberSource>[0]): string {
  const source = jsonNumberSource(value)
  const [mantissa = '', exponent = '0'] = source.toLowerCase().split('e')
  const negative = mantissa.startsWith('-')
  const unsigned = negative ? mantissa.slice(1) : mantissa
  const [whole = '', fraction = ''] = unsigned.split('.')
  const digits = (whole + fraction).replace(/^0+/u, '')
  if (digits === '') return '0'
  const significant = digits.replace(/0+$/u, '')
  const scale =
    BigInt(exponent) - BigInt(fraction.length) + BigInt(digits.length - significant.length)
  return `${negative ? '-' : ''}${significant}e${scale}`
}
export function equal(left: JsonValue | undefined, right: JsonValue | undefined): boolean {
  if (left === right) return true
  if (isJsonNumber(left) && isJsonNumber(right)) return numericKey(left) === numericKey(right)
  if (Array.isArray(left) && Array.isArray(right))
    return left.length === right.length && left.every((item, index) => equal(item, right[index]))
  if (!object(left) || !object(right)) return false
  const keys = Object.keys(left)
  return (
    keys.length === Object.keys(right).length &&
    keys.every(key => Object.hasOwn(right, key) && equal(left[key], right[key]))
  )
}
export function exceptEqual(
  left: JsonObject,
  right: JsonObject,
  allowed: readonly string[],
): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  return [...keys].every(
    key =>
      allowed.includes(key) ||
      (Object.hasOwn(left, key) === Object.hasOwn(right, key) && equal(left[key], right[key])),
  )
}
