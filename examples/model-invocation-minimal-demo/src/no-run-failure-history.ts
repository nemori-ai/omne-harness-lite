import type { ModelCallId } from '@omne-harness-lite/call-accounts'
import { judgeModelResponse, type ModelResponse } from '@omne-harness-lite/model-response'
import {
  decodeModelLogKey,
  interpretCallHistory,
  type CurrentHistoryReaders,
  type SettlementPrefix,
} from '@omne-harness-lite/model-request-runtime'

/** This app owns only noRun model-log writes. Foreign or undecodable history is unknown. */
export function readDemoNoRunFailure(
  prefix: SettlementPrefix,
  callId: ModelCallId,
): ReturnType<CurrentHistoryReaders['failure']> {
  if (
    prefix.entries.some(
      entry =>
        entry.run !== undefined ||
        entry.attempt !== undefined ||
        (entry.dedupeKey !== undefined && !('ok' in decodeModelLogKey(entry.dedupeKey))) ||
        entry.readKeys.some(key => !('ok' in decodeModelLogKey(key))),
    )
  )
    return { unavailable: true }
  const history = interpretCallHistory({ prefix, callId })
  if (!('known' in history) || history.known.dispatches.length === 0) return { unavailable: true }
  const dispatches = history.known.dispatches
  const last = dispatches.at(-1)
  if (last?.response === null || last?.response === undefined) return { unavailable: true }
  const value = last.response.value
  if (!('ok' in judgeModelResponse(value))) return { unavailable: true }
  const response = value as unknown as ModelResponse
  if (response.outcome !== 'failed') return { unavailable: true }
  const first = dispatches[0]
  if (first === undefined) return { unavailable: true }
  // The complete, validated noRun prefix has no runner domain or retry-conclusion entries.
  const common = {
    failure: response.failure.cause,
    profile: last.record.profileSnapshot,
    dispatches: [first.record, ...dispatches.slice(1).map(item => item.record)] as const,
    retryConclusions: [],
  }
  return response.failure.inBand === true
    ? { subject: { ...common, inBand: true, statusCode: response.failure.statusCode } }
    : response.failure.statusCode === undefined
      ? { subject: common }
      : { subject: { ...common, statusCode: response.failure.statusCode } }
}
