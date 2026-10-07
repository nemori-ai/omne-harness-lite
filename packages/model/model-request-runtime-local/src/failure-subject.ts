import type {
  CallHistoryDispatch,
  ModelFailureExecution,
  ModelFailureSource,
} from '@omne-harness-lite/model-request-runtime'
import {
  validate as validateLoop,
  type AfterModelCallFailureSubject,
} from '@omne-harness-lite/loop-extension'
import {
  ExactDecimal,
  judgeAccountValue,
  type ModelCallId,
  type RunId,
} from '@omne-harness-lite/call-accounts'
import { copyJsonValue, isJsonNumber } from '@omne-harness-lite/content-blocks'
import { judgeModelResponse, type ModelResponse } from '@omne-harness-lite/model-response'
import { modelLogJsonEqual } from '@omne-harness-lite/model-request-runtime'
import {
  interpretCallHistory,
  rejectAcknowledgedHistory,
  type UnacknowledgedCallHistory,
} from './call-history.ts'
import type { CurrentHistoryReaders } from './service-types.ts'
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
  if (Array.isArray(left) || Array.isArray(right)) return sameJsonArray(left, right)
  if (object(left) || object(right)) return sameJsonObject(left, right)
  return left === right
}

function sameJsonArray(left: unknown, right: unknown): boolean {
  return (
    Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((item, index) => sameJson(item, right[index]))
  )
}

function sameJsonObject(left: unknown, right: unknown): boolean {
  if (!object(left) || !object(right)) return false
  const keys = Object.keys(left)
  return (
    keys.length === Object.keys(right).length &&
    keys.every(key => Object.hasOwn(right, key) && sameJson(left[key], right[key]))
  )
}

function subjectDispatchesMatch(
  subject: AfterModelCallFailureSubject,
  dispatches: readonly CallHistoryDispatch[],
  callId: ModelCallId,
): boolean {
  return !(
    !Array.isArray(subject.retryConclusions) ||
    subject.dispatches.length !== dispatches.length ||
    subject.dispatches.some((record, index) => {
      const historic = dispatches[index]?.record
      return historic === undefined || record.call !== callId || !sameJson(record, historic)
    })
  )
}

function failureFactsMatch(
  subject: AfterModelCallFailureSubject,
  failed: Readonly<Record<string, unknown>>,
  latest: CallHistoryDispatch,
): boolean {
  return !(
    subject.inBand !== failed.inBand ||
    !sameJson(subject.statusCode, failed.statusCode) ||
    !sameJson(subject.profile, latest.record.profileSnapshot)
  )
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
    const copied = copyJsonValue(result.subject)
    if ('failed' in copied || !validateLoop('AfterModelCallFailureSubject', copied.ok).valid)
      return { unavailable: true }
    const subject = copied.ok as unknown as AfterModelCallFailureSubject
    const failed = object(latest.response.value) ? latest.response.value.failure : undefined
    if (!object(failed) || subject.failure !== failed.cause) return { unavailable: true }
    if (!failureFactsMatch(subject, failed, latest)) return { unavailable: true }
    if (!subjectDispatchesMatch(subject, dispatches, callId)) return { unavailable: true }
    // The provider owns ordered runner conclusions from this prefix. The runtime
    // cannot infer an empty history from an unreadable runner source.
    return { subject }
  } catch {
    return { unavailable: true }
  }
}

function validDispatchIdentity(shell: CallHistoryDispatch['dispatched']): boolean {
  return !(
    (shell.run === undefined) !== (shell.attempt === undefined) ||
    (shell.run !== undefined && !('ok' in judgeAccountValue('RunId', shell.run))) ||
    (shell.attempt !== undefined && !('ok' in judgeAccountValue('AttemptId', shell.attempt)))
  )
}

function responseIdentityMatches(
  dispatch: CallHistoryDispatch,
  shell: CallHistoryDispatch['dispatched'],
  input: Pick<Parameters<typeof createModelFailureSource>[0], 'callId'>,
): boolean {
  if (dispatch.response !== null) {
    const response = judgeModelResponse(dispatch.response.value)
    if (!('ok' in response)) return false
    // The response validator established this full value before the typed projection.
    const value = dispatch.response.value as unknown as ModelResponse
    if (
      value.call.callId !== input.callId ||
      value.call.runId !== shell.run ||
      (value.attemptId === undefined) !== (shell.attempt === undefined) ||
      (value.attemptId !== undefined &&
        shell.attempt !== undefined &&
        ExactDecimal.from(value.attemptId).compare(ExactDecimal.from(shell.attempt)) !== 0)
    )
      return false
  }
  return true
}

function dispatchRun(
  dispatches: readonly CallHistoryDispatch[],
  input: Pick<Parameters<typeof createModelFailureSource>[0], 'callId'>,
): { run: RunId | undefined } | null {
  let originalRun: RunId | undefined
  for (const [index, dispatch] of dispatches.entries()) {
    const shell = dispatch.dispatched
    if (!validDispatchIdentity(shell)) return null
    if (index === 0) originalRun = shell.run
    else if (shell.run !== originalRun) return null
    if (!responseIdentityMatches(dispatch, shell, input)) return null
  }
  return { run: originalRun }
}

function failureExecutionMatches(execution: ModelFailureExecution, originalRun: RunId | undefined) {
  return !(
    !object(execution) ||
    !('ok' in judgeAccountValue('RunId', execution.run)) ||
    !('ok' in judgeAccountValue('AttemptId', execution.attempt)) ||
    originalRun === undefined ||
    execution.run !== originalRun
  )
}

/** The returned source owns a fixed value/prefix until explicit release or host revocation. */
export function createModelFailureSource(input: {
  readonly prefix: SettlementPrefix
  readonly callId: ModelCallId
  readonly owner: SettlementOwner
  readonly subject: AfterModelCallFailureSubject
  readonly usable: () => boolean
  readonly retain: (source: ModelFailureSource) => void
  readonly forget: (source: ModelFailureSource) => void
}): ModelFailureSource | null {
  let history: UnacknowledgedCallHistory
  try {
    history = rejectAcknowledgedHistory(
      interpretCallHistory({ prefix: input.prefix, callId: input.callId }),
    )
  } catch {
    return null
  }
  if (!('known' in history) || history.known.phase !== 'awaiting_decision') return null
  const checkedHistory = readFailureSubject({
    prefix: input.prefix,
    callId: input.callId,
    dispatches: history.known.dispatches,
    source: () => ({ subject: input.subject }),
  })
  if (!('subject' in checkedHistory)) return null
  const original = dispatchRun(history.known.dispatches, input)
  if (original === null) return null
  const originalRun = original.run
  // The subject was copied and validated against this same prefix by readFailureSubject.
  const freezeJson = (value: unknown): void => {
    if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return
    for (const member of Object.values(value)) freezeJson(member)
    Object.freeze(value)
  }
  const subject = checkedHistory.subject
  freezeJson(subject)
  const { owner, usable, retain, forget } = input
  let prefix: SettlementPrefix | undefined = input.prefix
  const source: ModelFailureSource = Object.freeze({
    subject,
    verify(
      candidate: AfterModelCallFailureSubject,
      execution: ModelFailureExecution,
    ): ReturnType<ModelFailureSource['verify']> {
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
      try {
        if (!failureExecutionMatches(execution, originalRun)) return { invalidInput: true }
        const checked = copyJsonValue(candidate)
        if (
          'failed' in checked ||
          !validateLoop('AfterModelCallFailureSubject', checked.ok).valid ||
          !modelLogJsonEqual(checked.ok, subject)
        )
          return { invalidInput: true }
      } catch {
        return { invalidInput: true }
      }
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
