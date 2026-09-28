import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import {
  copyJsonValue,
  isNonNegativeJsonInteger,
  type JsonNumber,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { parseTenantId, tenantIdEquals, type TenantId } from '@omne-harness-lite/identity-values'
import type { LoggedMessage } from '@omne-harness-lite/messages'
import { validate as responseShape, type ReplyDisposition } from '@omne-harness-lite/model-response'
import type { LogEntry, OwnedLogEntry } from '@omne-harness-lite/session-log-jsonl'
import { compareRfc3339Instants } from '@omne-harness-lite/offer-expiry'
import {
  createEntryCodec,
  type InspectedModelLogEntry,
  type ModelLogPurpose,
  type ModelLogShell,
} from './log-codec-entry.ts'
import {
  decodeModelLogKey,
  identity,
  modelLogJsonEqual,
  object,
  positiveInteger,
} from './log-codec-key.ts'
import type { CapturedModelLogValue } from './log-codec-value.ts'

import {
  currentCodecDomain,
  legacyCodecDomain,
  type ModelLogCodecDomain,
} from './log-codec-domain.ts'

export interface ModelLogSettlementTarget {
  readonly call: string
  readonly dispatch: JsonNumber
  readonly response: string
}
export interface ModelLogSettlementAnchors {
  readonly dispatched: LogEntry
  readonly opened: LogEntry | null
  readonly intent: LogEntry | null
}
export interface ModelLogSettlementCurrent {
  /** The previously designated candidate identity, never a newly generated id. */
  readonly messageId: string | null
  readonly disposition: ReplyDisposition | null
}
interface CompletePrefixInput {
  readonly session: string
  readonly tenant: TenantId
  /**
   * One complete legal read, not readByKey fragments or reads from different tails.
   * Legal RFC3339 timing values and history are input-domain responsibilities;
   * the conditional comparator does not certify time sources or leap announcements.
   */
  readonly prefix: { readonly entries: readonly LogEntry[]; readonly tail: JsonNumber }
}
interface SettlementInputBase extends CompletePrefixInput {
  readonly target: ModelLogSettlementTarget
  readonly anchors: ModelLogSettlementAnchors
  readonly current: ModelLogSettlementCurrent | null
}
export type InspectSettlementMembersInput =
  | (SettlementInputBase & { readonly mode: 'read' })
  | (SettlementInputBase & {
      readonly mode: 'write'
      readonly candidates: readonly OwnedLogEntry[]
    })
export type SettlementMemberReason =
  | 'input'
  | 'prefix'
  | 'shell'
  | 'unknown_format'
  | 'entry'
  | 'duplicate_key'
  | 'anchor'
  | 'identity'
  | 'binding'
  | 'parameters'
  | 'opened'
  | 'intent'
  | 'timing'
  | 'message'
  | 'members'
  | 'candidate_identity'
  | 'message_occupied'
  | 'run_history_unavailable'
export type SettlementMembersResult =
  | { readonly absent: true }
  | { readonly inconsistent: true; readonly reason: SettlementMemberReason }
  | { readonly undetermined: true; readonly reason: SettlementMemberReason }
  | {
      readonly completeMembers: {
        readonly mode: 'read' | 'write'
        readonly response: CapturedModelLogValue
        readonly message: CapturedModelLogValue | null
        readonly entries: readonly (LogEntry | OwnedLogEntry)[]
        readonly disposition: 'same' | 'firstWinner' | 'unrequested'
      }
    }
function inconsistent(reason: SettlementMemberReason): SettlementMembersResult {
  return Object.freeze({ inconsistent: true, reason })
}
function undetermined(reason: SettlementMemberReason): SettlementMembersResult {
  return Object.freeze({ undetermined: true, reason })
}
function validDisposition(value: unknown): value is ReplyDisposition {
  return responseShape('ReplyDisposition', value).valid
}
function ownCurrent(
  raw: ModelLogSettlementCurrent | null,
): { readonly ok: ModelLogSettlementCurrent | null } | SettlementMembersResult {
  if (raw === null) return { ok: null }
  const copied = copyJsonValue(raw)
  if ('failed' in copied || !object(copied.ok)) return inconsistent('input')
  const value = copied.ok
  if (
    Object.keys(value).length !== 2 ||
    (value.messageId !== null && !identity(value.messageId)) ||
    (value.disposition !== null && !validDisposition(value.disposition))
  )
    return inconsistent('input')
  return { ok: Object.freeze({ messageId: value.messageId, disposition: value.disposition }) }
}
interface Member {
  readonly entry: LogEntry | OwnedLogEntry
  readonly captured: CapturedModelLogValue
}
function numberEqual(a: JsonNumber | undefined, b: JsonNumber | undefined): boolean {
  return modelLogJsonEqual(a, b)
}
function isLocated(entry: OwnedLogEntry): entry is LogEntry {
  return 'position' in entry && positiveInteger(entry.position)
}
function before(a: LogEntry, b: LogEntry): boolean {
  return ExactDecimal.from(a.position).compare(ExactDecimal.from(b.position)) < 0
}
function timingOrdered(
  timing: { readonly sentAt: string; readonly endedAt: string } & JsonObject,
): boolean {
  const first = timing.firstTokenAt
  const initial = compareRfc3339Instants(
    timing.sentAt,
    first === undefined ? timing.endedAt : first,
  )
  if (!('ok' in initial) || initial.ok > 0) return false
  if (first === undefined) return true
  const final = compareRfc3339Instants(first, timing.endedAt)
  return 'ok' in final && final.ok <= 0
}

function purpose(
  captured: CapturedModelLogValue,
  captures: readonly CapturedModelLogValue[],
): ModelLogPurpose | null {
  if (captured.category === 'record') return { kind: 'record' }
  if (captured.category === 'response') return { kind: 'response' }
  const message = captured.message
  if (message === null || message.type === 'system') return null
  if (message.type !== 'assistant') return { kind: 'message' }
  const responses = captures.filter(item => item.response?.id === message.response)
  const response = responses[0]
  return responses.length === 1 && response !== undefined
    ? { kind: 'persistedMessage', response }
    : null
}
/** Shared internal recognition: any legacy model key reserves this entry for the model codec. */
export function foreignReserved(value: {
  readonly dedupeKey?: unknown
  readonly readKeys?: unknown
}): boolean {
  return [value.dedupeKey, ...(Array.isArray(value.readKeys) ? value.readKeys : [])].some(
    key => typeof key === 'string' && key.startsWith('mrr/'),
  )
}
export function createSettlementCodec(domain: ModelLogCodecDomain) {
  const { captureWrapper, inspectModelLogEntry, prepareModelLogEntry } = createEntryCodec(domain)
  function fullPrefix(
    input: CompletePrefixInput,
  ): { readonly ok: readonly InspectedModelLogEntry[] } | SettlementMembersResult {
    if (
      !identity(input.session) ||
      !isNonNegativeJsonInteger(input.prefix.tail) ||
      ExactDecimal.from(input.prefix.tail).compare(
        ExactDecimal.from(input.prefix.entries.length),
      ) !== 0
    )
      return inconsistent('prefix')
    const capturedEntries: {
      readonly value: JsonObject
      readonly captured: CapturedModelLogValue
    }[] = []
    const captures: CapturedModelLogValue[] = []
    const dedupes = new Set<string>()
    for (const [index, entry] of input.prefix.entries.entries()) {
      const copied = copyJsonValue(entry)
      if ('failed' in copied || !object(copied.ok)) return undetermined('entry')
      const value = copied.ok
      const tenant = parseTenantId(value.tenant)
      if (
        value.session !== input.session ||
        !('ok' in tenant) ||
        !tenantIdEquals(tenant.ok, input.tenant) ||
        !positiveInteger(value.position) ||
        ExactDecimal.from(value.position).compare(ExactDecimal.from(index + 1)) !== 0
      )
        return inconsistent('shell')
      if (value.dedupeKey !== undefined) {
        if (!identity(value.dedupeKey) || dedupes.has(value.dedupeKey))
          return inconsistent('duplicate_key')
        dedupes.add(value.dedupeKey)
      }
      if (
        (value.run === undefined) !== (value.attempt === undefined) ||
        (value.run !== undefined && (!identity(value.run) || !positiveInteger(value.attempt))) ||
        !Array.isArray(value.readKeys) ||
        !value.readKeys.every(identity) ||
        new Set(value.readKeys).size !== value.readKeys.length
      )
        return inconsistent('shell')
      const payload = value.payload
      if (payload === undefined) return undetermined('entry')
      if (
        !object(payload) ||
        typeof payload.format !== 'string' ||
        !domain.readFormats.includes(payload.format)
      ) {
        if (
          foreignReserved(value) ||
          (object(payload) &&
            ((typeof payload.format === 'string' && payload.format.startsWith('mrr/')) ||
              payload.type !== undefined ||
              (typeof payload.kind === 'string' && payload.kind.startsWith('model_'))))
        )
          return undetermined('unknown_format')
        continue
      }
      const captured = captureWrapper(payload)
      if ('invalidValue' in captured) return undetermined('entry')
      capturedEntries.push({ value, captured: captured.ok })
      captures.push(captured.ok)
    }
    const messages: LoggedMessage[] = []
    const entries: InspectedModelLogEntry[] = []
    for (const { value, captured } of capturedEntries) {
      const usage = purpose(captured, captures)
      if (usage === null) return inconsistent('message')
      const inspected = inspectModelLogEntry({
        session: input.session,
        tenant: input.tenant,
        entry: value,
        purpose: usage,
        messagePrefix: messages,
      })
      if ('invalidValue' in inspected) return inconsistent('entry')
      entries.push(inspected.ok)
      if (captured.message !== null && captured.message.type !== 'system')
        messages.push(captured.message)
    }
    return { ok: entries }
  }
  function anchor(
    entries: readonly InspectedModelLogEntry[],
    raw: LogEntry | null,
  ): InspectedModelLogEntry | null {
    if (raw === null) return null
    const copied = copyJsonValue(raw)
    if ('failed' in copied || !object(copied.ok)) return null
    const value = copied.ok
    return (
      entries.find(
        item =>
          modelLogJsonEqual(item.entry.payload, value.payload) &&
          item.entry.session === value.session &&
          modelLogJsonEqual(item.entry.tenant, value.tenant) &&
          modelLogJsonEqual(item.entry.position, value.position) &&
          item.entry.dedupeKey === value.dedupeKey &&
          modelLogJsonEqual(item.entry.run, value.run) &&
          modelLogJsonEqual(item.entry.attempt, value.attempt),
      ) ?? null
    )
  }
  function appliedParameters(record: JsonObject): JsonValue | undefined {
    if (!object(record.parameters)) return undefined
    const sent: Record<string, JsonValue> = { ...record.parameters }
    const extra = object(record.parameters.extra) ? { ...record.parameters.extra } : null
    const adjustments = record.parameterAdjustments
    if (Array.isArray(adjustments))
      for (const adjustment of adjustments) {
        if (
          !object(adjustment) ||
          typeof adjustment.name !== 'string' ||
          adjustment.sent === undefined
        )
          return undefined
        if (Object.hasOwn(sent, adjustment.name) && adjustment.name !== 'extra')
          sent[adjustment.name] = adjustment.sent
        else if (extra !== null && Object.hasOwn(extra, adjustment.name))
          Object.defineProperty(extra, adjustment.name, {
            value: adjustment.sent,
            enumerable: true,
            configurable: true,
          })
        else return undefined
      }
    if (Array.isArray(record.droppedParameters))
      for (const name of record.droppedParameters) {
        if (typeof name !== 'string') return undefined
        if (Object.hasOwn(sent, name) && name !== 'extra') delete sent[name]
        else if (extra !== null && Object.hasOwn(extra, name)) delete extra[name]
        else return undefined
      }
    if (extra !== null) {
      if (Object.keys(extra).length === 0) delete sent.extra
      else sent.extra = extra
    }
    return sent
  }
  function association(
    input: InspectSettlementMembersInput,
    members: readonly Member[],
    all: readonly InspectedModelLogEntry[],
    dispatched: InspectedModelLogEntry,
    opened: InspectedModelLogEntry | null,
    intent: InspectedModelLogEntry | null,
  ): SettlementMembersResult {
    const responseMembers = members.filter(item => item.captured.response !== null)
    const responseMember = responseMembers[0]
    const response = responseMember?.captured.response
    if (
      responseMembers.length !== 1 ||
      responseMember === undefined ||
      response === null ||
      response === undefined
    )
      return inconsistent('members')
    const record = dispatched.captured.value
    if (
      !object(record) ||
      response.id !== input.target.response ||
      response.call.callId !== input.target.call ||
      !numberEqual(response.dispatch, input.target.dispatch) ||
      response.call.runId !== dispatched.entry.run ||
      !modelLogJsonEqual(response.attemptId, dispatched.entry.attempt) ||
      responseMember.entry.run !== dispatched.entry.run
    )
      return inconsistent('identity')
    if (isLocated(responseMember.entry) && !before(dispatched.entry, responseMember.entry))
      return inconsistent('anchor')
    for (const name of [
      'profile',
      'profileSnapshot',
      'adaptation',
      'selectedBy',
      'provider',
      'credentialScope',
    ])
      if (!modelLogJsonEqual(response.route[name], record[name])) return inconsistent('binding')
    const credential = response.route.credentialScope
    if (
      object(credential) &&
      credential.layer === 'tenant' &&
      !modelLogJsonEqual(credential.tenant, input.tenant)
    )
      return inconsistent('identity')
    const snapshot = response.route.profileSnapshot
    if (
      !object(snapshot) ||
      !Array.isArray(snapshot.providers) ||
      !snapshot.providers.includes(response.route.provider ?? null) ||
      ((numberEqual(response.dispatch, 1) || snapshot.allowFallback === false) &&
        snapshot.providers[0] !== response.route.provider)
    )
      return inconsistent('binding')
    if (
      !modelLogJsonEqual(response.route.parameterAdjustments, record.parameterAdjustments) ||
      !modelLogJsonEqual(response.route.droppedParameters, record.droppedParameters) ||
      !modelLogJsonEqual(response.route.parameters, appliedParameters(record))
    )
      return inconsistent('parameters')
    const firstToken = response.timing.firstTokenAt
    if (
      opened !== null &&
      (!before(dispatched.entry, opened.entry) ||
        opened.entry.run !== dispatched.entry.run ||
        !numberEqual(opened.entry.attempt, dispatched.entry.attempt))
    )
      return inconsistent('opened')
    if (
      opened === null
        ? firstToken !== undefined
        : !object(opened.captured.value) ||
          !modelLogJsonEqual(firstToken, opened.captured.value.firstTokenAt) ||
          (isLocated(responseMember.entry) && !before(opened.entry, responseMember.entry))
    )
      return inconsistent('opened')
    if (
      intent !== null &&
      response.outcome === 'interrupted' &&
      (!isLocated(responseMember.entry) || before(intent.entry, responseMember.entry))
    ) {
      if (!object(intent.captured.value) || response.initiator !== intent.captured.value.initiator)
        return inconsistent('intent')
    }
    if (
      object(response.failure) &&
      ['withdrawn', 'scope_disallowed', 'modality_mismatch'].includes(
        typeof response.failure.cause === 'string' ? response.failure.cause : '',
      )
    )
      return inconsistent('identity')
    const messageMembers = members.filter(item => item.captured.message !== null)
    const messageMember = messageMembers[0]
    const persisted = response.replyDisposition === 'persisted'
    if (object(response.reply) && response.reply.response !== response.id)
      return inconsistent('message')
    if (persisted) {
      if (
        members.length !== 2 ||
        messageMembers.length !== 1 ||
        messageMember === undefined ||
        members[0] !== messageMember ||
        members[1] !== responseMember ||
        !modelLogJsonEqual(messageMember.captured.value, response.reply) ||
        !modelLogJsonEqual(messageMember.entry.tenant, responseMember.entry.tenant) ||
        messageMember.entry.run !== responseMember.entry.run ||
        !numberEqual(messageMember.entry.attempt, responseMember.entry.attempt)
      )
        return inconsistent('message')
      if (
        isLocated(messageMember.entry) &&
        isLocated(responseMember.entry) &&
        ExactDecimal.from(messageMember.entry.position)
          .add(ExactDecimal.from(1))
          .compare(ExactDecimal.from(responseMember.entry.position)) !== 0
      )
        return inconsistent('members')
      const ownId = messageMember.captured.message?.id
      if (
        all.some(
          item =>
            item.captured.message?.id === ownId &&
            !numberEqual(
              item.entry.position,
              isLocated(messageMember.entry) ? messageMember.entry.position : undefined,
            ),
        )
      )
        return inconsistent('message_occupied')
    } else {
      if (members.length !== 1 || messageMembers.length !== 0) return inconsistent('members')
      const originalReply = response.reply
      if (object(originalReply) && all.some(item => item.captured.message?.id === originalReply.id))
        return inconsistent('message_occupied')
    }
    if (
      input.mode === 'write' &&
      (input.current === null ||
        (object(response.reply)
          ? response.reply.id !== input.current.messageId
          : input.current.messageId !== null) ||
        !modelLogJsonEqual(response.replyDisposition, input.current.disposition ?? undefined))
    )
      return inconsistent('candidate_identity')
    if (!timingOrdered(response.timing)) return inconsistent('timing')
    // The original G28 Run interpretation is intentionally not replaced by a boolean.
    if (response.call.runId !== undefined) return undetermined('run_history_unavailable')
    // This conclusion is conditional on the declared legal input domain, never a
    // physical batch, lawful-source, permission or leap-announcement certificate.
    return Object.freeze({
      completeMembers: Object.freeze({
        mode: input.mode,
        response: responseMember.captured,
        message: messageMember?.captured ?? null,
        entries: Object.freeze(members.map(member => member.entry)),
        disposition:
          input.current === null
            ? 'unrequested'
            : response.reply !== undefined &&
                modelLogJsonEqual(response.replyDisposition, input.current.disposition)
              ? 'same'
              : 'firstWinner',
      }),
    })
  }

  function inspectSettlementMembers(input: InspectSettlementMembersInput): SettlementMembersResult {
    const tenant = parseTenantId(input.tenant)
    const current = ownCurrent(input.current)
    if (!('ok' in tenant)) return inconsistent('input')
    if (!('ok' in current)) return current
    return inspectOwnedMembers({ ...input, current: current.ok })
  }
  function inspectOwnedMembers(input: InspectSettlementMembersInput): SettlementMembersResult {
    if (
      !identity(input.target.call) ||
      !identity(input.target.response) ||
      !positiveInteger(input.target.dispatch)
    )
      return inconsistent('prefix')
    const prefix = fullPrefix(input)
    if (!('ok' in prefix)) return prefix
    const all = prefix.ok
    const dispatched = anchor(all, input.anchors.dispatched)
    const opened = anchor(all, input.anchors.opened)
    const intent = anchor(all, input.anchors.intent)
    const record = dispatched?.captured.record
    if (
      dispatched === null ||
      record?.kind !== 'model_call_dispatched' ||
      record.call !== input.target.call ||
      !numberEqual(record.dispatch, input.target.dispatch) ||
      record.response !== input.target.response ||
      (input.anchors.opened !== null && opened === null) ||
      (input.anchors.intent !== null && intent === null)
    )
      return inconsistent('anchor')
    const actualOpened = all.filter(
      item =>
        item.captured.record?.kind === 'model_call_opened' &&
        item.captured.record.call === input.target.call &&
        numberEqual(item.captured.record.dispatch, input.target.dispatch),
    )
    const actualIntent = all.filter(
      item =>
        item.captured.record?.kind === 'model_call_interrupt_intent' &&
        item.captured.record.call === input.target.call,
    )
    if (
      actualOpened.length !== (opened === null ? 0 : 1) ||
      (opened !== null && actualOpened[0] !== opened) ||
      actualIntent.length !== (intent === null ? 0 : 1) ||
      (intent !== null && actualIntent[0] !== intent)
    )
      return inconsistent('anchor')
    const original = all.filter(item => {
      if (item.captured.response?.id === input.target.response) return true
      return item.entry.readKeys.some(key => {
        const decoded = decodeModelLogKey(key)
        return (
          'ok' in decoded &&
          decoded.ok.kind === 'settlement' &&
          decoded.ok.response === input.target.response
        )
      })
    })
    // An existing lawful batch is inspected against its own ids/values before any losing candidate.
    if (original.length !== 0)
      return association(
        input.mode === 'write' ? { ...input, mode: 'read' } : input,
        original,
        all,
        dispatched,
        opened,
        intent,
      )
    if (
      input.current?.messageId !== null &&
      input.current?.messageId !== undefined &&
      all.some(item => item.captured.message?.id === input.current?.messageId)
    )
      return inconsistent('message_occupied')
    if (input.mode === 'read') return Object.freeze({ absent: true })
    const capturedCandidates: {
      readonly entry: OwnedLogEntry
      readonly captured: CapturedModelLogValue
    }[] = []
    for (const entry of input.candidates) {
      const copied = copyJsonValue(entry)
      if (
        'failed' in copied ||
        !object(copied.ok) ||
        copied.ok.payload === undefined ||
        Object.keys(copied.ok).some(
          key => !['tenant', 'run', 'attempt', 'dedupeKey', 'readKeys', 'payload'].includes(key),
        )
      )
        return inconsistent('entry')
      const captured = captureWrapper(copied.ok.payload, true)
      if ('invalidValue' in captured) return undetermined('entry')
      capturedCandidates.push({ entry, captured: captured.ok })
    }
    const members: Member[] = []
    const messagePrefix: LoggedMessage[] = all.flatMap(item =>
      item.captured.message !== null && item.captured.message.type !== 'system'
        ? [item.captured.message]
        : [],
    )
    for (const { entry, captured } of capturedCandidates) {
      const usage = purpose(
        captured,
        capturedCandidates.map(item => item.captured),
      )
      if (usage === null || !tenantIdEquals(entry.tenant, input.tenant))
        return inconsistent('entry')
      const ownedShell: ModelLogShell = {
        tenant: entry.tenant,
        ...(entry.run === undefined ? {} : { run: entry.run }),
        ...(entry.attempt === undefined ? {} : { attempt: entry.attempt }),
      }
      const prepared = prepareModelLogEntry({
        session: input.session,
        shell: ownedShell,
        captured,
        purpose: usage,
        messagePrefix,
      })
      const copied = copyJsonValue(entry)
      if (
        'invalidValue' in prepared ||
        'failed' in copied ||
        !modelLogJsonEqual(copied.ok, copyEntry(prepared.ok))
      )
        return inconsistent('entry')
      members.push({ entry: prepared.ok, captured })
    }
    return association(input, members, all, dispatched, opened, intent)
  }
  function copyEntry(entry: OwnedLogEntry): JsonValue | undefined {
    const copied = copyJsonValue(entry)
    return 'ok' in copied ? copied.ok : undefined
  }

  return { inspectSettlementMembers, inspectCompletePrefix: fullPrefix }
}
export const { inspectSettlementMembers } = createSettlementCodec(legacyCodecDomain)
/** Same complete-prefix recognition used by v2 settlement, kept internal to this package. */
export const { inspectCompletePrefix: inspectCurrentModelLogPrefix } =
  createSettlementCodec(currentCodecDomain)
