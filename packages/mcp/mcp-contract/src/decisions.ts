// The decision layer of SPEC T8, once for every transport. `classifyWireEvent` puts a wire event
// into its answer class; the functions here draw the conclusion of the T8 row for that class:
// what the request settles with, whether the transport is still usable, what a `server/discover`
// answer means for the modern path, how a settled answer reads for each request, and what the
// transport writes. A transport keeps only its wire and its in-flight table.
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import type { Outcome } from '@omne-harness/operation-result'
import { authorizationDiscoveryOf, metadataCandidatesOf } from './authorization.ts'
import type { ClientInfo } from './envelope.ts'
import { isObject, member, type JsonObject } from './json.ts'
import type {
  AnswerMalformed,
  AuthorizationDiscovery,
  NoAnswerCause,
  PeerAnswer,
  TaskReport,
} from './outcomes.ts'
import type { PlainJson, PlainRecord } from './plain.ts'
import {
  errorAnswerOf,
  peerIdentityOf,
  readDiscoverResult,
  readInitializeResult,
  readListingPage,
  readTaskAnswer,
  readTaskReport,
  type IdentityBound,
} from './readers.ts'
import { LEGACY_PROTOCOL_VERSIONS, isModernProtocolVersion } from './revisions.ts'
import type { ListingPage, TaskAnswer, TransportFailure, TransportMaterial } from './transport.ts'
import type { PeerIdentity } from './values.ts'
import {
  ERROR_CLASSES,
  HTTP_STATUS_CLASSES,
  envelopeOf,
  supportedOf,
  type AnswerClass,
  type BodyClass,
  type ErrorClass,
  type HttpStatusClass,
  type PeerMessage,
  type RequestClass,
  type WireClassification,
  type WireContext,
} from './wire.ts'

/** The modern versions a transport speaks on `server/discover`, highest first: at least one. */
export type ProtocolVersions = readonly [string, ...string[]]

/** The requests a transport sends (T3). */
export type RequestMethod =
  | 'server/discover'
  | 'initialize'
  | 'tools/list'
  | 'tools/call'
  | 'tasks/get'
  | 'tasks/update'
  | 'tasks/cancel'

/** The notifications a transport sends (T3, T5). */
export type NotificationMethod = 'notifications/initialized' | 'notifications/cancelled'

/** The legacy revision the legacy path offers on `initialize` (T3). */
export const [OFFERED_LEGACY_VERSION] = LEGACY_PROTOCOL_VERSIONS

/** The JSON-RPC error code a transport answers to a request of the peer other than `ping` (T3). */
export const METHOD_NOT_FOUND = -32601

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

type NotSent = Extract<TransportFailure, { kind: 'not-sent' }>

/**
 * What a transport settles one request with: the T8 reading of the answer class, before the
 * request's own reader (T2, T6) is applied.
 * - `result`, `error`: the JSON-RPC answer. An `error` keeps its class; `error` is the error
 *   object, or the whole message when the envelope is not one of T2 (C02).
 * - `no-answer`: nothing readable came; `resend` says whether the row sends the request once more.
 * - `not-sent`: the request had no effect at the peer.
 * - `legacy-peer`: a `server/discover` answer that says the peer speaks a legacy revision only.
 * - `legacy-http`: `initialize` answered 4xx+plain: the legacy HTTP+SSE fallback may follow (I07).
 */
export type WireAnswer =
  | Readonly<{ kind: 'result'; result: JsonValue }>
  | Readonly<{ kind: 'error'; error: JsonValue; errorClass: ErrorClass }>
  | Readonly<{ kind: 'no-answer'; cause: NoAnswerCause; resend: boolean }>
  | Readonly<{ kind: 'not-sent'; failure: NotSent }>
  | Readonly<{ kind: 'legacy-peer' }>
  | Readonly<{ kind: 'legacy-http' }>

/**
 * The conclusion of a T8 row for one classification.
 * - `settle`: the request settles with `wire`; `unusable` names the cause every later request
 *   answers with when the row ends the transport.
 * - `authorization-required`: T4: the transport calls `reportRejection()` on the handle that
 *   authorized the request, discovers the authorization, and settles with `not-sent`.
 * - `wait`: the event was no answer to the request (`other`, `waiting`).
 */
export type AnswerConclusion =
  | Readonly<{ kind: 'settle'; wire: WireAnswer; unusable?: NoAnswerCause | 'session-ended' }>
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

const malformed = (what: AnswerMalformed['what']): TransportFailure => ({
  kind: 'answer-malformed',
  what,
})

function settle(wire: WireAnswer, unusable?: NoAnswerCause | 'session-ended'): AnswerConclusion {
  return unusable === undefined ? { kind: 'settle', wire } : { kind: 'settle', wire, unusable }
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

// ---- The readings of a settled answer (T2, T6, T7) ----

/** A reader of the contract as a reader of the transport: its defect is the `what` of T7. */
export function readerOf<T, W extends AnswerMalformed['what']>(
  read: (result: JsonValue) => Outcome<T, W>,
): (result: JsonValue) => Outcome<T, TransportFailure> {
  return result => {
    const outcome = read(result)
    return 'ok' in outcome ? outcome : { failure: malformed(outcome.failure) }
  }
}

/** The failure an error answer reports: the error as written, or `error-shape` when it is unreadable (T7). */
function errorFailureOf(wire: Extract<WireAnswer, { kind: 'error' }>): TransportFailure {
  const answer = errorAnswerOf(wire.error)
  if (wire.errorClass === 'unreadable' || answer === undefined) return malformed('error-shape')
  return answer
}

/** Reads the answer to a request other than `tools/call` with the reader of that request. */
export function interpretAnswer<T>(
  wire: WireAnswer,
  read: (result: JsonValue) => Outcome<T, TransportFailure>,
): Outcome<T, TransportFailure> {
  switch (wire.kind) {
    case 'result':
      return read(wire.result)
    case 'error':
      return { failure: errorFailureOf(wire) }
    case 'no-answer':
      return { failure: { kind: 'no-answer', cause: wire.cause } }
    case 'not-sent':
      return { failure: wire.failure }
    case 'legacy-http':
      return { failure: NOT_SENT_FAILURE }
    case 'legacy-peer':
      return { failure: malformed('discover-shape') }
    default: {
      const exhaustive: never = wire
      return exhaustive
    }
  }
}

/** The answer of a sent call (T8 C01–C05, S03, S04). */
export function callAnswerOf(wire: WireAnswer): PeerAnswer {
  switch (wire.kind) {
    case 'result':
      return { kind: 'result', result: wire.result }
    case 'error':
      return { kind: 'error', error: wire.error }
    case 'no-answer':
      return { kind: 'no-answer', cause: wire.cause }
    case 'not-sent':
    case 'legacy-peer':
    case 'legacy-http':
      return { kind: 'no-answer', cause: 'abandoned' }
    default: {
      const exhaustive: never = wire
      return exhaustive
    }
  }
}

/** The page of `tools/list` (T2, L01–L03); `checkHeaders` applies the `x-mcp-header` rule. */
export function listingPageOf(
  wire: WireAnswer,
  checkHeaders: boolean,
): Outcome<ListingPage, TransportFailure> {
  return interpretAnswer(
    wire,
    readerOf(result => readListingPage(result, checkHeaders)),
  )
}

/** G06: the `-32602` of a task operation that reads a task says the task expired. */
function expired(wire: WireAnswer): boolean {
  return wire.kind === 'error' && wire.errorClass === '-32602'
}

/** The report of `tasks/get` for `getTask` (T6, G01–G06). */
export function taskReportOf(wire: WireAnswer): Outcome<TaskReport | 'expired', TransportFailure> {
  return expired(wire) ? { ok: 'expired' } : interpretAnswer(wire, readerOf(readTaskReport))
}

/** The answer of `tasks/get` for `getTaskResult` (T6, G01–G06). */
export function taskAnswerOf(wire: WireAnswer): Outcome<TaskAnswer, TransportFailure> {
  return expired(wire)
    ? { ok: { kind: 'expired' } }
    : interpretAnswer(wire, readerOf(readTaskAnswer))
}

// ---- The probe and the two paths of discover (T3, T8 D rows, I rows) ----

/** The highest version in common with the `supported` of a `-32022`, when there is one (T3). */
export function retryVersionOf(error: JsonValue, versions: readonly string[]): string | undefined {
  const data = isObject(error) ? member(error, 'data') : undefined
  const modern = (supportedOf(data) ?? []).filter(isModernProtocolVersion)
  return versions.find(version => modern.includes(version))
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
      return { kind: 'final', failure: { kind: 'no-answer', cause: wire.cause } }
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

/** The two paths of a transport's `discover`: the probes and the legacy path, as the transport sends them. */
export type DiscoverPaths = Readonly<{
  /** Sends one `server/discover` with this `_meta` version and waits for its answer. */
  probe(version: string, request: 'discover' | 'discover-retry'): Promise<WireAnswer>
  /** The legacy path (T3): `initialize`, then `notifications/initialized` when it read. */
  legacy(): Promise<Outcome<PeerIdentity, TransportFailure>>
}>

/**
 * `discover` (T3): the modern path first, `server/discover` once more after a `-32022` that
 * names a version in common (D04); then the legacy path when a D row says so, reporting the
 * failure the row names when the legacy path fails too.
 */
export async function discoverWith(
  paths: DiscoverPaths,
  versions: ProtocolVersions,
  bound: IdentityBound,
): Promise<Outcome<PeerIdentity, TransportFailure>> {
  let probe = concludeProbe(await paths.probe(versions[0], 'discover'), 'discover', versions, bound)
  if (probe.kind === 'retry')
    probe = concludeProbe(
      await paths.probe(probe.version, 'discover-retry'),
      'discover-retry',
      versions,
      bound,
    )
  switch (probe.kind) {
    case 'identity':
      return { ok: probe.identity }
    case 'final':
      return { failure: probe.failure }
    case 'legacy-peer':
      return paths.legacy()
    case 'fallback': {
      const legacy = await paths.legacy()
      return 'ok' in legacy ? legacy : { failure: probe.failure }
    }
    case 'retry':
      return { failure: malformed('discover-shape') }
    default: {
      const exhaustive: never = probe
      return exhaustive
    }
  }
}

/** The params of the legacy path's `initialize` (T3). */
export function legacyInitializeParamsOf(clientInfo: ClientInfo): PlainRecord {
  return {
    protocolVersion: OFFERED_LEGACY_VERSION,
    capabilities: {},
    clientInfo: { name: clientInfo.name, version: clientInfo.version },
  }
}

/** The peer identity the legacy path reads from the answer to `initialize` (T3, T8 I01–I07). */
export function legacyIdentityOf(
  wire: WireAnswer,
  bound: IdentityBound,
): Outcome<PeerIdentity, TransportFailure> {
  return interpretAnswer(wire, result => {
    const read = readInitializeResult(result)
    return 'failure' in read
      ? { failure: malformed('discover-shape') }
      : { ok: peerIdentityOf(read.ok, bound) }
  })
}

// ---- The authorization discovery (T4, R4) ----

/** Fetches the protected resource metadata at one address: the JSON read there, or nothing. */
export type MetadataFetch = (url: string, signal: AbortSignal) => Promise<JsonValue | undefined>

/**
 * The discovery of T4 after a refused authorization (R4): the candidate addresses are fetched
 * in order until one gives a JSON object; a fetch that rejects counts as nothing fetched. The
 * signal ends the loop: what was not fetched by then is unavailable.
 */
export async function discoverAuthorization(
  target: string,
  challenge: ReadonlyMap<string, string>,
  fetchMetadata: MetadataFetch,
  signal: AbortSignal,
): Promise<AuthorizationDiscovery> {
  const candidates = metadataCandidatesOf(target, challenge)
  const fetched: (JsonValue | undefined)[] = []
  for (const url of candidates) {
    if (signal.aborted) break
    const metadata = await fetchMetadata(url, signal).catch(() => undefined)
    fetched.push(metadata)
    if (isObject(metadata)) break
  }
  return authorizationDiscoveryOf(challenge, candidates, fetched)
}

// ---- The requests and notifications of the peer (T3) ----

/** What a transport answers to a request of the peer: `ping` an empty result, the rest `-32601` (T3). */
export function peerRequestAnswerOf(
  request: Extract<PeerMessage, { kind: 'request' }>,
): Readonly<{ result: PlainRecord }> | Readonly<{ error: PlainRecord }> {
  return request.method === 'ping'
    ? { result: {} }
    : { error: { code: METHOD_NOT_FOUND, message: 'Method not found' } }
}

// ---- The text of what the transport writes (T3, RFC-0010) ----

/** The value tree of plain data this side wrote. */
function treeOf(value: PlainJson): JsonValue {
  if (value === null) return { kind: 'null' }
  if (typeof value === 'boolean') return { kind: 'boolean', value }
  if (typeof value === 'string') return { kind: 'string', value }
  if (typeof value === 'number') return { kind: 'number', lexeme: String(value) }
  if (Array.isArray(value)) return { kind: 'array', items: value.map(treeOf) }
  return {
    kind: 'object',
    entries: Object.entries(value).map(([key, item]) => ({ key, value: treeOf(item) })),
  }
}

type Member = Readonly<{ key: string; value: JsonValue }>

/** One JSON-RPC message of this side as text: `jsonrpc` first, then the members in order. */
function messageTextOf(members: readonly Member[]): string {
  return writeJsonText({
    kind: 'object',
    entries: [{ key: 'jsonrpc', value: { kind: 'string', value: '2.0' } }, ...members],
  })
}

/**
 * The params of a request: the plain members, then the value trees the caller wrote, each
 * written as it is (RFC-0010): `arguments` and `inputResponses` keep their lexemes.
 */
function paramsOf(params: PlainRecord, values: Readonly<{ [key: string]: JsonValue }>): JsonValue {
  return {
    kind: 'object',
    entries: [
      ...Object.entries(params).map(([key, value]) => ({ key, value: treeOf(value) })),
      ...Object.entries(values).map(([key, value]) => ({ key, value })),
    ],
  }
}

/** The text of one request of this side (T3). `values` are params the caller wrote as value trees. */
export function requestTextOf(
  message: Readonly<{
    id: string
    method: RequestMethod
    params: PlainRecord
    values?: Readonly<{ [key: string]: JsonValue }>
  }>,
): string {
  return messageTextOf([
    { key: 'id', value: { kind: 'string', value: message.id } },
    { key: 'method', value: { kind: 'string', value: message.method } },
    { key: 'params', value: paramsOf(message.params, message.values ?? {}) },
  ])
}

/** The text of one notification of this side (T3, T5). */
export function notificationTextOf(
  message: Readonly<{ method: NotificationMethod; params: PlainRecord }>,
): string {
  return messageTextOf([
    { key: 'method', value: { kind: 'string', value: message.method } },
    { key: 'params', value: treeOf(message.params) },
  ])
}

/** The text of a response to a request of the peer: its `id` echoed as written (RFC-0010). */
export function responseTextOf(
  message: Readonly<{ id: JsonValue }> &
    (Readonly<{ result: PlainRecord }> | Readonly<{ error: PlainRecord }>),
): string {
  const body: Member =
    'result' in message
      ? { key: 'result', value: treeOf(message.result) }
      : { key: 'error', value: treeOf(message.error) }
  return messageTextOf([{ key: 'id', value: message.id }, body])
}
