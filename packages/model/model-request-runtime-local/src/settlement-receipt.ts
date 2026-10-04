import {
  copyJsonValue,
  isJsonNumber,
  isNonNegativeJsonInteger,
  type JsonObject,
  type JsonNumber,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import type { AppendResult } from '@omne-harness-lite/session-log-jsonl'
function object(value: unknown): value is JsonObject {
  return (
    value !== null && typeof value === 'object' && !Array.isArray(value) && !isJsonNumber(value)
  )
}
function isNextPosition(
  position: JsonValue,
  previous: JsonNumber | undefined,
): position is JsonNumber {
  return (
    isNonNegativeJsonInteger(position) &&
    ExactDecimal.from(position).compare(ExactDecimal.from(0)) > 0 &&
    (previous === undefined ||
      ExactDecimal.from(position).compare(ExactDecimal.from(previous).add(ExactDecimal.from(1))) ===
        0)
  )
}
function receiptPositions(values: readonly JsonValue[]): readonly JsonNumber[] | null {
  const positions: JsonNumber[] = []
  let previous
  for (const position of values) {
    if (!isNextPosition(position, previous)) return null
    positions.push(position)
    previous = position
  }
  return positions
}
function successfulReceipt(value: JsonObject, count: number): AppendResult | null {
  if (
    Object.keys(value).length !== 2 ||
    !Array.isArray(value.positions) ||
    value.positions.length !== count ||
    !isNonNegativeJsonInteger(value.tail)
  )
    return null
  const positions = receiptPositions(value.positions)
  if (positions === null) return null
  const previous = positions.at(-1)
  if (
    previous === undefined ||
    ExactDecimal.from(previous).compare(ExactDecimal.from(value.tail)) !== 0
  )
    return null
  return Object.freeze({ positions: Object.freeze(positions), tail: value.tail })
}
function shortFailure(value: JsonObject): AppendResult | null {
  if (
    ['invalidInput', 'unavailable', 'tenantMismatch', 'attemptSuperseded'].includes(
      typeof value.failure === 'string' ? value.failure : '',
    ) &&
    Object.keys(value).length === 1
  ) {
    const failure = value.failure
    if (
      failure === 'invalidInput' ||
      failure === 'unavailable' ||
      failure === 'tenantMismatch' ||
      failure === 'attemptSuperseded'
    )
      return Object.freeze({ failure })
  }
  return null
}
function recordedKeys(values: readonly JsonValue[]): AppendResult | null {
  const keys: string[] = []
  for (const key of values) {
    if (
      typeof key !== 'string' ||
      !('ok' in parseOpaqueIdentifier(key, 'LogKey')) ||
      keys.includes(key)
    )
      return null
    keys.push(key)
  }
  return Object.freeze({ failure: 'alreadyRecorded', keys: Object.freeze(keys) })
}
/** A malformed receipt is unconfirmed, never a successful append or known THIS rejection. */
export function settlementAppendReceipt(raw: unknown, count: number): AppendResult | null {
  const copied = copyJsonValue(raw)
  if ('failed' in copied || !object(copied.ok)) return null
  const value = copied.ok
  if (value.failure === undefined) return successfulReceipt(value, count)
  const short = shortFailure(value)
  if (short !== null) return short
  if (
    value.failure === 'tailChanged' &&
    Object.keys(value).length === 2 &&
    isNonNegativeJsonInteger(value.tail)
  )
    return Object.freeze({ failure: 'tailChanged', tail: value.tail })
  if (
    value.failure === 'alreadyRecorded' &&
    Object.keys(value).length === 2 &&
    Array.isArray(value.keys) &&
    value.keys.length > 0
  ) {
    return recordedKeys(value.keys)
  }
  return null
}
