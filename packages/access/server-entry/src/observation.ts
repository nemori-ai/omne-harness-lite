// Session observation on SSE for this stage: the hand-written closed read and write of the three
// observation messages (binding page「观察消息的手写读写」), the observation records of this
// instance, cancel, replacement, connection close as cancel, and the heartbeat through the one
// serial writer. This stage locates no Model target: after the confirmation the stream carries
// heartbeats and the `ended` frame only (docs/internals.md「本阶段的观察范围」).
import {
  readJsonText,
  writeJsonText,
  type JsonLimits,
  type JsonValue,
} from '@omne-harness/json-text'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import type { ProofInput } from '@omne-harness/public-contract'
import type { SessionId } from '@omne-harness/session-contract'
import type { Answer, JsonAnswer, SseAnswer } from './answers.ts'
import type { ServerEntryConfig } from './config.ts'
import { emit, type DiagnosticSink } from './diagnostics.ts'
import type { SessionIngressFaces } from './faces.ts'
import { isRefusal, type IdentitySteps } from './identity-steps.ts'
import { encoder, sessionProtocolRejected } from './session-codec.ts'
import type { SseStream } from './sse.ts'
import { STATUS_BY_OUTCOME } from './status.ts'

export const VERSION = 'session-public/1'
export const OBSERVATION_OPERATIONS = ['observe-session', 'cancel-observation'] as const
export type ObservationOperation = (typeof OBSERVATION_OPERATIONS)[number]

const ROOT_KEYS = ['protocolVersion', 'messageId', 'operation', 'loginProof', 'body'] as const
const BODY_KEYS = ['tenant', 'session', 'observationId'] as const
const SESSION_TEXT = /^[0-9a-f]{64}$/

export type ObservationRequest = Readonly<{
  operation: ObservationOperation
  messageId: string
  proof: ProofInput
  tenant: TenantId
  tenantText: string
  session: string
  observationId: string
}>

export type ObservationRead =
  | Readonly<{ kind: 'request'; request: ObservationRequest }>
  | Readonly<{ kind: 'rejected'; messageId?: string }>

type Entries = Readonly<Record<string, JsonValue>>

function entriesOf(value: JsonValue | undefined): Entries | undefined {
  if (value?.kind !== 'object') return undefined
  const result: Record<string, JsonValue> = Object.create(null)
  for (const entry of value.entries) result[entry.key] = entry.value
  return result
}

function textOf(value: JsonValue | undefined): string | undefined {
  return value?.kind === 'string' ? value.value : undefined
}

function keysWithin(entries: Entries, allowed: readonly string[]): boolean {
  return Object.keys(entries).every(key => allowed.includes(key))
}

/** The tenant text rule of the public contract: inner strict read, exactly two string members, then the codec. */
function readTenant(text: string, limits: JsonLimits): TenantId | undefined {
  if (!text.isWellFormed()) return undefined
  const inner = readJsonText(text, { ...limits, maxDepth: 1, maxItems: 3, maxMembers: 2 })
  if (inner.kind !== 'ok') return undefined
  const members = entriesOf(inner.value)
  if (
    members === undefined ||
    !keysWithin(members, ['organization', 'account']) ||
    textOf(members.organization) === undefined ||
    textOf(members.account) === undefined
  )
    return undefined
  const parsed = tenantCodec.parse(text)
  return parsed.ok ? parsed.value : undefined
}

/** Whether the strictly read root selects the hand-written read (binding page「会话路径的读取分派」). */
export function selectsObservation(root: JsonValue): ObservationOperation | undefined {
  const entries = entriesOf(root)
  if (entries === undefined || textOf(entries.protocolVersion) !== VERSION) return undefined
  const operation = textOf(entries.operation)
  return OBSERVATION_OPERATIONS.find(known => known === operation)
}

/** Reads one observation request by the closed rules. A rejection carries the messageId only when it is a string. */
export function readObservationRequest(
  root: JsonValue,
  operation: ObservationOperation,
  limits: JsonLimits,
): ObservationRead {
  const entries = entriesOf(root)
  if (entries === undefined) return { kind: 'rejected' }
  const messageId = textOf(entries.messageId)
  const rejected: ObservationRead =
    messageId === undefined ? { kind: 'rejected' } : { kind: 'rejected', messageId }
  if (messageId === undefined || !keysWithin(entries, ROOT_KEYS)) return rejected
  let proof: ProofInput
  if (!Object.hasOwn(entries, 'loginProof')) proof = { kind: 'missing' }
  else {
    const text = textOf(entries.loginProof)
    if (text === undefined) return rejected
    proof = text === '' ? { kind: 'empty' } : { kind: 'present', value: text }
  }
  const body = entriesOf(entries.body)
  if (
    body === undefined ||
    !keysWithin(body, BODY_KEYS) ||
    !BODY_KEYS.every(key => Object.hasOwn(body, key))
  )
    return rejected
  const tenantText = textOf(body.tenant)
  const tenant = tenantText === undefined ? undefined : readTenant(tenantText, limits)
  const session = textOf(body.session)
  const observationId = textOf(body.observationId)
  if (
    tenantText === undefined ||
    tenant === undefined ||
    session === undefined ||
    !SESSION_TEXT.test(session) ||
    observationId === undefined ||
    observationId === ''
  )
    return rejected
  return {
    kind: 'request',
    request: { operation, messageId, proof, tenant, tenantText, session, observationId },
  }
}

// --- hand-written encoding -------------------------------------------------------------------

function str(value: string): JsonValue {
  return { kind: 'string', value }
}

function obj(fields: readonly (readonly [string, JsonValue])[]): JsonValue {
  return { kind: 'object', entries: fields.map(([key, value]) => ({ key, value })) }
}

const EMPTY: JsonValue = { kind: 'object', entries: [] }

export type ObserveOutcome = 'succeeded' | 'denied' | 'basis-unavailable'

/** The `observe-session` confirmation: four keys, the body is `{ observationId }` on success. */
export function confirmationText(
  messageId: string,
  outcome: ObserveOutcome,
  observationId: string,
): string {
  return writeJsonText(
    obj([
      ['protocolVersion', str(VERSION)],
      ['messageId', str(messageId)],
      ['outcome', str(outcome)],
      ['body', outcome === 'succeeded' ? obj([['observationId', str(observationId)]]) : EMPTY],
    ]),
  )
}

export type CancelState = 'ended' | 'not-found'

/** The `cancel-observation` reply: the body is `{ observationId, state }` on success. */
export function cancelReplyText(
  messageId: string,
  outcome: ObserveOutcome,
  observationId: string,
  state: CancelState,
): string {
  return writeJsonText(
    obj([
      ['protocolVersion', str(VERSION)],
      ['messageId', str(messageId)],
      ['outcome', str(outcome)],
      [
        'body',
        outcome === 'succeeded'
          ? obj([
              ['observationId', str(observationId)],
              ['state', str(state)],
            ])
          : EMPTY,
      ],
    ]),
  )
}

export type EndReason =
  | 'observer-cancelled'
  | 'observer-replaced'
  | 'refresh-exhausted'
  | 'denied'
  | 'unavailable'
  | 'capacity'

/** An `observation-frame` message carrying an `ended` frame. */
export function endedFrameText(
  messageId: string,
  observationId: string,
  seq: number,
  reason: EndReason,
): string {
  return writeJsonText(
    obj([
      ['protocolVersion', str(VERSION)],
      ['messageId', str(messageId)],
      ['operation', str('observation-frame')],
      [
        'body',
        obj([
          ['observationId', str(observationId)],
          ['seq', str(String(seq))],
          [
            'frame',
            obj([
              ['kind', str('ended')],
              ['reason', str(reason)],
            ]),
          ],
        ]),
      ],
    ]),
  )
}

// --- the observation records of this instance ------------------------------------------------

type Active = {
  readonly key: string
  readonly loginText: string
  readonly messageId: string
  readonly observationId: string
  readonly stream: SseStream
  seq: number
  ended: boolean
}

export interface ObservationRegistry {
  /** Whether a new observation under `loginText` fits, not counting the one `key` would replace. */
  hasCapacity(loginText: string, key: string): boolean
  /** Registers an observation on an opened stream, replacing the one with the same key. */
  establish(
    input: Readonly<{
      key: string
      loginText: string
      messageId: string
      observationId: string
      stream: SseStream
    }>,
  ): void
  /** Ends an active observation, or answers from the retained record. */
  cancel(key: string): CancelState
  /** Ends every active observation with `reason` and resolves when their streams finished. */
  endAll(reason: EndReason): Promise<void>
}

export function observationKey(loginText: string, session: string, observationId: string): string {
  return `${loginText}\n${session}\n${observationId}`
}

export function createObservationRegistry(
  limits: ServerEntryConfig['observation'],
  diagnostics: DiagnosticSink | undefined,
): ObservationRegistry {
  const active = new Map<string, Active>()
  const perLogin = new Map<string, number>()
  const retained = new Map<string, NodeJS.Timeout>()

  const count = (loginText: string, delta: number): void => {
    const next = (perLogin.get(loginText) ?? 0) + delta
    if (next <= 0) perLogin.delete(loginText)
    else perLogin.set(loginText, next)
  }

  const retain = (key: string): void => {
    const existing = retained.get(key)
    if (existing !== undefined) clearTimeout(existing)
    if (limits.cancelRetentionMs === 0) return
    const timer = setTimeout(() => retained.delete(key), limits.cancelRetentionMs)
    timer.unref()
    retained.set(key, timer)
  }

  /** Removes the observation from the active set. The stream itself is ended by the caller. */
  const forget = (observation: Active): void => {
    if (observation.ended) return
    observation.ended = true
    if (active.get(observation.key) === observation) active.delete(observation.key)
    count(observation.loginText, -1)
    retain(observation.key)
  }

  const end = (observation: Active, reason: EndReason): void => {
    if (observation.ended) return
    forget(observation)
    try {
      if (!observation.stream.closed) {
        observation.seq += 1
        observation.stream.event(
          endedFrameText(observation.messageId, observation.observationId, observation.seq, reason),
        )
        observation.stream.end()
      }
      emit(diagnostics, { code: 'observation.ended', operation: reason })
    } catch {
      emit(diagnostics, { code: 'observation.cleanup-failed', operation: reason })
    }
  }

  return {
    hasCapacity(loginText, key) {
      const replacing = active.get(key) !== undefined
      const mine = (perLogin.get(loginText) ?? 0) - (replacing ? 1 : 0)
      const total = active.size - (replacing ? 1 : 0)
      return mine < limits.perLogin && total < limits.perInstance
    },
    establish(input) {
      const previous = active.get(input.key)
      if (previous !== undefined) end(previous, 'observer-replaced')
      const observation: Active = { ...input, seq: 0, ended: false }
      active.set(input.key, observation)
      count(input.loginText, 1)
      input.stream.onClose(() => {
        // The connection closed before an end: that is the cancel; no frame can be written.
        forget(observation)
      })
    },
    cancel(key) {
      const observation = active.get(key)
      if (observation !== undefined) {
        end(observation, 'observer-cancelled')
        return 'ended'
      }
      return retained.has(key) ? 'ended' : 'not-found'
    },
    async endAll(reason) {
      const streams: Promise<void>[] = []
      // `end` removes from `active`, so the list is taken first.
      const current = Array.from(active.values())
      for (const observation of current) {
        streams.push(observation.stream.finished)
        end(observation, reason)
      }
      await Promise.all(streams)
    },
  }
}

// --- the two operations ---------------------------------------------------------------------

export type ObservationContext = Readonly<{
  config: ServerEntryConfig
  faces: SessionIngressFaces<ActingForTenantPrincipal>
  steps: IdentitySteps
  registry: ObservationRegistry
  diagnostics: DiagnosticSink | undefined
}>

function jsonAnswer(text: string, outcome: ObserveOutcome): JsonAnswer {
  return { kind: 'json', status: STATUS_BY_OUTCOME[outcome], bytes: encoder.encode(text) }
}

function sseAnswer(
  first: string,
  outcome: ObserveOutcome,
  attach?: SseAnswer['attach'],
): SseAnswer {
  return {
    kind: 'sse',
    status: STATUS_BY_OUTCOME[outcome],
    first,
    ...(attach === undefined ? {} : { attach }),
  }
}

/** The `protocol-rejected` of the hand-written read: SSE for `observe-session`, JSON otherwise. */
export function observationRejected(
  operation: ObservationOperation,
  messageId: string | undefined,
): Answer {
  const rejected = sessionProtocolRejected(messageId)
  if (operation !== 'observe-session') return rejected
  return { kind: 'sse', status: rejected.status, first: new TextDecoder().decode(rejected.bytes) }
}

async function eligibleToRead(
  context: ObservationContext,
  principal: ActingForTenantPrincipal,
  request: ObservationRequest,
): Promise<ObserveOutcome> {
  try {
    const page = await context.faces.history.begin({
      principal,
      tenant: request.tenant,
      session: request.session as SessionId,
      kinds: context.config.historyKinds,
      from: null,
      direction: 'backward',
      pageBytes: Math.min(context.config.maxPageBytes, 4096),
    })
    if ('ok' in page) return 'succeeded'
    return page.failure.kind === 'denied' ? 'denied' : 'basis-unavailable'
  } catch {
    emit(context.diagnostics, { code: 'session.read-fault', operation: 'observe-session' })
    return 'basis-unavailable'
  }
}

/** Handles a hand-read observation request from step 2 on. */
export async function handleObservation(
  request: ObservationRequest,
  context: ObservationContext,
): Promise<Answer> {
  const { messageId, observationId } = request
  const refuse = (outcome: Exclude<ObserveOutcome, 'succeeded'>): Answer =>
    request.operation === 'observe-session'
      ? sseAnswer(confirmationText(messageId, outcome, observationId), outcome)
      : jsonAnswer(cancelReplyText(messageId, outcome, observationId, 'not-found'), outcome)

  const caller = await context.steps.recognize(request.proof)
  if (isRefusal(caller)) return refuse(caller.outcome)
  const principal = await context.steps.actingFor(caller, request.tenant)
  if (isRefusal(principal)) return refuse(principal.outcome)

  const key = observationKey(caller.loginText, request.session, observationId)
  if (request.operation === 'cancel-observation') {
    const state = context.registry.cancel(key)
    return jsonAnswer(cancelReplyText(messageId, 'succeeded', observationId, state), 'succeeded')
  }
  if (!context.registry.hasCapacity(caller.loginText, key)) return refuse('basis-unavailable')
  const eligible = await eligibleToRead(context, principal, request)
  if (eligible !== 'succeeded') return refuse(eligible)
  return sseAnswer(confirmationText(messageId, 'succeeded', observationId), 'succeeded', stream =>
    context.registry.establish({
      key,
      loginText: caller.loginText,
      messageId,
      observationId,
      stream,
    }),
  )
}
