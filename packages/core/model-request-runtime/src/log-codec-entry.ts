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
import { checkAppendInput, type LogEntry, type OwnedLogEntry } from '@omne-harness-lite/session-log'
import {
  encodeModelLogKey,
  identity,
  invalidValue,
  modelLogJsonEqual,
  object,
  positiveInteger,
  type ModelLogInvalidValue,
  type ModelLogKey,
} from './log-codec-key.ts'
import { capturedFormat, createValueCodec, type CapturedModelLogValue } from './log-codec-value.ts'

import { currentCodecDomain, type ModelLogCodecDomain } from './log-codec-domain.ts'
import { encodeModelLogEnvelope, readModelLogEnvelope } from './log-envelope.ts'

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
export interface InspectModelLogEntryInput {
  readonly session: string
  readonly tenant: TenantId
  readonly entry: unknown
  readonly purpose: ModelLogPurpose
  readonly messagePrefix: LogPrefixView | null
}
export interface InspectModelMessageEntryInput extends Omit<
  InspectModelLogEntryInput,
  'purpose' | 'messagePrefix'
> {
  readonly purpose:
    { readonly kind: 'message' } | Extract<ModelLogPurpose, { readonly kind: 'persistedMessage' }>
}
export interface InspectedModelLogEntry {
  readonly entry: LogEntry
  readonly captured: CapturedModelLogValue
}
type EntryKeys = {
  readonly dedupe?: ModelLogKey
  readonly read: readonly ModelLogKey[]
}
type CapturedRecord = NonNullable<CapturedModelLogValue['record']>

function creationKeys(
  record: Extract<CapturedRecord, { kind: 'model_call_created' | 'model_call_ended' }>,
  all: ModelLogKey,
  call: ModelLogKey,
): EntryKeys | ModelLogInvalidValue {
  const creationKey = record.creationKey
  if (creationKey === undefined) return invalidValue('value')
  const dedupe: ModelLogKey = { kind: 'creation', creationKey }
  return {
    dedupe,
    read: [
      dedupe,
      all,
      call,
      { kind: 'created', call: record.call },
      ...(record.kind === 'model_call_ended'
        ? [{ kind: 'ended' as const, call: record.call }]
        : []),
    ],
  }
}
function dispatchRecordKeys(
  record: Extract<CapturedRecord, { kind: 'model_call_dispatched' | 'model_call_opened' }>,
  all: ModelLogKey,
  call: ModelLogKey,
): EntryKeys {
  const dedupe: ModelLogKey = {
    kind: record.kind === 'model_call_dispatched' ? 'dispatched' : 'opened',
    call: record.call,
    dispatch: record.dispatch,
  }
  return {
    dedupe,
    read: [dedupe, all, call, { kind: 'dispatch', call: record.call, dispatch: record.dispatch }],
  }
}
function recordKeys(record: CapturedRecord, all: ModelLogKey): EntryKeys | ModelLogInvalidValue {
  if (record.kind === 'model_selection_changed') return { read: [all, { kind: 'selection' }] }
  const call: ModelLogKey = { kind: 'call', call: record.call }
  if (
    record.kind === 'model_call_created' ||
    (record.kind === 'model_call_ended' && record.creationKey !== undefined)
  )
    return creationKeys(record, all, call)
  if (record.kind === 'model_call_reply_ready') {
    const dedupe: ModelLogKey = { kind: 'ready', response: record.response }
    return {
      dedupe,
      read: [dedupe, all, call, { kind: 'dispatch', call: record.call, dispatch: record.dispatch }],
    }
  }
  if (record.kind === 'model_call_dispatched' || record.kind === 'model_call_opened')
    return dispatchRecordKeys(record, all, call)
  if (record.kind === 'model_call_acknowledged') {
    // MS8 S-58/RT12 S-96⑦: one ACK fact per CallKey, independent of ending and settlement.
    const dedupe: ModelLogKey = { kind: 'acknowledged', call: record.call }
    return { dedupe, read: [dedupe, all, call] }
  }
  const dedupe: ModelLogKey = {
    kind: record.kind === 'model_call_interrupt_intent' ? 'intent' : 'ended',
    call: record.call,
  }
  return { dedupe, read: [dedupe, all, call] }
}
function responseKeys(
  response: NonNullable<CapturedModelLogValue['response']>,
  all: ModelLogKey,
): EntryKeys {
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
function captureShell(input: ModelLogShell): ModelLogShell | ModelLogInvalidValue {
  const copied = copyJsonValue(input)
  if (
    'failed' in copied ||
    !object(copied.ok) ||
    Object.keys(copied.ok).some(key => !['tenant', 'run', 'attempt'].includes(key))
  )
    return invalidValue('shell')
  return shell(copied.ok)
}
function encodeEntryKeys(
  projected: EntryKeys,
  ownedShell: ModelLogShell,
): { readonly readKeys: string[]; readonly dedupeKey: string | undefined } | ModelLogInvalidValue {
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
  return { readKeys, dedupeKey }
}
function inspectEntryShell(
  value: JsonObject,
  input: Pick<InspectModelLogEntryInput, 'session' | 'tenant'>,
):
  | { readonly session: string; readonly ownedShell: ModelLogShell; readonly position: JsonNumber }
  | ModelLogInvalidValue {
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
  return { session, ownedShell, position: value.position }
}
function entryKeysMatch(
  value: JsonObject,
  prepared: OwnedLogEntry,
  readKeys: JsonValue | undefined,
): readKeys is readonly string[] {
  return !(
    value.dedupeKey !== prepared.dedupeKey ||
    !Array.isArray(readKeys) ||
    !readKeys.every(key => typeof key === 'string') ||
    readKeys.length !== prepared.readKeys.length ||
    new Set(readKeys).size !== readKeys.length ||
    !prepared.readKeys.every(key => readKeys.includes(key))
  )
}
export function createEntryCodec(domain: ModelLogCodecDomain) {
  const values = createValueCodec(domain)
  function keys(
    captured: CapturedModelLogValue,
    purpose: ModelLogPurpose,
  ): EntryKeys | ModelLogInvalidValue {
    const all: ModelLogKey = { kind: 'all' }
    const record = captured.record
    if (purpose.kind === 'record' && record !== null) return recordKeys(record, all)
    if (purpose.kind === 'response' && captured.response !== null)
      return responseKeys(captured.response, all)
    return messageKeys(captured, purpose, all)
  }
  function messageKeys(
    captured: CapturedModelLogValue,
    purpose: ModelLogPurpose,
    all: ModelLogKey,
  ): EntryKeys | ModelLogInvalidValue {
    const message = captured.message
    if (message === null || message.type === 'system') return invalidValue('purpose')
    const dedupe: ModelLogKey = { kind: 'message', message: message.id }
    const read: ModelLogKey[] = [dedupe, all, { kind: 'messages' }]
    if (purpose.kind === 'message')
      return message.type === 'assistant' ? invalidValue('purpose') : { dedupe, read }
    if (purpose.kind !== 'persistedMessage' || !values.owns(purpose.response, false))
      return invalidValue('purpose')
    const response = purpose.response.response
    return persistedMessageKeys(captured, message, response, dedupe, read)
  }
  function persistedMessageKeys(
    captured: CapturedModelLogValue,
    message: NonNullable<CapturedModelLogValue['message']>,
    response: CapturedModelLogValue['response'],
    dedupe: ModelLogKey,
    read: ModelLogKey[],
  ): EntryKeys | ModelLogInvalidValue {
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

  function prepareModelLogEntry(
    input: PrepareModelLogEntryInput,
  ): { readonly ok: OwnedLogEntry } | ModelLogInvalidValue {
    return prepareEntry(input, false)
  }
  function prepareEntry(
    input: PrepareModelLogEntryInput,
    historical: boolean,
    associationRequired = true,
  ): { readonly ok: OwnedLogEntry } | ModelLogInvalidValue {
    if (!identity(input.session) || !values.owns(input.captured, !historical))
      return invalidValue('identity')
    const ownedShell = captureShell(input.shell)
    if ('invalidValue' in ownedShell) return ownedShell
    if (
      input.purpose.kind === 'persistedMessage' &&
      !values.owns(input.purpose.response, !historical)
    )
      return invalidValue('purpose')
    const projected = keys(input.captured, input.purpose)
    if ('invalidValue' in projected) return projected
    const association = validateAssociation(input, associationRequired)
    if (association !== undefined) return association
    const encoded = encodeEntryKeys(projected, ownedShell)
    if ('invalidValue' in encoded) return encoded
    const payload = encodeModelLogEnvelope(
      capturedFormat(input.captured),
      input.captured.category,
      input.captured.value,
      input.captured.message,
    )
    return Object.freeze({
      ok: Object.freeze({
        ...ownedShell,
        ...(encoded.dedupeKey === undefined ? {} : { dedupeKey: encoded.dedupeKey }),
        readKeys: Object.freeze(encoded.readKeys),
        payload,
      }),
    })
  }
  function validateAssociation(
    input: PrepareModelLogEntryInput,
    required: boolean,
  ): ModelLogInvalidValue | undefined {
    if (input.captured.message === null || !required) return undefined
    if (input.messagePrefix === null) return invalidValue('message_prefix')
    return 'rejected' in judgeMessageInLog(input.captured.value, input.messagePrefix)
      ? invalidValue('message_in_log')
      : undefined
  }

  function captureWrapper(
    value: JsonValue,
    writable = false,
  ): { readonly ok: CapturedModelLogValue } | ModelLogInvalidValue {
    const decoded = readModelLogEnvelope(value)
    if ('failure' in decoded || decoded.kind !== 'model') return invalidValue('wrapper')
    const envelope = decoded.envelope
    if (
      !domain.readFormats.includes(envelope.format) ||
      (writable && envelope.format !== domain.writeFormat)
    )
      return invalidValue('wrapper')
    return values.captureValue(
      {
        category: envelope.category,
        input: { kind: 'value', value: envelope.value },
      },
      envelope.format,
      true,
    )
  }
  /** Checks this message's owned body, shell and keys only. The caller must validate history associations. */
  function inspectModelMessageEntry(
    input: InspectModelMessageEntryInput,
  ): { readonly ok: InspectedModelLogEntry } | ModelLogInvalidValue {
    if (input.purpose.kind !== 'message' && input.purpose.kind !== 'persistedMessage')
      return invalidValue('purpose')
    return inspectEntry({ ...input, messagePrefix: null }, false)
  }
  function inspectModelLogEntry(
    input: InspectModelLogEntryInput,
  ): { readonly ok: InspectedModelLogEntry } | ModelLogInvalidValue {
    return inspectEntry(input, true)
  }
  function inspectEntry(
    input: InspectModelLogEntryInput,
    associationRequired: boolean,
  ): { readonly ok: InspectedModelLogEntry } | ModelLogInvalidValue {
    const copied = copyJsonValue(input.entry)
    if ('failed' in copied || !object(copied.ok)) return invalidValue('not_json')
    const value = copied.ok
    const inspectedShell = inspectEntryShell(value, input)
    if ('invalidValue' in inspectedShell) return inspectedShell
    const { session, ownedShell, position } = inspectedShell
    if (value.payload === undefined) return invalidValue('wrapper')
    const captured = captureWrapper(value.payload)
    if ('invalidValue' in captured) return captured
    if (!messageInspectionAllowed(captured.ok, associationRequired)) return invalidValue('purpose')
    const prepared = prepareEntry(
      {
        session,
        shell: ownedShell,
        captured: captured.ok,
        purpose: input.purpose,
        messagePrefix: input.messagePrefix,
      },
      true,
      associationRequired,
    )
    if ('invalidValue' in prepared) return prepared
    const owned = inspectKeys(value, prepared.ok, session, captured.ok.message !== null)
    if ('invalidValue' in owned) return owned
    const parsedSession = parseSession(session)
    if (parsedSession === null) return invalidValue('identity')
    return Object.freeze({
      ok: Object.freeze({
        entry: Object.freeze({
          ...owned,
          session: parsedSession,
          position,
        }),
        captured: captured.ok,
      }),
    })
  }
  function inspectCapturedEntry(
    entry: LogEntry,
    captured: CapturedModelLogValue,
    purpose: ModelLogPurpose,
  ): { readonly ok: InspectedModelLogEntry } | ModelLogInvalidValue {
    if (!values.owns(captured, false)) return invalidValue('identity')
    const projected = keys(captured, purpose)
    if ('invalidValue' in projected) return projected
    const encoded = encodeEntryKeys(projected, entry)
    if ('invalidValue' in encoded) return encoded
    const claimed = [entry.dedupeKey, ...entry.readKeys].some(
      key => typeof key === 'string' && /^mrr(?:\/|$)/u.test(key),
    )
    if (captured.message === null || claimed) {
      if (
        entry.dedupeKey !== encoded.dedupeKey ||
        entry.readKeys.length !== encoded.readKeys.length ||
        !encoded.readKeys.every(key => entry.readKeys.includes(key))
      )
        return invalidValue('key_set')
    }
    return { ok: Object.freeze({ entry, captured }) }
  }
  function messageInspectionAllowed(
    value: CapturedModelLogValue,
    associationRequired: boolean,
  ): boolean {
    return associationRequired || value.message !== null
  }
  function inspectKeys(
    value: JsonObject,
    prepared: OwnedLogEntry,
    session: string,
    message: boolean,
  ): OwnedLogEntry | ModelLogInvalidValue {
    const readKeys = value.readKeys
    const keys = [value.dedupeKey, ...(Array.isArray(readKeys) ? readKeys : [])]
    const claimed = keys.some(key => typeof key === 'string' && /^mrr(?:\/|$)/u.test(key))
    if (!message || claimed) {
      if (!entryKeysMatch(value, prepared, readKeys)) return invalidValue('key_set')
      return Object.freeze({ ...prepared, readKeys: Object.freeze([...readKeys]) })
    }
    const { payload, tenant, run, attempt } = prepared
    const original = checkAppendInput(
      session,
      [
        {
          tenant,
          ...(run === undefined ? {} : { run, attempt }),
          ...(value.dedupeKey === undefined ? {} : { dedupeKey: value.dedupeKey }),
          readKeys,
          payload,
        },
      ],
      { kind: 'unfenced' },
      { kind: 'unconditional' },
    )
    if ('failure' in original || original.ok.entries[0] === undefined)
      return invalidValue('key_set')
    return original.ok.entries[0]
  }
  function parseSession(value: string): SessionRef | null {
    const parsed = parseOpaqueIdentifier(value, 'SessionRef')
    return 'ok' in parsed ? parsed.ok : null
  }

  return Object.freeze({
    prepareModelLogEntry,
    inspectCapturedEntry,
    inspectModelLogEntry,
    inspectModelMessageEntry,
    captureWrapper,
  })
}
export const {
  prepareModelLogEntry,
  inspectCapturedEntry,
  inspectModelLogEntry,
  inspectModelMessageEntry,
  captureWrapper,
} = createEntryCodec(currentCodecDomain)
