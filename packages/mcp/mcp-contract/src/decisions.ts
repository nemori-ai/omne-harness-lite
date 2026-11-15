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

export type ProtocolVersions = readonly [string, ...string[]]

export const PROBE_REQUESTS: readonly RequestClass[] = ['discover', 'discover-retry']

export const RESENT_REQUESTS: readonly RequestClass[] = [
  'discover',
  'discover-retry',
  'tools/list',
  'tasks/get',
]

export type { UnusableCause } from './outcomes.ts'

type NotSent = Extract<TransportFailure, { kind: 'not-sent' }>

export type WireAnswer =
  | Readonly<{ kind: 'result'; result: JsonValue }>
  | Readonly<{ kind: 'error'; error: JsonValue; errorClass: ErrorClass }>
  | Readonly<{ kind: 'no-answer'; cause: NoAnswerCause; resend: boolean; unusable?: UnusableCause }>
  | Readonly<{ kind: 'not-sent'; failure: NotSent }>
  | Readonly<{ kind: 'legacy-peer' }>
  | Readonly<{ kind: 'legacy-http' }>

export type AnswerConclusion =
  | Readonly<{ kind: 'settle'; wire: WireAnswer; unusable?: UnusableCause }>
  | Readonly<{ kind: 'authorization-required' }>
  | Readonly<{ kind: 'wait' }>

export type ProbeConclusion =
  | Readonly<{ kind: 'identity'; identity: PeerIdentity }>
  | Readonly<{ kind: 'retry'; version: string }>
  | Readonly<{ kind: 'final'; failure: TransportFailure }>
  | Readonly<{ kind: 'fallback'; failure: TransportFailure }>
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

export const malformed = (what: AnswerMalformed['what']): TransportFailure => ({
  kind: 'answer-malformed',
  what,
})

function settle(wire: WireAnswer, unusable?: UnusableCause): AnswerConclusion {
  return unusable === undefined
    ? { kind: 'settle', wire }
    : { kind: 'settle', wire: unusableAnswerOf(wire, unusable), unusable }
}

export function notSentFailureOf(unusable: UnusableCause | undefined): NotSent {
  return unusable === undefined
    ? NOT_SENT_FAILURE
    : { kind: 'not-sent', cause: 'connection-unavailable', unusable }
}

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

export function requestClassOf(method: RequestMethod, retried: boolean): RequestClass {
  if (method === 'server/discover') return retried ? 'discover-retry' : 'discover'
  return method
}

function exchangeConclusionOf(
  answer: AnswerClass,
  context: WireContext,
  kind: TransportMaterial['kind'],
): AnswerConclusion | undefined {
  switch (answer) {
    case 'unsent':
      return settle(NOT_SENT, kind === 'stdio' ? 'stream-broken' : undefined)
    case 'silent':
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

function messageOf(classified: Extract<WireClassification, { kind: 'answer' }>): JsonObject {
  if (classified.message === undefined)
    throw new TypeError(`the class ${classified.answer} came without its message`)
  return classified.message
}

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

export function errorFailureOf(wire: Extract<WireAnswer, { kind: 'error' }>): TransportFailure {
  const answer = errorAnswerOf(wire.error)
  if (wire.errorClass === 'unreadable' || answer === undefined) return malformed('error-shape')
  return answer
}

export function retryVersionOf(error: JsonValue, versions: readonly string[]): string | undefined {
  const data = isObject(error) ? member(error, 'data') : undefined
  const supported = supportedOf(data) ?? []
  return versions.find(version => supported.includes(version))
}

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

export function noAnswerFailureOf(
  wire: Extract<WireAnswer, { kind: 'no-answer' }>,
): Extract<TransportFailure, { kind: 'no-answer' }> {
  const { cause, unusable } = wire
  return unusable === undefined
    ? { kind: 'no-answer', cause }
    : { kind: 'no-answer', cause, unusable }
}

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

export function streamGoneAnswerOf(cause: Exclude<UnusableCause, 'session-ended'>): WireAnswer {
  return { kind: 'no-answer', cause, resend: false, unusable: cause }
}

export function authorizationRequiredAnswerOf(discovery: AuthorizationDiscovery): WireAnswer {
  return {
    kind: 'not-sent',
    failure: { kind: 'not-sent', cause: 'authorization-required', discovery },
  }
}

export type InFlightPhase =
  | Readonly<{ kind: 'authorizing' }>
  | Readonly<{ kind: 'sent' }>
  | Readonly<{ kind: 'discovery'; soFar(): AuthorizationDiscovery }>

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
