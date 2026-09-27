import {
  copyJsonValue,
  type JsonNumber,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import {
  parseOpaqueIdentifier,
  parseTenantId,
  tenantIdEquals,
  type TenantId,
} from '@omne-harness-lite/identity-values'
import { judgeMessageInLog, type LogPrefixView, type SessionRef } from '@omne-harness-lite/messages'
import type { LogEntry, OwnedLogEntry } from '@omne-harness-lite/session-log-jsonl'
import {
  encodeModelLogKey,
  identity,
  invalidValue,
  modelLogFormat,
  modelLogJsonEqual,
  object,
  positiveInteger,
  type ModelLogInvalidValue,
  type ModelLogKey,
} from './log-codec-key.ts'
import {
  captureModelLogValue,
  ownedCapture,
  type CapturedModelLogValue,
} from './log-codec-value.ts'

export interface ModelLogShell {
  readonly tenant: TenantId
  readonly run?: string
  readonly attempt?: JsonNumber
}
export type ModelLogPurpose =
  | { readonly kind: 'record' | 'response' | 'message' }
  | { readonly kind: 'persistedMessage'; readonly response: CapturedModelLogValue }
export interface PrepareModelLogEntryInput {
  readonly session: string
  readonly shell: ModelLogShell
  readonly captured: CapturedModelLogValue
  readonly purpose: ModelLogPurpose
  /** A legal complete message prefix at this position; null explicitly means unavailable. */
  readonly messagePrefix: LogPrefixView | null
}

function shell(value: JsonObject): ModelLogShell | ModelLogInvalidValue {
  const tenant = parseTenantId(value.tenant)
  if (!('ok' in tenant) || (value.run === undefined) !== (value.attempt === undefined))
    return invalidValue('shell')
  if (value.run !== undefined && (!identity(value.run) || !positiveInteger(value.attempt)))
    return invalidValue('shell')
  if (value.run === undefined) return Object.freeze({ tenant: tenant.ok })
  if (!positiveInteger(value.attempt)) return invalidValue('shell')
  return Object.freeze({ tenant: tenant.ok, run: value.run, attempt: value.attempt })
}
function keys(
  captured: CapturedModelLogValue,
  purpose: ModelLogPurpose,
): { readonly dedupe?: ModelLogKey; readonly read: readonly ModelLogKey[] } | ModelLogInvalidValue {
  const all: ModelLogKey = { kind: 'all' }
  const record = captured.record
  if (purpose.kind === 'record' && record !== null) {
    if (record.kind === 'model_selection_changed') return { read: [all, { kind: 'selection' }] }
    const call: ModelLogKey = { kind: 'call', call: record.call }
    if (record.kind === 'model_call_dispatched' || record.kind === 'model_call_opened') {
      const dedupe: ModelLogKey = {
        kind: record.kind === 'model_call_dispatched' ? 'dispatched' : 'opened',
        call: record.call,
        dispatch: record.dispatch,
      }
      return {
        dedupe,
        read: [
          dedupe,
          all,
          call,
          { kind: 'dispatch', call: record.call, dispatch: record.dispatch },
        ],
      }
    }
    const dedupe: ModelLogKey = {
      kind: record.kind === 'model_call_interrupt_intent' ? 'intent' : 'ended',
      call: record.call,
    }
    return { dedupe, read: [dedupe, all, call] }
  }
  if (purpose.kind === 'response' && captured.response !== null) {
    const response = captured.response
    const dedupe: ModelLogKey = { kind: 'response', response: response.id }
    return {
      dedupe,
      read: [
        dedupe,
        all,
        { kind: 'call', call: response.call.callId },
        { kind: 'dispatch', call: response.call.callId, dispatch: response.dispatch },
        { kind: 'settlement', response: response.id },
      ],
    }
  }
  const message = captured.message
  if (message === null || message.type === 'system') return invalidValue('purpose')
  const dedupe: ModelLogKey = { kind: 'message', message: message.id }
  const read: ModelLogKey[] = [dedupe, all, { kind: 'messages' }]
  if (purpose.kind === 'message')
    return message.type === 'assistant' ? invalidValue('purpose') : { dedupe, read }
  if (purpose.kind !== 'persistedMessage' || !ownedCapture(purpose.response))
    return invalidValue('purpose')
  const response = purpose.response.response
  if (
    message.type !== 'assistant' ||
    response === null ||
    response.replyDisposition !== 'persisted' ||
    !object(response.reply) ||
    response.reply.id !== message.id ||
    response.id !== message.response
  )
    return invalidValue('purpose')
  // Equality is checked here as well as in the batch inspector; no independently mutable reply copy.
  if (!modelLogJsonEqual(response.reply, captured.value)) return invalidValue('value')
  read.push(
    { kind: 'call', call: response.call.callId },
    { kind: 'dispatch', call: response.call.callId, dispatch: response.dispatch },
    { kind: 'settlement', response: response.id },
  )
  return { dedupe, read }
}

export function prepareModelLogEntry(
  input: PrepareModelLogEntryInput,
): { readonly ok: OwnedLogEntry } | ModelLogInvalidValue {
  if (!identity(input.session) || !ownedCapture(input.captured)) return invalidValue('identity')
  const copied = copyJsonValue(input.shell)
  if (
    'failed' in copied ||
    !object(copied.ok) ||
    Object.keys(copied.ok).some(key => !['tenant', 'run', 'attempt'].includes(key))
  )
    return invalidValue('shell')
  const ownedShell = shell(copied.ok)
  if ('invalidValue' in ownedShell) return ownedShell
  const projected = keys(input.captured, input.purpose)
  if ('invalidValue' in projected) return projected
  if (input.captured.message !== null) {
    if (input.messagePrefix === null) return invalidValue('message_prefix')
    const judged = judgeMessageInLog(input.captured.value, input.messagePrefix)
    if ('rejected' in judged) return invalidValue('message_in_log')
  }
  const read = [...projected.read]
  if (ownedShell.run !== undefined) read.push({ kind: 'run', run: ownedShell.run })
  const readKeys: string[] = []
  for (const key of read) {
    const encoded = encodeModelLogKey(key)
    if ('invalidValue' in encoded) return encoded
    readKeys.push(encoded.ok)
  }
  let dedupeKey: string | undefined
  if (projected.dedupe !== undefined) {
    const encoded = encodeModelLogKey(projected.dedupe)
    if ('invalidValue' in encoded) return encoded
    dedupeKey = encoded.ok
  }
  const payload: JsonValue = Object.freeze({
    format: modelLogFormat,
    category: input.captured.category,
    value: input.captured.value,
  })
  return Object.freeze({
    ok: Object.freeze({
      ...ownedShell,
      ...(dedupeKey === undefined ? {} : { dedupeKey }),
      readKeys: Object.freeze(readKeys),
      payload,
    }),
  })
}

export interface InspectModelLogEntryInput {
  readonly session: string
  readonly tenant: TenantId
  readonly entry: unknown
  readonly purpose: ModelLogPurpose
  readonly messagePrefix: LogPrefixView | null
}
export interface InspectedModelLogEntry {
  readonly entry: LogEntry
  readonly captured: CapturedModelLogValue
}
export function captureWrapper(
  value: JsonValue,
): { readonly ok: CapturedModelLogValue } | ModelLogInvalidValue {
  if (
    !object(value) ||
    Object.keys(value).length !== 3 ||
    value.format !== modelLogFormat ||
    (value.category !== 'record' &&
      value.category !== 'message' &&
      value.category !== 'response') ||
    value.value === undefined
  )
    return invalidValue('wrapper')
  return captureModelLogValue({
    category: value.category,
    input: { kind: 'value', value: value.value },
  })
}
export function inspectModelLogEntry(
  input: InspectModelLogEntryInput,
): { readonly ok: InspectedModelLogEntry } | ModelLogInvalidValue {
  const copied = copyJsonValue(input.entry)
  if ('failed' in copied || !object(copied.ok)) return invalidValue('not_json')
  const value = copied.ok
  if (
    Object.keys(value).some(
      key =>
        ![
          'session',
          'position',
          'tenant',
          'run',
          'attempt',
          'dedupeKey',
          'readKeys',
          'payload',
        ].includes(key),
    )
  )
    return invalidValue('shell')
  const session = input.session
  if (!identity(session) || value.session !== session) return invalidValue('identity')
  if (!positiveInteger(value.position)) return invalidValue('position')
  const ownedShell = shell(value)
  if ('invalidValue' in ownedShell || !tenantIdEquals(ownedShell.tenant, input.tenant))
    return invalidValue('shell')
  if (value.payload === undefined) return invalidValue('wrapper')
  const captured = captureWrapper(value.payload)
  if ('invalidValue' in captured) return captured
  const prepared = prepareModelLogEntry({
    session,
    shell: ownedShell,
    captured: captured.ok,
    purpose: input.purpose,
    messagePrefix: input.messagePrefix,
  })
  if ('invalidValue' in prepared) return prepared
  const readKeys = value.readKeys
  if (
    value.dedupeKey !== prepared.ok.dedupeKey ||
    !Array.isArray(readKeys) ||
    !readKeys.every(key => typeof key === 'string') ||
    readKeys.length !== prepared.ok.readKeys.length ||
    new Set(readKeys).size !== readKeys.length ||
    !prepared.ok.readKeys.every(key => readKeys.includes(key))
  )
    return invalidValue('key_set')
  const parsedSession = parseSession(session)
  if (parsedSession === null) return invalidValue('identity')
  return Object.freeze({
    ok: Object.freeze({
      entry: Object.freeze({
        ...prepared.ok,
        readKeys: Object.freeze([...readKeys]),
        session: parsedSession,
        position: value.position,
      }),
      captured: captured.ok,
    }),
  })
}
function parseSession(value: string): SessionRef | null {
  const parsed = parseOpaqueIdentifier(value, 'SessionRef')
  return 'ok' in parsed ? parsed.ok : null
}
