import type { ModelHistorySelector } from './model-log-history.ts'
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
import type { SourceToken, LogEntry, OwnedLogEntry } from '@omne-harness-lite/session-log'
import { compareRfc3339Instants } from '@omne-harness-lite/offer-expiry'
import {
  createEntryCodec,
  type InspectedModelLogEntry,
  type ModelLogPurpose,
  type ModelLogShell,
} from './log-codec-entry.ts'
import {
  decodeModelLogKey,
  encodeModelLogKey,
  identity,
  modelLogJsonEqual,
  object,
  positiveInteger,
} from './log-codec-key.ts'
import type { CapturedModelLogValue } from './log-codec-value.ts'

import { readModelLogEnvelope } from './log-envelope.ts'
import { currentCodecDomain, type ModelLogCodecDomain } from './log-codec-domain.ts'

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
export interface CompletePrefixInput {
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
/** Pure, read-only checks against one owned complete prefix. No authority or resource lease. */
export interface ModelLogReadInspector {
  readonly entries: readonly InspectedModelLogEntry[]
  select(selector: ModelHistorySelector): readonly InspectedModelLogEntry[]
  inspectSettlementMembers(
    input: Pick<SettlementInputBase, 'target' | 'anchors' | 'current'>,
  ): SettlementMembersResult
}
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
function validSettlementTarget(target: ModelLogSettlementTarget): boolean {
  return identity(target.call) && identity(target.response) && positiveInteger(target.dispatch)
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
  timing: { readonly sentAt: string | null; readonly endedAt: string } & JsonObject,
): boolean {
  const first = timing.firstTokenAt
  if (timing.sentAt !== null) {
    const initial = compareRfc3339Instants(
      timing.sentAt,
      first === undefined ? timing.endedAt : first,
    )
    if (!('ok' in initial) || initial.ok > 0) return false
  }
  if (first === undefined) return true
  const final = compareRfc3339Instants(first, timing.endedAt)
  return 'ok' in final && final.ok <= 0
}

/** Rebuild the fixed adapted plan from the durable dispatched record. */
export function reconstructAdaptedParameters(record: unknown): JsonValue | undefined {
  const copied = copyJsonValue(record)
  if ('failed' in copied || !object(copied.ok)) return undefined
  const owned = copied.ok
  const parameters = owned.parameters
  if (!object(parameters)) return undefined
  const sent: Record<string, JsonValue> = { ...parameters }
  const extra = object(parameters.extra) ? { ...parameters.extra } : null
  const adjustments = owned.parameterAdjustments
  if (!applyParameterAdjustments(adjustments, sent, extra)) return undefined
  if (!dropParameters(owned.droppedParameters, sent, extra)) return undefined
  if (extra !== null) {
    if (Object.keys(extra).length === 0) delete sent.extra
    else sent.extra = extra
  }
  return sent
}

function applyParameterAdjustment(
  adjustment: JsonValue,
  sent: Record<string, JsonValue>,
  extra: Record<string, JsonValue> | null,
): boolean {
  if (!object(adjustment) || typeof adjustment.name !== 'string' || adjustment.sent === undefined)
    return false
  if (Object.hasOwn(sent, adjustment.name) && adjustment.name !== 'extra')
    sent[adjustment.name] = adjustment.sent
  else if (extra !== null && Object.hasOwn(extra, adjustment.name))
    extra[adjustment.name] = adjustment.sent
  else return false
  return true
}
function applyParameterAdjustments(
  adjustments: JsonValue | undefined,
  sent: Record<string, JsonValue>,
  extra: Record<string, JsonValue> | null,
): boolean {
  if (Array.isArray(adjustments))
    for (const adjustment of adjustments)
      if (!applyParameterAdjustment(adjustment, sent, extra)) return false
  return true
}
function dropParameters(
  dropped: JsonValue | undefined,
  sent: Record<string, JsonValue>,
  extra: Record<string, JsonValue> | null,
): boolean {
  if (Array.isArray(dropped))
    for (const name of dropped) {
      if (typeof name !== 'string') return false
      if (Object.hasOwn(sent, name) && name !== 'extra') delete sent[name]
      else if (extra !== null && Object.hasOwn(extra, name)) delete extra[name]
      else return false
    }
  return true
}

function responseIndex(captures: readonly CapturedModelLogValue[]) {
  const indexed = new Map<string, CapturedModelLogValue | false>()
  for (const captured of captures) {
    const id = captured.response?.id
    if (id !== undefined) indexed.set(id, indexed.has(id) ? false : captured)
  }
  return indexed
}
function purpose(
  captured: CapturedModelLogValue,
  responses: ReadonlyMap<string, CapturedModelLogValue | false>,
): ModelLogPurpose | null {
  if (captured.category === 'record') return { kind: 'record' }
  if (captured.category === 'response') return { kind: 'response' }
  const message = captured.message
  if (message === null || message.type === 'system') return null
  if (message.type !== 'assistant') return { kind: 'message' }
  const response = responses.get(message.response)
  return response !== undefined && response !== false
    ? { kind: 'persistedMessage', response }
    : null
}
/** Any model-domain key, including an unsupported generation, reserves this entry. */
export function foreignReserved(value: {
  readonly dedupeKey?: unknown
  readonly readKeys?: unknown
}): boolean {
  return [value.dedupeKey, ...(Array.isArray(value.readKeys) ? value.readKeys : [])].some(
    key => typeof key === 'string' && /^mrr(?:\/|$)/u.test(key),
  )
}
function prefixLocationMatches(
  value: JsonObject,
  input: CompletePrefixInput,
  index: number,
  tenant: ReturnType<typeof parseTenantId>,
): boolean {
  return !(
    value.session !== input.session ||
    !('ok' in tenant) ||
    !tenantIdEquals(tenant.ok, input.tenant) ||
    !positiveInteger(value.position) ||
    ExactDecimal.from(value.position).compare(ExactDecimal.from(index + 1)) !== 0
  )
}
function claimPrefixKey(value: JsonObject, dedupes: Set<string>): boolean {
  if (value.dedupeKey !== undefined) {
    if (!identity(value.dedupeKey) || dedupes.has(value.dedupeKey)) return false
    dedupes.add(value.dedupeKey)
  }
  return true
}
function prefixRunKeysValid(value: JsonObject): boolean {
  return !(
    (value.run === undefined) !== (value.attempt === undefined) ||
    (value.run !== undefined && (!identity(value.run) || !positiveInteger(value.attempt))) ||
    !Array.isArray(value.readKeys) ||
    !value.readKeys.every(identity) ||
    new Set(value.readKeys).size !== value.readKeys.length
  )
}

type ResponseFacts = {
  readonly member: Member
  readonly response: NonNullable<CapturedModelLogValue['response']>
}
function settlementResponse(members: readonly Member[]): ResponseFacts | undefined {
  const responseMembers = members.filter(item => item.captured.response !== null)
  const responseMember = responseMembers[0]
  const response = responseMember?.captured.response
  if (
    responseMembers.length !== 1 ||
    responseMember === undefined ||
    response === null ||
    response === undefined
  )
    return undefined
  return { member: responseMember, response }
}
function responseIdentityMatches(
  input: InspectSettlementMembersInput,
  facts: ResponseFacts,
  dispatched: InspectedModelLogEntry,
  record: JsonValue,
): record is JsonObject {
  const { member: responseMember, response } = facts
  return !(
    !object(record) ||
    response.id !== input.target.response ||
    response.call.callId !== input.target.call ||
    !numberEqual(response.dispatch, input.target.dispatch) ||
    response.call.runId !== dispatched.entry.run ||
    !modelLogJsonEqual(response.attemptId, dispatched.entry.attempt) ||
    responseMember.entry.run !== dispatched.entry.run
  )
}
function providerSnapshotMatches(response: ResponseFacts['response']): boolean {
  const snapshot = response.route.profileSnapshot
  return !(
    !object(snapshot) ||
    !Array.isArray(snapshot.providers) ||
    !snapshot.providers.includes(response.route.provider ?? null) ||
    ((numberEqual(response.dispatch, 1) || snapshot.allowFallback === false) &&
      snapshot.providers[0] !== response.route.provider)
  )
}
function routeAssociationReason(
  input: InspectSettlementMembersInput,
  response: ResponseFacts['response'],
  record: JsonObject,
): SettlementMemberReason | undefined {
  for (const name of [
    'profile',
    'profileSnapshot',
    'adaptation',
    'selectedBy',
    'provider',
    'credentialScope',
  ])
    if (!modelLogJsonEqual(response.route[name], record[name])) return 'binding'
  const credential = response.route.credentialScope
  if (
    object(credential) &&
    credential.layer === 'tenant' &&
    !modelLogJsonEqual(credential.tenant, input.tenant)
  )
    return 'identity'
  if (!providerSnapshotMatches(response)) return 'binding'
  if (
    !modelLogJsonEqual(response.route.parameterAdjustments, record.parameterAdjustments) ||
    !modelLogJsonEqual(response.route.droppedParameters, record.droppedParameters) ||
    !modelLogJsonEqual(response.route.parameters, reconstructAdaptedParameters(record))
  )
    return 'parameters'

  return undefined
}
function openedAnchorMatches(
  dispatched: InspectedModelLogEntry,
  opened: InspectedModelLogEntry | null,
): boolean {
  return !(
    opened !== null &&
    (!before(dispatched.entry, opened.entry) ||
      opened.entry.run !== dispatched.entry.run ||
      !numberEqual(opened.entry.attempt, dispatched.entry.attempt))
  )
}
function openedResponseMatches(
  opened: InspectedModelLogEntry | null,
  responseMember: Member,
  firstToken: JsonValue | undefined,
): boolean {
  return !(opened === null
    ? firstToken !== undefined
    : !object(opened.captured.value) ||
      !modelLogJsonEqual(firstToken, opened.captured.value.firstTokenAt) ||
      (isLocated(responseMember.entry) && !before(opened.entry, responseMember.entry)))
}
function intentMatches(intent: InspectedModelLogEntry | null, facts: ResponseFacts): boolean {
  const { member: responseMember, response } = facts
  if (
    intent !== null &&
    response.outcome === 'interrupted' &&
    (!isLocated(responseMember.entry) || before(intent.entry, responseMember.entry))
  )
    return object(intent.captured.value) && response.initiator === intent.captured.value.initiator
  return true
}
function responseAnchorsReason(
  facts: ResponseFacts,
  dispatched: InspectedModelLogEntry,
  opened: InspectedModelLogEntry | null,
  intent: InspectedModelLogEntry | null,
): SettlementMemberReason | undefined {
  const { member: responseMember, response } = facts
  const firstToken = response.timing.firstTokenAt
  if (!openedAnchorMatches(dispatched, opened)) return 'opened'
  if (!openedResponseMatches(opened, responseMember, firstToken)) return 'opened'
  if (!intentMatches(intent, facts)) return 'intent'
  if (
    object(response.failure) &&
    ['withdrawn', 'scope_disallowed', 'modality_mismatch'].includes(
      typeof response.failure.cause === 'string' ? response.failure.cause : '',
    )
  )
    return 'identity'
  return undefined
}
function responseAssociationReason(
  input: InspectSettlementMembersInput,
  facts: ResponseFacts,
  dispatched: InspectedModelLogEntry,
  opened: InspectedModelLogEntry | null,
  intent: InspectedModelLogEntry | null,
): SettlementMemberReason | undefined {
  const record = dispatched.captured.value
  if (!responseIdentityMatches(input, facts, dispatched, record)) return 'identity'
  if (isLocated(facts.member.entry) && !before(dispatched.entry, facts.member.entry))
    return 'anchor'
  const routeFailure = routeAssociationReason(input, facts.response, record)
  if (routeFailure !== undefined) return routeFailure
  return responseAnchorsReason(facts, dispatched, opened, intent)
}
function persistedShapeMatches(
  members: readonly Member[],
  facts: ResponseFacts,
  messageMembers: readonly Member[],
  messageMember: Member | undefined,
): messageMember is Member {
  const { member: responseMember, response } = facts
  return !(
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
}
function persistedMessageReason(
  members: readonly Member[],
  all: readonly InspectedModelLogEntry[],
  facts: ResponseFacts,
  messageMembers: readonly Member[],
  messageMember: Member | undefined,
): SettlementMemberReason | undefined {
  if (!persistedShapeMatches(members, facts, messageMembers, messageMember)) return 'message'
  const responseMember = facts.member
  if (
    isLocated(messageMember.entry) &&
    isLocated(responseMember.entry) &&
    ExactDecimal.from(messageMember.entry.position)
      .add(ExactDecimal.from(1))
      .compare(ExactDecimal.from(responseMember.entry.position)) !== 0
  )
    return 'members'
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
    return 'message_occupied'
  return undefined
}
function messageAssociationReason(
  members: readonly Member[],
  all: readonly InspectedModelLogEntry[],
  facts: ResponseFacts,
  messageMembers: readonly Member[],
  messageMember: Member | undefined,
): SettlementMemberReason | undefined {
  const response = facts.response
  const persisted = response.replyDisposition === 'persisted'
  if (object(response.reply) && response.reply.response !== response.id) return 'message'
  if (persisted) return persistedMessageReason(members, all, facts, messageMembers, messageMember)
  if (members.length !== 1 || messageMembers.length !== 0) return 'members'
  const originalReply = response.reply
  if (object(originalReply) && all.some(item => item.captured.message?.id === originalReply.id))
    return 'message_occupied'
  return undefined
}
function candidateIdentityMatches(
  input: InspectSettlementMembersInput,
  response: ResponseFacts['response'],
): boolean {
  return !(
    input.mode === 'write' &&
    (input.current === null ||
      (object(response.reply)
        ? response.reply.id !== input.current.messageId
        : input.current.messageId !== null) ||
      !modelLogJsonEqual(response.replyDisposition, input.current.disposition ?? undefined))
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
    const captured = capturePrefixEntries(input)
    if (!('ok' in captured)) return captured
    const { capturedEntries, captures } = captured.ok
    const responses = responseIndex(captures)
    const messages: LoggedMessage[] = []
    const entries: InspectedModelLogEntry[] = []
    for (const { value, captured } of capturedEntries) {
      const usage = purpose(captured, responses)
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
  function capturePrefixEntries(input: CompletePrefixInput):
    | {
        readonly ok: {
          readonly capturedEntries: readonly {
            readonly value: JsonObject
            readonly captured: CapturedModelLogValue
          }[]
          readonly captures: readonly CapturedModelLogValue[]
        }
      }
    | SettlementMembersResult {
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
      if (!prefixLocationMatches(value, input, index, tenant)) return inconsistent('shell')
      if (!claimPrefixKey(value, dedupes)) return inconsistent('duplicate_key')
      if (!prefixRunKeysValid(value)) return inconsistent('shell')
      const captured = capturePrefixPayload(value)
      if (!('ok' in captured)) return captured
      if (captured.ok === null) continue
      capturedEntries.push({ value, captured: captured.ok })
      captures.push(captured.ok)
    }
    return { ok: { capturedEntries, captures } }
  }
  function capturePrefixPayload(
    value: JsonObject,
  ): { readonly ok: CapturedModelLogValue | null } | SettlementMembersResult {
    const payload = value.payload
    if (payload === undefined) return undetermined('entry')
    const decoded = readModelLogEnvelope(payload)
    if ('failure' in decoded) return undetermined('entry')
    if (decoded.kind === 'other') {
      return foreignReserved(value) ? undetermined('unknown_format') : { ok: null }
    }
    if (!domain.readFormats.includes(decoded.envelope.format)) return undetermined('unknown_format')
    const captured = captureWrapper(payload)
    return 'invalidValue' in captured ? undetermined('entry') : captured
  }
  function anchorValueMatches(entry: LogEntry, value: JsonObject): boolean {
    return (
      modelLogJsonEqual(entry.payload, value.payload) &&
      entry.session === value.session &&
      modelLogJsonEqual(entry.tenant, value.tenant) &&
      modelLogJsonEqual(entry.position, value.position) &&
      entry.dedupeKey === value.dedupeKey &&
      modelLogJsonEqual(entry.run, value.run) &&
      modelLogJsonEqual(entry.attempt, value.attempt)
    )
  }
  function anchor(
    entries: readonly InspectedModelLogEntry[],
    raw: LogEntry | null,
  ): InspectedModelLogEntry | null {
    if (raw === null) return null
    const owned = entries.find(item => item.entry === raw)
    if (owned !== undefined) return owned
    const copied = copyJsonValue(raw)
    if ('failed' in copied || !object(copied.ok)) return null
    const value = copied.ok
    return entries.find(item => anchorValueMatches(item.entry, value)) ?? null
  }
  function association(
    input: InspectSettlementMembersInput,
    members: readonly Member[],
    all: readonly InspectedModelLogEntry[],
    dispatched: InspectedModelLogEntry,
    opened: InspectedModelLogEntry | null,
    intent: InspectedModelLogEntry | null,
  ): SettlementMembersResult {
    const facts = settlementResponse(members)
    if (facts === undefined) return inconsistent('members')
    const { member: responseMember, response } = facts
    const responseFailure = responseAssociationReason(input, facts, dispatched, opened, intent)
    if (responseFailure !== undefined) return inconsistent(responseFailure)
    const messageMembers = members.filter(item => item.captured.message !== null)
    const messageMember = messageMembers[0]
    const messageFailure = messageAssociationReason(
      members,
      all,
      facts,
      messageMembers,
      messageMember,
    )
    if (messageFailure !== undefined) return inconsistent(messageFailure)
    if (!candidateIdentityMatches(input, response)) return inconsistent('candidate_identity')
    if (!timingOrdered(response.timing)) return inconsistent('timing')
    // A durable original batch is recognized from its original values. G28 is needed
    // only when a new batch is constructed, not to recompute an already committed late fact.
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
  function originalAnchorsMatch(
    input: InspectSettlementMembersInput,
    dispatched: InspectedModelLogEntry | null,
    opened: InspectedModelLogEntry | null,
    intent: InspectedModelLogEntry | null,
  ): dispatched is InspectedModelLogEntry {
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
      return false
    return true
  }

  function exactAnchor(
    actual: readonly InspectedModelLogEntry[],
    expected: InspectedModelLogEntry | null,
  ): boolean {
    return !(
      actual.length !== (expected === null ? 0 : 1) ||
      (expected !== null && actual[0] !== expected)
    )
  }

  function actualAnchorsMatch(
    input: InspectSettlementMembersInput,
    all: readonly InspectedModelLogEntry[],
    opened: InspectedModelLogEntry | null,
    intent: InspectedModelLogEntry | null,
  ): boolean {
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
    if (!exactAnchor(actualOpened, opened) || !exactAnchor(actualIntent, intent)) return false
    return true
  }

  function ownedAnchors(
    input: InspectSettlementMembersInput,
    all: readonly InspectedModelLogEntry[],
  ) {
    const dispatched = anchor(all, input.anchors.dispatched)
    const opened = anchor(all, input.anchors.opened)
    const intent = anchor(all, input.anchors.intent)
    if (!originalAnchorsMatch(input, dispatched, opened, intent)) return undefined
    if (!actualAnchorsMatch(input, all, opened, intent)) return undefined
    return { dispatched, opened, intent }
  }

  function originalMembers(
    input: InspectSettlementMembersInput,
    all: readonly InspectedModelLogEntry[],
  ) {
    return all.filter(item => {
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
  }

  function currentMessageOccupied(
    input: InspectSettlementMembersInput,
    all: readonly InspectedModelLogEntry[],
  ): boolean {
    return (
      input.current?.messageId !== null &&
      input.current?.messageId !== undefined &&
      all.some(item => item.captured.message?.id === input.current?.messageId)
    )
  }

  function captureCandidates(
    input: Extract<InspectSettlementMembersInput, { mode: 'write' }>,
  ): { ok: Member[] } | SettlementMembersResult {
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
    return { ok: capturedCandidates }
  }

  function prepareCandidate(
    input: InspectSettlementMembersInput,
    entry: OwnedLogEntry,
    captured: CapturedModelLogValue,
    messagePrefix: readonly LoggedMessage[],
    responses: ReadonlyMap<string, CapturedModelLogValue | false>,
  ): OwnedLogEntry | undefined {
    const usage = purpose(captured, responses)
    if (usage === null || !tenantIdEquals(entry.tenant, input.tenant)) return undefined
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
      return undefined
    return prepared.ok
  }

  function prepareCandidates(
    input: InspectSettlementMembersInput,
    all: readonly InspectedModelLogEntry[],
    capturedCandidates: readonly Member[],
  ): Member[] | undefined {
    const members: Member[] = []
    const responses = responseIndex(capturedCandidates.map(item => item.captured))
    const messagePrefix: LoggedMessage[] = all.flatMap(item =>
      item.captured.message !== null && item.captured.message.type !== 'system'
        ? [item.captured.message]
        : [],
    )
    for (const { entry, captured } of capturedCandidates) {
      const prepared = prepareCandidate(input, entry, captured, messagePrefix, responses)
      if (prepared === undefined) return undefined
      members.push({ entry: prepared, captured })
    }
    return members
  }

  function inspectOwnedMembers(input: InspectSettlementMembersInput): SettlementMembersResult {
    if (!validSettlementTarget(input.target)) return inconsistent('prefix')
    const prefix = fullPrefix(input)
    if (!('ok' in prefix)) return prefix
    return inspectFromPrefix(input, prefix.ok)
  }

  function inspectFromPrefix(
    input: InspectSettlementMembersInput,
    all: readonly InspectedModelLogEntry[],
  ): SettlementMembersResult {
    if (!validSettlementTarget(input.target)) return inconsistent('prefix')
    const anchors = ownedAnchors(input, all)
    if (anchors === undefined) return inconsistent('anchor')
    const { dispatched, opened, intent } = anchors
    const original = originalMembers(input, all)
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
    if (currentMessageOccupied(input, all)) return inconsistent('message_occupied')
    if (input.mode === 'read') return Object.freeze({ absent: true })
    const candidates = captureCandidates(input)
    if (!('ok' in candidates)) return candidates
    const members = prepareCandidates(input, all, candidates.ok)
    if (members === undefined) return inconsistent('entry')
    return association(input, members, all, dispatched, opened, intent)
  }

  function dispatchedResponseMatches(item: InspectedModelLogEntry, id: string): boolean {
    return (
      item.captured.record?.kind === 'model_call_dispatched' && item.captured.record.response === id
    )
  }
  function selectedPrefixEntry(
    item: InspectedModelLogEntry,
    selector: ModelHistorySelector,
  ): boolean {
    switch (selector.kind) {
      case 'call':
        return modelLogCallIdentityMatches(item, selector.call)
      case 'all':
        return true
      case 'position':
        return numberEqual(item.entry.position, selector.position)
      case 'dedupe':
        return item.entry.dedupeKey === selector.key
      case 'readKey':
        return item.entry.readKeys.includes(selector.key)
      case 'message':
        return item.captured.message?.id === selector.id
      case 'response':
        return item.captured.response?.id === selector.id
      case 'dispatchResponse':
        return dispatchedResponseMatches(item, selector.id)
    }
  }
  function createReadInspector(
    supplied: CompletePrefixInput,
  ): { readonly ok: ModelLogReadInspector } | SettlementMembersResult {
    const copied = copyJsonValue(supplied)
    if (
      'failed' in copied ||
      !object(copied.ok) ||
      !object(copied.ok.prefix) ||
      !Array.isArray(copied.ok.prefix.entries)
    )
      return inconsistent('input')
    const input = copied.ok as unknown as CompletePrefixInput
    const tenant = parseTenantId(input.tenant)
    if (!('ok' in tenant)) return inconsistent('input')
    const prefix = fullPrefix(input)
    if (!('ok' in prefix)) return prefix
    const entries = Object.freeze(prefix.ok)
    return Object.freeze({
      ok: Object.freeze<ModelLogReadInspector>({
        entries,
        select(selector) {
          return entries.filter(item => selectedPrefixEntry(item, selector))
        },
        inspectSettlementMembers(value) {
          const current = ownCurrent(value.current)
          if (!('ok' in current)) return current
          return inspectFromPrefix(
            {
              ...input,
              tenant: tenant.ok,
              mode: 'read',
              target: value.target,
              anchors: value.anchors,
              current: current.ok,
            },
            entries,
          )
        },
      }),
    })
  }
  function createIndexedReadInspector(
    source: SourceToken,
    select: ModelLogReadInspector['select'],
  ): ModelLogReadInspector {
    return Object.freeze({
      get entries() {
        return select({ kind: 'all' })
      },
      select,
      inspectSettlementMembers(value: Pick<SettlementInputBase, 'target' | 'anchors' | 'current'>) {
        const current = ownCurrent(value.current)
        if (!('ok' in current)) return current
        const positions = new Map<string, InspectedModelLogEntry>()
        const include = (items: readonly InspectedModelLogEntry[]) => {
          for (const item of items)
            positions.set(ExactDecimal.from(item.entry.position).toCanonicalString(), item)
        }
        const call = encodeModelLogKey({ kind: 'call', call: value.target.call })
        const settlement = encodeModelLogKey({
          kind: 'settlement',
          response: value.target.response,
        })
        if ('ok' in call) include(select({ kind: 'readKey', key: call.ok }))
        if ('ok' in settlement) include(select({ kind: 'readKey', key: settlement.ok }))
        const responses = select({ kind: 'response', id: value.target.response })
        include(responses)
        for (const item of responses) {
          const reply = item.captured.response?.reply
          if (object(reply) && typeof reply.id === 'string')
            include(select({ kind: 'message', id: reply.id }))
        }
        if (current.ok?.messageId !== null && current.ok?.messageId !== undefined)
          include(select({ kind: 'message', id: current.ok.messageId }))
        const entries = [...positions.values()].sort((a, b) =>
          ExactDecimal.from(a.entry.position).compare(ExactDecimal.from(b.entry.position)),
        )
        return inspectFromPrefix(
          {
            session: source.session,
            tenant: source.tenant,
            prefix: { entries: [], tail: source.tail },
            mode: 'read',
            ...value,
            current: current.ok,
          },
          entries,
        )
      },
    })
  }
  function copyEntry(entry: OwnedLogEntry): JsonValue | undefined {
    const copied = copyJsonValue(entry)
    return 'ok' in copied ? copied.ok : undefined
  }

  return {
    inspectSettlementMembers,
    inspectCompletePrefix: fullPrefix,
    createReadInspector,
    createIndexedReadInspector,
  }
}
export const {
  inspectSettlementMembers,
  inspectCompletePrefix: inspectCurrentModelLogPrefix,
  createReadInspector: createModelLogReadInspector,
  createIndexedReadInspector: createIndexedModelLogReadInspector,
} = createSettlementCodec(currentCodecDomain)

export function modelLogCallIdentityMatches(item: InspectedModelLogEntry, call: string): boolean {
  return (
    (item.captured.record !== null &&
      'call' in item.captured.record &&
      item.captured.record.call === call) ||
    item.captured.response?.call.callId === call
  )
}
