// Session observation on SSE for this stage: the hand-written closed read and write of the three
// observation messages (binding page「观察消息的手写读写」), the observation records of this
// instance, cancel, replacement, connection close as cancel, the end of a login's observations when
// the login is no longer valid, and the heartbeat through the one serial writer. This stage locates
// no Model target: after the confirmation the stream carries heartbeats and the `ended` frame only
// (docs/internals.md「本阶段的观察范围」).
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
import {
  createObservationRecords,
  type CancelState,
  type LoginCheck,
} from './observation-hub/records.ts'
import type { SseStream } from './observation-hub/sse.ts'
import { STATUS_BY_OUTCOME } from './status.ts'

export const VERSION = 'session-public/1'
export const OBSERVATION_OPERATIONS = ['observe-session', 'cancel-observation'] as const
export type ObservationOperation = (typeof OBSERVATION_OPERATIONS)[number]

const ROOT_KEYS = ['protocolVersion', 'messageId', 'operation', 'loginProof', 'body'] as const
const BODY_KEYS = ['tenant', 'session', 'observationId'] as const
const SESSION_TEXT = /^[0-9a-f]{64}$/
/** The page size of the eligibility read at establishment; a fixed value (docs/internals.md「已知固定值」). */
const ELIGIBILITY_PAGE_BYTES = 4096

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
// The records themselves live in the observation hub (`observation-hub/records.ts`). This is the
// session location's adapter: its key carries the session, its `ended` frame is the session
// protocol's `observation-frame`, and its diagnostics stay `observation.ended` and
// `observation.cleanup-failed` (#1249 spec 已定 2).

export type { LoginCheck } from './observation-hub/records.ts'

/** A slot held for one observation between the capacity decision and the opened stream. */
export interface ObservationClaim {
  /** Hands the opened stream to the claim. An end that arrived meanwhile is written now. */
  attach(stream: SseStream): void
}

export interface ObservationRegistry {
  /**
   * Takes the slot for a new observation, or answers `undefined` when `loginText` or this
   * instance is at capacity. The one `key` would replace does not count and is ended on success.
   * The decision and the count change happen in the same synchronous step, so two requests that
   * passed their Session read together cannot both be admitted over the bound.
   */
  claim(
    input: Readonly<{
      key: string
      loginText: string
      messageId: string
      observationId: string
      /** Checks the observation's login again; it runs once per round while the stream is open. */
      checkLogin: () => Promise<LoginCheck>
    }>,
  ): ObservationClaim | undefined
  /** Ends an active observation, or answers from the retained record. */
  cancel(key: string): CancelState
  /** Ends every active observation of one login with `reason`. */
  endLogin(loginText: string, reason: EndReason): void
  /**
   * Ends every active observation with `reason` and resolves when the streams attached so far
   * finished. A claim whose stream has not attached yet gets its frame at attach; the HTTP layer's
   * own in-flight count covers that response.
   */
  endAll(reason: EndReason): Promise<void>
}

export function observationKey(loginText: string, session: string, observationId: string): string {
  return `${loginText}\n${session}\n${observationId}`
}

export type ObservationRegistryInput = Readonly<{
  limits: ServerEntryConfig['observation']
  /** The length of one round: the wait between two login checks of one observation. */
  loginCheckIntervalMs: number
  diagnostics: DiagnosticSink | undefined
}>

export function createObservationRegistry(input: ObservationRegistryInput): ObservationRegistry {
  const { diagnostics } = input
  const records = createObservationRecords<'refresh-exhausted'>({
    limits: input.limits,
    loginCheckIntervalMs: input.loginCheckIntervalMs,
    report: event =>
      emit(diagnostics, {
        code: event.kind === 'ended' ? 'observation.ended' : 'observation.cleanup-failed',
        operation: event.reason,
      }),
  })
  return {
    claim(claim) {
      // The only frame on this location is the `ended` one, so its `seq` is one past none.
      let seq = 0
      const taken = records.claim({
        key: claim.key,
        loginKey: claim.loginText,
        checkLogin: claim.checkLogin,
        endFrame: reason => {
          seq += 1
          return endedFrameText(claim.messageId, claim.observationId, seq, reason)
        },
      })
      return taken === undefined ? undefined : { attach: stream => taken.attach(stream) }
    },
    cancel: key => records.cancel(key, 'observer-cancelled'),
    endLogin: (loginText, reason) => records.endLogin(loginText, reason),
    endAll: reason => records.endAll(reason),
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
      pageBytes: Math.min(context.config.maxPageBytes, ELIGIBILITY_PAGE_BYTES),
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
  const eligible = await eligibleToRead(context, principal, request)
  if (eligible !== 'succeeded') return refuse(eligible)
  // The slot is taken here, with no await between the decision and the count. The HTTP layer
  // attaches the opened stream right after it queues the confirmation.
  const claim = context.registry.claim({
    key,
    loginText: caller.loginText,
    messageId,
    observationId,
    // The login check of every round (public contract「来源与对外表示」: a refusal is
    // `ended(denied)`, an unjudgeable login `ended(unavailable)`). Revocation, the idle deadline and
    // the maximum deadline all show here as `denied`.
    checkLogin: async () => {
      const again = await context.steps.recognize(request.proof)
      if (!isRefusal(again)) return again.loginText === caller.loginText ? 'valid' : 'denied'
      return again.outcome === 'denied' ? 'denied' : 'unavailable'
    },
  })
  if (claim === undefined) return refuse('basis-unavailable')
  return sseAnswer(confirmationText(messageId, 'succeeded', observationId), 'succeeded', stream => {
    claim.attach(stream)
    // The establishment succeeded: a successful business access of this login (identity ID-18).
    // It starts after the stream is attached and its close is watched; nothing waits for it.
    void context.steps.reportBusinessAccess(caller)
  })
}
