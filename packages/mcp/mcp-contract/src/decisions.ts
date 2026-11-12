// The decision layer of SPEC T8, once for every transport: the conclusion of the T8 row for one
// classification (`classifyWireEvent` puts a wire event into its answer class), what one answer
// to `server/discover` means for the modern path, and the vocabulary every transport settles a
// request with (`WireAnswer`). The readings of a settled answer are in `answer-readings.ts`, what
// a transport writes in `composition.ts`, the rules by connection in `connection.ts`, the
// orchestration of `discover` in `discovery.ts`, and the authorization discovery in
// `authorization.ts`. A transport keeps only its wire and its in-flight table.
import type { JsonValue } from '@omne-harness/json-text'
import type { RequestMethod } from './composition.ts'
import { isObject, member, type JsonObject } from './json.ts'
import type {
  AnswerMalformed,
  AuthorizationDiscovery,
  NoAnswerCause,
  UnusableCause,
} from './outcomes.ts'
import { errorAnswerOf, peerIdentityOf, readDiscoverResult, type IdentityBound } from './readers.ts'
import type { TransportFailure, TransportMaterial } from './transport.ts'
import type { PeerIdentity } from './values.ts'
import {
  ERROR_CLASSES,
  HTTP_STATUS_CLASSES,
  classifyWireEvent,
  envelopeOf,
  supportedOf,
  type AnswerClass,
  type BodyClass,
  type ErrorClass,
  type HttpStatusClass,
  type RequestClass,
  type WireClassification,
  type WireContext,
} from './wire.ts'

/** The modern versions a transport speaks on `server/discover`, highest first: at least one. */
export type ProtocolVersions = readonly [string, ...string[]]

/** The two `server/discover` request classes. */
export const PROBE_REQUESTS: readonly RequestClass[] = ['discover', 'discover-retry']

/**
 * The request classes that Streamable HTTP sends once more, with a new id, after a broken
 * stream or a 2xx without an answer (T8 D15, O05). Not in the legacy HTTP+SSE mode.
 */
export const RESENT_REQUESTS: readonly RequestClass[] = [
  'discover',
  'discover-retry',
  'tools/list',
  'tasks/get',
]

export type { UnusableCause } from './outcomes.ts'

type NotSent = Extract<TransportFailure, { kind: 'not-sent' }>

/**
 * What a transport settles one request with: the T8 reading of the answer class, before the
 * request's own reader (T2, T6) is applied.
 * - `result`, `error`: the JSON-RPC answer. An `error` keeps its class; `error` is the error
 *   object, or the whole message when the envelope is not one of T2 (C02).
 * - `no-answer`: nothing readable came; `resend` says whether the row sends the request once more.
 * - `not-sent`: the request had no effect at the peer.
 * A `no-answer` and a `not-sent` other than `authorization-required` carry `unusable` (on the
 * `not-sent`, in its failure) when the transport is not usable any more as it hands the answer
 * over and this side has not closed it (T1); only this layer writes it (`concludeAnswer`,
 * `lineGoneAnswerOf`, `streamGoneAnswerOf`, `unusableAnswerOf`, `notSentFailureOf`).
 * - `legacy-peer`: a `server/discover` answer that says the peer speaks a legacy revision only.
 * - `legacy-http`: `initialize` answered 4xx+plain: the legacy HTTP+SSE fallback may follow (I07).
 */
export type WireAnswer =
  | Readonly<{ kind: 'result'; result: JsonValue }>
  | Readonly<{ kind: 'error'; error: JsonValue; errorClass: ErrorClass }>
  | Readonly<{ kind: 'no-answer'; cause: NoAnswerCause; resend: boolean; unusable?: UnusableCause }>
  | Readonly<{ kind: 'not-sent'; failure: NotSent }>
  | Readonly<{ kind: 'legacy-peer' }>
  | Readonly<{ kind: 'legacy-http' }>

/**
 * The conclusion of a T8 row for one classification.
 * - `settle`: the request settles with `wire`; `unusable` names the cause every later request
 *   answers with when the row ends the transport, and `wire` carries it already.
 * - `authorization-required`: T4: the transport calls `reportRejection()` on the handle that
 *   authorized the request, discovers the authorization, and settles with `not-sent`.
 * - `wait`: the event was no answer to the request (`other`, `waiting`).
 */
export type AnswerConclusion =
  | Readonly<{ kind: 'settle'; wire: WireAnswer; unusable?: UnusableCause }>
  | Readonly<{ kind: 'authorization-required' }>
  | Readonly<{ kind: 'wait' }>

/** What one answer to `server/discover` means for the modern path (T3, T8 D rows). */
export type ProbeConclusion =
  | Readonly<{ kind: 'identity'; identity: PeerIdentity }>
  | Readonly<{ kind: 'retry'; version: string }>
  | Readonly<{ kind: 'final'; failure: TransportFailure }>
  /** The legacy path is tried; when it fails too, this failure is reported. */
  | Readonly<{ kind: 'fallback'; failure: TransportFailure }>
  /** The legacy path is tried; when it fails too, its own failure is reported. */
  | Readonly<{ kind: 'legacy-peer' }>

export const NOT_SENT_FAILURE: NotSent = { kind: 'not-sent', cause: 'connection-unavailable' }
const SESSION_ENDED: NotSent = { kind: 'not-sent', cause: 'session-ended' }
const NOT_SENT: WireAnswer = { kind: 'not-sent', failure: NOT_SENT_FAILURE }
const LEGACY_PEER: WireAnswer = { kind: 'legacy-peer' }
const LEGACY_HTTP: WireAnswer = { kind: 'legacy-http' }
export const ABANDONED: WireAnswer = { kind: 'no-answer', cause: 'abandoned', resend: false }
const WAIT: AnswerConclusion = { kind: 'wait' }
const AUTHORIZATION_REQUIRED: AnswerConclusion = { kind: 'authorization-required' }
const MODERN_ERROR_CLASSES: readonly ErrorClass[] = [
  '-32020',
  '-32021',
  '-32022+common',
  '-32022+modern',
  '-32022+legacy',
]

/** The failure of an answer that was read and found malformed (T7). */
export const malformed = (what: AnswerMalformed['what']): TransportFailure => ({
  kind: 'answer-malformed',
  what,
})

function settle(wire: WireAnswer, unusable?: UnusableCause): AnswerConclusion {
  return unusable === undefined
    ? { kind: 'settle', wire }
    : { kind: 'settle', wire: unusableAnswerOf(wire, unusable), unusable }
}

/**
 * The `not-sent` (`connection-unavailable`) of a request the transport did not take: with the
 * cause as the mark when the transport is not usable any more (T1, T8 "every later request").
 */
export function notSentFailureOf(unusable: UnusableCause | undefined): NotSent {
  return unusable === undefined
    ? NOT_SENT_FAILURE
    : { kind: 'not-sent', cause: 'connection-unavailable', unusable }
}

/**
 * T1, T8 "every later request": `wire` as a transport that is not usable any more hands it over,
 * for `cause`, the cause the transport recorded. The mark is the transport's state, not the
 * line's: a `no-answer` and a `not-sent` other than `authorization-required` carry `cause`, in
 * place of a mark they carried already; the cause of the request's own failure stays.
 *
 * A `not-sent` (`session-ended`) carries `session-ended` whatever `cause` is. Only T8 S07 gives
 * it, and S07 ends the transport for `session-ended`; a transport that died for another cause
 * first has settled every request on the line by then, so no transport hands one over for another
 * cause. The cell still needs a value: whether the mark is present decides whether a ready
 * connection is lost (S7), so the answer carries one, and the answer itself says the session
 * ended.
 *
 * A refused authorization, an answer of the peer and the two legacy readings are as they are: no
 * gone line gives them.
 */
export function unusableAnswerOf(wire: WireAnswer, cause: UnusableCause): WireAnswer {
  switch (wire.kind) {
    case 'no-answer':
      return { ...wire, unusable: cause }
    case 'not-sent': {
      const failure = wire.failure
      switch (failure.cause) {
        case 'authorization-required':
          return wire
        case 'session-ended':
          return { kind: 'not-sent', failure: { ...failure, unusable: 'session-ended' } }
        case 'connection-unavailable':
          return { kind: 'not-sent', failure: { ...failure, unusable: cause } }
        default: {
          const exhaustive: never = failure
          return exhaustive
        }
      }
    }
    case 'result':
    case 'error':
    case 'legacy-peer':
    case 'legacy-http':
      return wire
    default: {
      const exhaustive: never = wire
      return exhaustive
    }
  }
}

function brokenStream(resend: boolean): WireAnswer {
  return { kind: 'no-answer', cause: 'stream-broken', resend }
}

/** The request class of a request the transport sends; `retried` marks the second probe. */
export function requestClassOf(method: RequestMethod, retried: boolean): RequestClass {
  if (method === 'server/discover') return retried ? 'discover-retry' : 'discover'
  return method
}

// ---- The conclusion of a classification (T8) ----

/** The rows that read the exchange itself, not a message: X01, X02, S01–S07, D14, O04, C03, I05. */
function exchangeConclusionOf(
  answer: AnswerClass,
  context: WireContext,
  kind: TransportMaterial['kind'],
): AnswerConclusion | undefined {
  switch (answer) {
    case 'unsent':
      return settle(NOT_SENT, kind === 'stdio' ? 'stream-broken' : undefined)
    case 'silent':
      // D13: on stdio the probe time ran out; a close or signal settles without a class (T5).
      return settle(
        kind === 'stdio' && PROBE_REQUESTS.includes(context.request) ? LEGACY_PEER : ABANDONED,
      )
    case 'stream-broken':
    case 'http:2xx':
      return settle(
        brokenStream(resends(context, kind)),
        kind === 'stdio' ? 'stream-broken' : undefined,
      )
    case 'process-exited':
      return settle({ kind: 'no-answer', cause: 'process-exited', resend: false }, 'process-exited')
    default:
      return httpStatusConclusionOf(answer)
  }
}

/** The HTTP status rows that read no message: S05, S06, S07 (the rest return undefined). */
function httpStatusConclusionOf(answer: AnswerClass): AnswerConclusion | undefined {
  switch (answer) {
    case 'http:401':
    case 'http:403+scope':
      return AUTHORIZATION_REQUIRED
    case 'http:403':
      return settle(NOT_SENT)
    case 'http:404+session':
      return settle({ kind: 'not-sent', failure: SESSION_ENDED }, 'session-ended')
    default:
      return undefined
  }
}

/** D15, O05: a read request on Streamable HTTP outside the SSE mode is sent once more. */
function resends(context: WireContext, kind: TransportMaterial['kind']): boolean {
  return (
    kind === 'streamable-http' &&
    context.mode !== 'sse' &&
    RESENT_REQUESTS.includes(context.request)
  )
}

function isErrorClass(text: string): text is ErrorClass {
  return ERROR_CLASSES.some(known => known === text)
}

function isStatusClass(text: string): text is HttpStatusClass {
  return HTTP_STATUS_CLASSES.some(known => known === text)
}

/** The parts of a result, error or HTTP error-status class. */
type AnswerParts =
  | Readonly<{ kind: 'result' }>
  | Readonly<{ kind: 'error'; errorClass: ErrorClass }>
  | Readonly<{ kind: 'http'; status: HttpStatusClass; body: BodyClass }>

function partsOf(answer: AnswerClass): AnswerParts {
  if (answer.startsWith('result')) return { kind: 'result' }
  const error = answer.startsWith('error:') ? answer.slice('error:'.length) : undefined
  if (error !== undefined && isErrorClass(error)) return { kind: 'error', errorClass: error }
  const plus = answer.indexOf('+')
  const status = answer.slice('http:'.length, plus)
  const body = answer.slice(plus + 1)
  if (isStatusClass(status) && (body === 'plain' || isErrorClass(body)))
    return { kind: 'http', status, body }
  throw new TypeError(`${answer} is not an answer class of a message`)
}

/** The message a result or error class was read from: its absence is a defect of the caller. */
function messageOf(classified: Extract<WireClassification, { kind: 'answer' }>): JsonObject {
  if (classified.message === undefined)
    throw new TypeError(`the class ${classified.answer} came without its message`)
  return classified.message
}

/** The error object of a message whose envelope (T2) carries `error`, else the whole message (C02). */
function errorPayloadOf(message: JsonObject): JsonValue {
  const envelope = envelopeOf(message)
  return envelope !== undefined && 'error' in envelope ? envelope.error : message
}

function resultWireOf(message: JsonObject): WireAnswer {
  const result = member(message, 'result')
  if (result === undefined) throw new TypeError('a result class came without a result')
  return { kind: 'result', result }
}

function errorWireOf(message: JsonObject, errorClass: ErrorClass): WireAnswer {
  return { kind: 'error', error: errorPayloadOf(message), errorClass }
}

/**
 * An HTTP error status (T8): a probe reads 5xx as a broken stream (D16), a modern-revision error
 * in a 4xx body as the answer (D04–D08) and anything else as a legacy peer (D12); every other
 * request reads a JSON-RPC error in the body as the answer, 5xx+plain as a broken stream that
 * is not re-sent (I06, O07, C04), and 4xx+plain as not sent (O08, C05), or on `initialize`
 * outside the SSE mode as the chance of the legacy HTTP+SSE fallback (I07).
 */
function httpErrorWireOf(
  status: HttpStatusClass,
  body: BodyClass,
  message: JsonObject | undefined,
  context: WireContext,
): WireAnswer {
  const probe = PROBE_REQUESTS.includes(context.request)
  if (status === '5xx' && (probe || body === 'plain')) return brokenStream(false)
  if (body === 'plain') {
    if (probe) return LEGACY_PEER
    return context.request === 'initialize' && context.mode !== 'sse' ? LEGACY_HTTP : NOT_SENT
  }
  if (probe && !MODERN_ERROR_CLASSES.includes(body)) return LEGACY_PEER
  if (message === undefined) throw new TypeError(`the class ${body} came without its message`)
  return errorWireOf(message, body)
}

/**
 * Draws the T8 conclusion of one classification for one request. A classification that is no
 * answer (`other`, `waiting`) is `wait`. A result or error class must carry the message it was
 * read from: `classifyWireEvent` always does; a caller that builds one without it gets a
 * `TypeError`.
 */
export function concludeAnswer(
  classified: WireClassification,
  context: WireContext,
  kind: TransportMaterial['kind'],
): AnswerConclusion {
  if (classified.kind !== 'answer') return WAIT
  const exchange = exchangeConclusionOf(classified.answer, context, kind)
  if (exchange !== undefined) return exchange
  const parts = partsOf(classified.answer)
  switch (parts.kind) {
    case 'result':
      return settle(resultWireOf(messageOf(classified)))
    case 'error':
      return settle(errorWireOf(messageOf(classified), parts.errorClass))
    case 'http':
      return settle(httpErrorWireOf(parts.status, parts.body, classified.message, context))
    default: {
      const exhaustive: never = parts
      return exhaustive
    }
  }
}

/** The failure an error answer reports: the error as written, or `error-shape` when it is unreadable (T7). */
export function errorFailureOf(wire: Extract<WireAnswer, { kind: 'error' }>): TransportFailure {
  const answer = errorAnswerOf(wire.error)
  if (wire.errorClass === 'unreadable' || answer === undefined) return malformed('error-shape')
  return answer
}

// ---- The probe and the two paths of discover (T3, T8 D rows, I rows) ----

/**
 * The highest version in common with the `supported` of a `-32022`, when there is one (T3).
 * `versions` are the modern versions this side speaks, so a legacy version in `supported` is
 * never in common; the modern-ness is judged once, in `errorClassOf` (T2).
 */
export function retryVersionOf(error: JsonValue, versions: readonly string[]): string | undefined {
  const data = isObject(error) ? member(error, 'data') : undefined
  const supported = supportedOf(data) ?? []
  return versions.find(version => supported.includes(version))
}

/** D04–D07: what a `-32022` means, by its class and by which probe it answered. */
function unsupportedVersionOf(
  wire: Extract<WireAnswer, { kind: 'error' }>,
  request: 'discover' | 'discover-retry',
  versions: readonly string[],
): ProbeConclusion {
  if (request === 'discover-retry') return { kind: 'final', failure: errorFailureOf(wire) }
  switch (wire.errorClass) {
    case '-32022+common': {
      const version = retryVersionOf(wire.error, versions)
      return version === undefined
        ? { kind: 'final', failure: malformed('discover-shape') }
        : { kind: 'retry', version }
    }
    case '-32022+modern':
      return { kind: 'final', failure: malformed('discover-shape') }
    default:
      return { kind: 'legacy-peer' }
  }
}

/** A JSON-RPC error on `server/discover`, direct or in a 4xx body (D04–D11). */
function probeErrorConclusionOf(
  wire: Extract<WireAnswer, { kind: 'error' }>,
  request: 'discover' | 'discover-retry',
  versions: readonly string[],
): ProbeConclusion {
  switch (wire.errorClass) {
    case '-32022+common':
    case '-32022+modern':
    case '-32022+legacy':
      return unsupportedVersionOf(wire, request, versions)
    case '-32020':
    case '-32021':
      return { kind: 'final', failure: errorFailureOf(wire) }
    case '-32601':
      return { kind: 'legacy-peer' }
    case '-32602':
    case 'other':
    case 'unreadable':
      return { kind: 'fallback', failure: errorFailureOf(wire) }
    default: {
      const exhaustive: never = wire.errorClass
      return exhaustive
    }
  }
}

/** The failure of a `no-answer`, with its cause and, when it carries one, its mark (T1). */
export function noAnswerFailureOf(
  wire: Extract<WireAnswer, { kind: 'no-answer' }>,
): Extract<TransportFailure, { kind: 'no-answer' }> {
  const { cause, unusable } = wire
  return unusable === undefined
    ? { kind: 'no-answer', cause }
    : { kind: 'no-answer', cause, unusable }
}

/** What one answer to `server/discover` means for the modern path (T3, T8 D01–D16). */
export function concludeProbe(
  wire: WireAnswer,
  request: 'discover' | 'discover-retry',
  versions: readonly string[],
  bound: IdentityBound,
): ProbeConclusion {
  switch (wire.kind) {
    case 'result': {
      const read = readDiscoverResult(wire.result, versions)
      if ('ok' in read) return { kind: 'identity', identity: peerIdentityOf(read.ok, bound) }
      if (read.failure === 'no-common-version') return { kind: 'legacy-peer' }
      return { kind: 'fallback', failure: malformed('discover-shape') }
    }
    case 'error':
      return probeErrorConclusionOf(wire, request, versions)
    case 'no-answer':
      return { kind: 'final', failure: noAnswerFailureOf(wire) }
    case 'not-sent':
      return { kind: 'final', failure: wire.failure }
    case 'legacy-http':
      return { kind: 'final', failure: NOT_SENT_FAILURE }
    case 'legacy-peer':
      return { kind: 'legacy-peer' }
    default: {
      const exhaustive: never = wire
      return exhaustive
    }
  }
}

// ---- What a request settles with after a stream is gone, or a refused authorization (T8, T4) ----

/**
 * T8 S01–S04 and the SSE mode: what every request handed to a shared stream settles with when the
 * stream is gone (`stream-broken`, `process-exited`): `no-answer` with the cause, never sent again,
 * and the transport not usable any more for the same cause (T1).
 */
export function streamGoneAnswerOf(cause: Exclude<UnusableCause, 'session-ended'>): WireAnswer {
  return { kind: 'no-answer', cause, resend: false, unusable: cause }
}

/** T4: what a request refused with 401 or a scoped 403 settles with, given its discovery (R4). */
export function authorizationRequiredAnswerOf(discovery: AuthorizationDiscovery): WireAnswer {
  return {
    kind: 'not-sent',
    failure: { kind: 'not-sent', cause: 'authorization-required', discovery },
  }
}

// ---- The phase of a request in flight, and what a stop or a gone line settles it with (T5, T8) ----

/**
 * The phase of a request in flight (T5). The boundary is what the peer may have received:
 * - `authorizing`: registered, not handed out yet: the peer may not have received any part of it.
 * - `sent`: handed out: the peer may have received it, even when it has not left this process.
 * - `discovery`: refused with 401 or a scoped 403 (T4) and discovering the authorization; `soFar()`
 *   is the discovery from what was fetched by now (R4).
 */
export type InFlightPhase =
  | Readonly<{ kind: 'authorizing' }>
  | Readonly<{ kind: 'sent' }>
  | Readonly<{ kind: 'discovery'; soFar(): AuthorizationDiscovery }>

/**
 * T5: what the caller's signal or `close()` settles a request in flight with, by its phase, there
 * and then: `not-sent` (`connection-unavailable`) while authorizing, `no-answer` (`abandoned`)
 * once sent, `not-sent` (`authorization-required`) with what was fetched by now while discovering.
 */
export function stopAnswerOf(phase: InFlightPhase): WireAnswer {
  switch (phase.kind) {
    case 'authorizing':
      return NOT_SENT
    case 'sent':
      return ABANDONED
    case 'discovery':
      return authorizationRequiredAnswerOf(phase.soFar())
    default: {
      const exhaustive: never = phase
      return exhaustive
    }
  }
}

/**
 * T8 S01–S04, X02, the SSE mode and S07: what a request in flight settles with when the line is gone,
 * by its phase. Only the two phases that depend on the line settle: one still authorizing never
 * reached the wire and is `not-sent` (`connection-unavailable`); one sent answers `no-answer` with
 * the cause, except when the peer ended the session (S07): the request that was told so settled
 * by its row, every other sent request is left to its own answer. Both carry the cause as the mark
 * that the transport is not usable any more (T1). A request discovering its authorization goes on:
 * its conclusion came first (T4), and the discovery does not use the line. Undefined when the
 * request goes on.
 */
export function lineGoneAnswerOf(
  phase: InFlightPhase,
  cause: UnusableCause,
): WireAnswer | undefined {
  switch (phase.kind) {
    case 'authorizing':
      return unusableAnswerOf(NOT_SENT, cause)
    case 'sent':
      return cause === 'session-ended' ? undefined : streamGoneAnswerOf(cause)
    case 'discovery':
      return undefined
    default: {
      const exhaustive: never = phase
      return exhaustive
    }
  }
}

/**
 * T3: the status of the legacy HTTP+SSE fallback GET is classified as an answer to `initialize`
 * outside the SSE mode: 401 and a scoped 403 are S05 (`authorization-required`, the refusal flow of
 * T4); every other status is I07's `not-sent` (`connection-unavailable`).
 */
export function fallbackGetConclusionOf(
  answer: Readonly<{ status: number; headers: Readonly<{ [name: string]: string }>; body: string }>,
  versions: ProtocolVersions,
): Extract<AnswerConclusion, { kind: 'settle' | 'authorization-required' }> {
  const context: WireContext = { id: '', request: 'initialize', session: false, versions }
  const { status, headers, body } = answer
  const conclusion = concludeAnswer(
    classifyWireEvent({ kind: 'http-status', status, headers, body }, context),
    context,
    'streamable-http',
  )
  return conclusion.kind === 'authorization-required'
    ? conclusion
    : { kind: 'settle', wire: NOT_SENT }
}
