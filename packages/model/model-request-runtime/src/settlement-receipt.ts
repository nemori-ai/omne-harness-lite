import {
  copyJsonValue,
  isJsonNumber,
  isNonNegativeJsonInteger,
  type JsonObject,
} from '@omne-harness-lite/content-blocks'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import type { AppendResult } from '@omne-harness-lite/session-log-jsonl'
function object(value: unknown): value is JsonObject {
  return (
    value !== null && typeof value === 'object' && !Array.isArray(value) && !isJsonNumber(value)
  )
}
/** A malformed receipt is unconfirmed, never a successful append or known THIS rejection. */
export function settlementAppendReceipt(raw: unknown, count: number): AppendResult | null {
  const copied = copyJsonValue(raw)
  if ('failed' in copied || !object(copied.ok)) return null
  const value = copied.ok
  if (value.failure === undefined) {
    if (
      Object.keys(value).length !== 2 ||
      !Array.isArray(value.positions) ||
      value.positions.length !== count ||
      !isNonNegativeJsonInteger(value.tail)
    )
      return null
    const positions = []
    let previous
    for (const position of value.positions) {
      if (
        !isNonNegativeJsonInteger(position) ||
        ExactDecimal.from(position).compare(ExactDecimal.from(0)) <= 0 ||
        (previous !== undefined &&
          ExactDecimal.from(position).compare(
            ExactDecimal.from(previous).add(ExactDecimal.from(1)),
          ) !== 0)
      )
        return null
      positions.push(position)
      previous = position
    }
    if (
      previous === undefined ||
      ExactDecimal.from(previous).compare(ExactDecimal.from(value.tail)) !== 0
    )
      return null
    return Object.freeze({ positions: Object.freeze(positions), tail: value.tail })
  }
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
    const keys: string[] = []
    for (const key of value.keys) {
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
  return null
}
