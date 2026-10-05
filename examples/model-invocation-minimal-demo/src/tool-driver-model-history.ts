import type { AssistantMessage } from '@omne-harness-lite/messages'
import {
  inspectCurrentModelLogPrefix,
  inspectSettlementMembers,
  type CapturedModelLogValue,
  type InspectedModelLogEntry,
} from '@omne-harness-lite/model-request-runtime'
import { compareInteger, type CheckedPrefix, type LogEntry } from '@omne-harness-lite/session-log'

export class DriverHistoryInvalid extends Error {}
export function requireHistory(condition: unknown, reason: string): asserts condition {
  if (!condition) throw new DriverHistoryInvalid(reason)
}
export interface DriverModelReply {
  readonly entry: LogEntry
  readonly message: AssistantMessage
  readonly response: CapturedModelLogValue
  readonly created: LogEntry
  readonly dispatched: LogEntry
}
export interface DriverModelHistory {
  readonly entries: readonly InspectedModelLogEntry[]
  readonly byKey: ReadonlyMap<string, InspectedModelLogEntry>
  readonly replies: ReadonlyMap<string, DriverModelReply>
}
function sameOrigin(a: LogEntry, b: LogEntry): boolean {
  return (
    a.run === b.run &&
    (a.attempt === undefined
      ? b.attempt === undefined
      : b.attempt !== undefined && compareInteger(a.attempt, b.attempt) === 0)
  )
}

/** Reuse the model owner's codecs; an AssistantMessage by itself is never model provenance. */
export function readDriverModelHistory(prefix: CheckedPrefix): DriverModelHistory {
  const inspected = inspectCurrentModelLogPrefix({ ...prefix.scope, prefix })
  requireHistory('ok' in inspected, 'uninterpretable model prefix')
  const entries = inspected.ok
  const byKey = new Map<string, InspectedModelLogEntry>()
  const replies = new Map<string, DriverModelReply>()
  for (const item of entries) {
    const key = item.entry.dedupeKey
    if (key !== undefined) byKey.set(key, item)
    if (item.captured.message?.type !== 'assistant') continue
    const message = item.captured.message
    const responses = entries.filter(other => other.captured.response?.id === message.response)
    const response = responses[0]
    requireHistory(
      responses.length === 1 && response?.captured.response !== null && response !== undefined,
      'assistant has no unique response',
    )
    const value = response.captured.response
    requireHistory(value !== null, 'response capture missing')
    const created = entries.filter(
      other =>
        other.captured.record?.kind === 'model_call_created' &&
        other.captured.record.call === value.call.callId,
    )
    const dispatches = entries.filter(
      other =>
        other.captured.record?.kind === 'model_call_dispatched' &&
        other.captured.record.call === value.call.callId &&
        compareInteger(other.captured.record.dispatch, value.dispatch) === 0,
    )
    const creation = created[0],
      dispatched = dispatches[0]
    requireHistory(
      created.length === 1 &&
        creation !== undefined &&
        dispatches.length === 1 &&
        dispatched !== undefined,
      'response lacks unique creation and dispatch',
    )
    requireHistory(
      sameOrigin(creation.entry, item.entry) &&
        sameOrigin(dispatched.entry, item.entry) &&
        sameOrigin(response.entry, item.entry) &&
        compareInteger(creation.entry.position, dispatched.entry.position) < 0 &&
        compareInteger(dispatched.entry.position, response.entry.position) < 0,
      'model source origin/order mismatch',
    )
    const opened = entries.filter(
      other =>
        other.captured.record?.kind === 'model_call_opened' &&
        other.captured.record.call === value.call.callId &&
        compareInteger(other.captured.record.dispatch, value.dispatch) === 0,
    )
    const intents = entries.filter(
      other =>
        other.captured.record?.kind === 'model_call_interrupt_intent' &&
        other.captured.record.call === value.call.callId,
    )
    requireHistory(opened.length <= 1 && intents.length <= 1, 'duplicate model source anchors')
    const members = inspectSettlementMembers({
      ...prefix.scope,
      prefix,
      mode: 'read',
      target: { call: value.call.callId, dispatch: value.dispatch, response: value.id },
      anchors: {
        dispatched: dispatched.entry,
        opened: opened[0]?.entry ?? null,
        intent: intents[0]?.entry ?? null,
      },
      current: { messageId: message.id, disposition: 'persisted' },
    })
    requireHistory(
      'completeMembers' in members && members.completeMembers.message?.message?.id === message.id,
      'model settlement members are incomplete or conflicting',
    )
    requireHistory(
      key !== undefined && !replies.has(message.id),
      'model message has no unique durable key',
    )
    replies.set(message.id, {
      entry: item.entry,
      message,
      response: response.captured,
      created: creation.entry,
      dispatched: dispatched.entry,
    })
  }
  return { entries, byKey, replies }
}
