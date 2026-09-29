import {
  validate as validateLoop,
  type AfterModelCallFailureSubject,
} from '@omne-harness-lite/loop-extension'
import { ExactDecimal, type ModelCallId } from '@omne-harness-lite/call-accounts'
import { copyJsonValue, isJsonNumber } from '@omne-harness-lite/content-blocks'
import { modelLogJsonEqual } from './log-codec.ts'
import type { CallHistoryDispatch } from './call-history.ts'
import type { CurrentHistoryReaders, ModelFailureSource } from './service-types.ts'
import { settlementGenerationCurrent, type SettlementPrefix } from './settlement-prefix.ts'
import type { SettlementOwner } from './settlement-types.ts'

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

/** The returned source owns a fixed value/prefix until explicit release or host revocation. */
export function createModelFailureSource(input: {
  readonly prefix: SettlementPrefix
  readonly owner: SettlementOwner
  readonly subject: AfterModelCallFailureSubject
  readonly usable: () => boolean
  readonly retain: (source: ModelFailureSource) => void
  readonly forget: (source: ModelFailureSource) => void
}): ModelFailureSource | null {
  const copied = copyJsonValue(input.subject)
  if ('failed' in copied || !validateLoop('AfterModelCallFailureSubject', copied.ok).valid)
    return null
  // The LC6 validator above checked the owned JSON representation before this projection.
  const freezeJson = (value: unknown): void => {
    if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return
    for (const member of Object.values(value)) freezeJson(member)
    Object.freeze(value)
  }
  const subject = copied.ok as unknown as AfterModelCallFailureSubject
  freezeJson(subject)
  const { owner, usable, retain, forget } = input
  let prefix: SettlementPrefix | undefined = input.prefix
  const source: ModelFailureSource = Object.freeze({
    subject,
    verify(candidate: AfterModelCallFailureSubject): ReturnType<ModelFailureSource['verify']> {
      try {
        if (
          prefix === undefined ||
          !usable() ||
          !settlementGenerationCurrent(prefix.binding) ||
          owner.admission() !== 'open'
        )
          return { unavailable: true }
      } catch {
        return { unavailable: true }
      }
      const checked = copyJsonValue(candidate)
      if (
        'failed' in checked ||
        !validateLoop('AfterModelCallFailureSubject', checked.ok).valid ||
        !modelLogJsonEqual(checked.ok, subject)
      )
        return { invalidInput: true }
      return { authoritativeSubject: subject }
    },
    release() {
      if (prefix === undefined) return
      prefix = undefined
      forget(source)
    },
  })
  retain(source)
  return source
}
