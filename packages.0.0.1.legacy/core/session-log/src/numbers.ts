import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import {
  isNonNegativeJsonInteger,
  readJsonStrict,
  type JsonNumber,
} from '@omne-harness-lite/content-blocks'

export function compareInteger(left: JsonNumber, right: JsonNumber): -1 | 0 | 1 {
  return ExactDecimal.from(left).compare(ExactDecimal.from(right))
}
export function positiveInteger(value: unknown): value is JsonNumber {
  return isNonNegativeJsonInteger(value) && compareInteger(value, 0) > 0
}
export function addInteger(left: JsonNumber, right: JsonNumber): JsonNumber {
  const read = readJsonStrict(ExactDecimal.from(left).add(ExactDecimal.from(right)).toString())
  if ('failed' in read || !isNonNegativeJsonInteger(read.ok)) {
    throw new Error('exact integer addition produced a non-integer')
  }
  return read.ok
}
