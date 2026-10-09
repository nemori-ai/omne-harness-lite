import type { AssistantMessage } from '@omne-harness-lite/messages'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import type { JsonNumber } from '@omne-harness-lite/content-blocks'
import {
  createModelLogReadInspector,
  type CapturedModelLogValue,
  type InspectedModelLogEntry,
  type ModelLogReadInspector,
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

function dispatchKey(call: string, dispatch: JsonNumber): string {
  return JSON.stringify([call, ExactDecimal.from(dispatch).toCanonicalString()])
}
function indexEntries(entries: readonly InspectedModelLogEntry[]) {
  const response = new Map<string, InspectedModelLogEntry[]>(),
    created = new Map<string, InspectedModelLogEntry[]>(),
    dispatched = new Map<string, InspectedModelLogEntry[]>(),
    opened = new Map<string, InspectedModelLogEntry[]>(),
    intent = new Map<string, InspectedModelLogEntry[]>()
  const records = {
    model_call_created: created,
    model_call_dispatched: dispatched,
    model_call_opened: opened,
    model_call_interrupt_intent: intent,
  }
  function add(
    map: Map<string, InspectedModelLogEntry[]>,
    key: string,
    entry: InspectedModelLogEntry,
  ) {
    const group = map.get(key)
    if (group) group.push(entry)
    else map.set(key, [entry])
  }
  for (const entry of entries) {
    const value = entry.captured.response
    if (value) add(response, value.id, entry)
    const record = entry.captured.record
    if (
      !record ||
      (record.kind !== 'model_call_created' &&
        record.kind !== 'model_call_dispatched' &&
        record.kind !== 'model_call_opened' &&
        record.kind !== 'model_call_interrupt_intent')
    )
      continue
    const map = records[record.kind as keyof typeof records]
    const key = 'dispatch' in record ? dispatchKey(record.call, record.dispatch) : record.call
    add(map, key, entry)
  }
  return { response, created, dispatched, opened, intent }
}

function originalResponse(indexed: ReturnType<typeof indexEntries>, message: AssistantMessage) {
  const responses = indexed.response.get(message.response) ?? []
  const response = responses[0]
  requireHistory(
    responses.length === 1 && response?.captured.response !== null && response !== undefined,
    'assistant has no unique response',
  )
  const value = response.captured.response
  requireHistory(value !== null, 'response capture missing')
  return { entry: response.entry, captured: response.captured, value }
}

function originalSourceOrdered(
  creation: LogEntry,
  dispatched: LogEntry,
  response: LogEntry,
  message: LogEntry,
): boolean {
  return (
    sameOrigin(creation, message) &&
    sameOrigin(dispatched, message) &&
    sameOrigin(response, message) &&
    compareInteger(creation.position, dispatched.position) < 0 &&
    compareInteger(dispatched.position, response.position) < 0
  )
}

function replySource(
  indexed: ReturnType<typeof indexEntries>,
  response: ReturnType<typeof originalResponse>,
  message: LogEntry,
) {
  const value = response.value,
    created = indexed.created.get(value.call.callId) ?? [],
    selectedDispatch = dispatchKey(value.call.callId, value.dispatch),
    dispatches = indexed.dispatched.get(selectedDispatch) ?? []
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
    originalSourceOrdered(creation.entry, dispatched.entry, response.entry, message),
    'model source origin/order mismatch',
  )
  const opened = indexed.opened.get(selectedDispatch) ?? [],
    intents = indexed.intent.get(value.call.callId) ?? []
  requireHistory(opened.length <= 1 && intents.length <= 1, 'duplicate model source anchors')
  return {
    creation: creation.entry,
    anchors: {
      dispatched: dispatched.entry,
      opened: opened[0]?.entry ?? null,
      intent: intents[0]?.entry ?? null,
    },
  }
}

function modelReply(
  inspector: ModelLogReadInspector,
  indexed: ReturnType<typeof indexEntries>,
  entry: LogEntry,
  message: AssistantMessage,
): DriverModelReply {
  const response = originalResponse(indexed, message),
    source = replySource(indexed, response, entry),
    value = response.value
  const members = inspector.inspectSettlementMembers({
    target: { call: value.call.callId, dispatch: value.dispatch, response: value.id },
    anchors: source.anchors,
    current: { messageId: message.id, disposition: 'persisted' },
  })
  requireHistory(
    'completeMembers' in members && members.completeMembers.message?.message?.id === message.id,
    'model settlement members are incomplete or conflicting',
  )
  return {
    entry,
    message,
    response: response.captured,
    created: source.creation,
    dispatched: source.anchors.dispatched,
  }
}

/** Reuse the model owner's codecs; an AssistantMessage by itself is never model provenance. */
export function readDriverModelHistory(prefix: CheckedPrefix): DriverModelHistory {
  const inspected = createModelLogReadInspector({ ...prefix.scope, prefix })
  requireHistory('ok' in inspected, 'uninterpretable model prefix')
  const entries = inspected.ok.entries
  const indexed = indexEntries(entries)
  const byKey = new Map<string, InspectedModelLogEntry>()
  const replies = new Map<string, DriverModelReply>()
  for (const item of entries) {
    const key = item.entry.dedupeKey
    if (key !== undefined) byKey.set(key, item)
    if (item.captured.message?.type !== 'assistant') continue
    const message = item.captured.message
    const reply = modelReply(inspected.ok, indexed, item.entry, message)
    requireHistory(
      key !== undefined && !replies.has(message.id),
      'model message has no unique durable key',
    )
    replies.set(message.id, reply)
  }
  return { entries, byKey, replies }
}
