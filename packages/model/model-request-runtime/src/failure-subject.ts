import { validate as validateLoop } from '@omne-harness-lite/loop-extension'
import { ExactDecimal, type ModelCallId } from '@omne-harness-lite/call-accounts'
import { isJsonNumber } from '@omne-harness-lite/content-blocks'
import type { CallHistoryDispatch } from './call-history.ts'
import type { CurrentHistoryReaders } from './service-types.ts'
import type { SettlementPrefix } from './settlement-prefix.ts'

function object(value: unknown): value is Readonly<Record<string, unknown>> {
  return (
    value !== null && typeof value === 'object' && !Array.isArray(value) && !isJsonNumber(value)
  )
}
function sameJson(left: unknown, right: unknown): boolean {
  if (isJsonNumber(left) || isJsonNumber(right))
    return (
      isJsonNumber(left) &&
      isJsonNumber(right) &&
      ExactDecimal.from(left).compare(ExactDecimal.from(right)) === 0
    )
  if (Array.isArray(left) || Array.isArray(right))
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => sameJson(item, right[index]))
    )
  if (object(left) || object(right)) {
    if (!object(left) || !object(right)) return false
    const keys = Object.keys(left)
    return (
      keys.length === Object.keys(right).length &&
      keys.every(key => Object.hasOwn(right, key) && sameJson(left[key], right[key]))
    )
  }
  return left === right
}

/** S-76: a failure subject is an all-or-nothing view of one owned prefix. */
export function readFailureSubject(input: {
  readonly prefix: SettlementPrefix
  readonly callId: ModelCallId
  readonly dispatches: readonly CallHistoryDispatch[]
  readonly source: CurrentHistoryReaders['failure']
}): ReturnType<CurrentHistoryReaders['failure']> {
  const { prefix, callId, dispatches, source } = input
  const latest = dispatches.at(-1)
  if (latest?.response?.projection.outcome !== 'failed') return { unavailable: true }
  try {
    const result = source(prefix, callId)
    if ('unavailable' in result) return result
    const subject = result.subject
    if (!validateLoop('AfterModelCallFailureSubject', subject).valid) return { unavailable: true }
    const failed = object(latest.response.value) ? latest.response.value.failure : undefined
    if (!object(failed) || subject.failure !== failed.cause) return { unavailable: true }
    if (
      subject.inBand !== failed.inBand ||
      !sameJson(subject.statusCode, failed.statusCode) ||
      !sameJson(subject.profile, latest.record.profileSnapshot)
    )
      return { unavailable: true }
    if (
      !Array.isArray(subject.retryConclusions) ||
      subject.dispatches.length !== dispatches.length ||
      subject.dispatches.some((record, index) => {
        const historic = dispatches[index]?.record
        return historic === undefined || record.call !== callId || !sameJson(record, historic)
      })
    )
      return { unavailable: true }
    // The provider owns ordered runner conclusions from this prefix. The runtime
    // cannot infer an empty history from an unreadable runner source.
    return result
  } catch {
    return { unavailable: true }
  }
}
