import { ExactDecimal, type ModelCallId } from '@omne-harness-lite/call-accounts'
import type { JsonNumber, JsonValue } from '@omne-harness-lite/content-blocks'
import type {
  ModelCallDispatchedRecord,
  ModelCallEndedRecord,
  ModelCallInterruptIntentRecord,
  ModelCallOpenedRecord,
  SessionRef,
} from '@omne-harness-lite/messages'
import type { LogEntry } from '@omne-harness-lite/session-log-jsonl'
import type { ModelLogResponseProjection } from './log-codec-v2.ts'
import {
  interpretSettlementPrefix,
  isOwnedSettlementPrefix,
  settlementGenerationCurrent,
  type SettlementPrefix,
} from './settlement-prefix.ts'
import type { DispatchGuardPhase } from './dispatch-guard.ts'
import { inspectCurrentModelLogPrefix } from './log-codec-settlement.ts'

export interface CallHistoryDispatch {
  readonly ordinal: JsonNumber
  readonly dispatched: LogEntry
  readonly record: ModelCallDispatchedRecord
  readonly opened: LogEntry | null
  readonly response: {
    /** Original complete validated response, including raw usage and billing facts. */
    readonly value: JsonValue
    readonly projection: ModelLogResponseProjection
    readonly entry: LogEntry
  } | null
}

/** A complete log prefix can establish durable facts, but cannot establish an in-memory reply. */
export type CallHistoryResult =
  | { readonly absent: true }
  | {
      readonly unavailable: true
      readonly reason: 'prefix' | 'history' | 'unknown_format' | 'run_history_unavailable'
    }
  | {
      readonly known: {
        readonly session: SessionRef
        readonly callId: ModelCallId
        /** Null means an intent exists, but no durable call phase can yet be concluded. */
        readonly phase: Exclude<DispatchGuardPhase, 'open' | 'reply_pending'> | null
        readonly dispatches: readonly CallHistoryDispatch[]
        readonly intent: ModelCallInterruptIntentRecord | null
        readonly ending: ModelCallEndedRecord | null
      }
    }

type RecordEntry = {
  readonly entry: LogEntry
  readonly record:
    | ModelCallDispatchedRecord
    | ModelCallOpenedRecord
    | ModelCallInterruptIntentRecord
    | ModelCallEndedRecord
}

const unavailable = (reason: 'prefix' | 'history' | 'unknown_format' | 'run_history_unavailable') =>
  ({ unavailable: true, reason }) as const

/**
 * RT5 S-6/S-8/S-34: read one call from the owned, complete SL3 prefix.
 * No current process phase, diagnostic sink, cached projection, or Run guess is an input.
 * The return is a durable frontier; an unconfirmed writer may still change the log.
 */
export function interpretCallHistory(input: {
  readonly prefix: SettlementPrefix
  readonly callId: ModelCallId
}): CallHistoryResult {
  const { prefix, callId } = input
  if (!isOwnedSettlementPrefix(prefix) || !settlementGenerationCurrent(prefix.binding))
    return unavailable('prefix')
  const inspectedPrefix = inspectCurrentModelLogPrefix({
    session: prefix.binding.session,
    tenant: prefix.binding.tenant,
    prefix,
  })
  if (!('ok' in inspectedPrefix))
    return unavailable(
      'reason' in inspectedPrefix && inspectedPrefix.reason === 'unknown_format'
        ? 'unknown_format'
        : 'history',
    )
  const records: RecordEntry[] = []
  const responses: { readonly entry: LogEntry; readonly response: ModelLogResponseProjection }[] =
    []
  for (const { entry, captured } of inspectedPrefix.ok) {
    if (captured.record !== null && 'call' in captured.record && captured.record.call === callId) {
      records.push({ entry, record: captured.record })
    }
    if (captured.response !== null && captured.response.call.callId === callId)
      responses.push({ entry, response: captured.response })
  }
  if (records.length === 0 && responses.length === 0) return { absent: true }
  if (
    records.some(item => item.entry.run !== undefined || item.entry.attempt !== undefined) ||
    responses.some(item => item.entry.run !== undefined || item.entry.attempt !== undefined)
  )
    return unavailable('run_history_unavailable')

  const dispatched = records.filter(
    (item): item is RecordEntry & { readonly record: ModelCallDispatchedRecord } =>
      item.record.kind === 'model_call_dispatched',
  )
  const opened = records.filter(
    (item): item is RecordEntry & { readonly record: ModelCallOpenedRecord } =>
      item.record.kind === 'model_call_opened',
  )
  const intents = records.filter(
    (item): item is RecordEntry & { readonly record: ModelCallInterruptIntentRecord } =>
      item.record.kind === 'model_call_interrupt_intent',
  )
  const endings = records.filter(
    (item): item is RecordEntry & { readonly record: ModelCallEndedRecord } =>
      item.record.kind === 'model_call_ended',
  )
  if (intents.length > 1 || endings.length > 1 || opened.length > dispatched.length)
    return unavailable('history')
  const dispatches: CallHistoryDispatch[] = []
  for (const [index, item] of dispatched.entries()) {
    if (ExactDecimal.from(item.record.dispatch).compare(ExactDecimal.from(index + 1)) !== 0)
      return unavailable('history')
    const anchor = opened.filter(
      candidate =>
        ExactDecimal.from(candidate.record.dispatch).compare(
          ExactDecimal.from(item.record.dispatch),
        ) === 0,
    )
    const body = responses.filter(candidate => candidate.response.id === item.record.response)
    if (
      anchor.length > 1 ||
      body.length > 1 ||
      (anchor[0] !== undefined &&
        ExactDecimal.from(anchor[0].entry.position).compare(
          ExactDecimal.from(item.entry.position),
        ) <= 0)
    )
      return unavailable('history')
    const interpreted = interpretSettlementPrefix({
      prefix,
      target: {
        call: callId,
        dispatch: item.record.dispatch,
        response: item.record.response,
      },
      current: null,
    })
    if (!('facts' in interpreted)) return unavailable('history')
    const members = interpreted.facts.members
    if ('inconsistent' in members || 'undetermined' in members) return unavailable('history')
    if ((body.length === 0) !== 'absent' in members) return unavailable('history')
    const complete = 'completeMembers' in members ? members.completeMembers : null
    const responseCapture = complete?.response ?? null
    const responseEntry = body[0]?.entry ?? null
    if (complete !== null && (responseCapture?.response === null || responseEntry === null))
      return unavailable('history')
    dispatches.push({
      ordinal: item.record.dispatch,
      dispatched: item.entry,
      record: item.record,
      opened: anchor[0]?.entry ?? null,
      response:
        responseCapture?.response !== null && responseCapture !== null && responseEntry !== null
          ? {
              value: responseCapture.value,
              projection: responseCapture.response,
              entry: responseEntry,
            }
          : null,
    })
  }
  if (
    opened.some(
      item =>
        !dispatched.some(
          candidate =>
            ExactDecimal.from(candidate.record.dispatch).compare(
              ExactDecimal.from(item.record.dispatch),
            ) === 0,
        ),
    ) ||
    responses.some(
      item => !dispatched.some(candidate => candidate.record.response === item.response.id),
    )
  )
    return unavailable('history')
  const last = dispatches.at(-1)
  const intent = intents[0]?.record ?? null
  const ending = endings[0]?.record ?? null
  if (
    (ending?.ending === 'undispatched' && last !== undefined) ||
    (ending === null && intent === null && last === undefined) ||
    (last !== undefined &&
      ending !== null &&
      last.response === null &&
      ending.ending !== 'interrupted')
  )
    return unavailable('history')
  let phase: Exclude<DispatchGuardPhase, 'open' | 'reply_pending'> | null
  if (ending !== null) {
    phase = ending.ending === 'interrupted' ? 'interrupted' : 'handed_up'
  } else if (last === undefined) {
    phase = null
  } else if (last?.response !== null && last?.response !== undefined) {
    const response = last.response.projection
    phase =
      response.outcome === 'complete' || response.outcome === 'truncated'
        ? 'complete'
        : response.outcome === 'failed'
          ? 'awaiting_decision'
          : response.outcome === 'interrupted' &&
              response.initiator === 'runtime_lost' &&
              last.opened === null
            ? 'resumable'
            : 'interrupted'
  } else {
    phase = last?.opened === null ? 'in_flight' : 'speaking'
  }
  return {
    known: {
      session: prefix.binding.session,
      callId,
      phase,
      dispatches: Object.freeze(dispatches),
      intent,
      ending,
    },
  }
}
