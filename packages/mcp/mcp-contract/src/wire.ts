// The answer classes of SPEC T8 and the function that puts one wire event into its class. A
// transport classifies what it reads with `classifyWireEvent`; the T8 row of the class decides
// the outcome. The function is pure and total: every event gets one classification.
import { readJsonText, type JsonValue } from '@omne-harness/json-text'
import { isObject, itemsOf, member, textOf, type JsonObject } from './json.ts'
import {
  readDiscoverResult,
  readInitializeResult,
  readListingPage,
  readTaskReport,
} from './readers.ts'
import { isModernProtocolVersion } from './revisions.ts'

/**
 * The request classes. `discover` is the first `server/discover` of a connection; `discover-retry`
 * is the one sent after a `-32022` that named a version in common. `notification` is a
 * notification of the client (`notifications/initialized`, `notifications/cancelled`).
 */
export const REQUEST_CLASSES = [
  'discover',
  'discover-retry',
  'initialize',
  'tools/list',
  'tools/call',
  'tasks/get',
  'tasks/update',
  'tasks/cancel',
  'notification',
] as const

export type RequestClass = (typeof REQUEST_CLASSES)[number]

/** The JSON-RPC error classes, by code. `-32022` is split by its `data.supported`. */
export const ERROR_CLASSES = [
  '-32020',
  '-32021',
  '-32022+common',
  '-32022+modern',
  '-32022+legacy',
  '-32601',
  '-32602',
  'other',
  'unreadable',
] as const

export type ErrorClass = (typeof ERROR_CLASSES)[number]

/**
 * The HTTP status classes of an error answer: six statuses by themselves, `4xx` for every other
 * status from 300 to 499 except 401 and 403, and `5xx` for 500 and above.
 */
export const HTTP_STATUS_CLASSES = ['400', '404', '405', '406', '415', '429', '4xx', '5xx'] as const

export type HttpStatusClass = (typeof HTTP_STATUS_CLASSES)[number]

/** The body of an HTTP error answer: a JSON-RPC error of a class, or anything else (`plain`). */
export type BodyClass = ErrorClass | 'plain'

/** The results that a request can read, by request class. */
export const RESULT_CLASSES = {
  discover: ['result', 'result:no-common', 'result:unreadable'],
  'discover-retry': ['result', 'result:no-common', 'result:unreadable'],
  initialize: ['result', 'result:unreadable'],
  'tools/list': ['result', 'result:tools-missing', 'result:cursor-invalid'],
  'tools/call': ['result'],
  'tasks/get': [
    'result',
    'result:status-unknown',
    'result:input-requests-missing',
    'result:result-missing',
    'result:error-missing',
  ],
  'tasks/update': ['result'],
  'tasks/cancel': ['result'],
  notification: [],
} as const satisfies Readonly<Record<RequestClass, readonly string[]>>

export type ResultClass = (typeof RESULT_CLASSES)[RequestClass][number]

/**
 * One answer class (SPEC T8). `unsent`: the request failed before it left. `stream-broken`: the
 * answer stream (on stdio: the pipe) ended with no answer. `silent`: nothing came by the time the
 * transport stopped waiting. `process-exited`: the stdio process ended. `http:2xx`: a 2xx answer
 * whose body ended with no answer to the request. `http:404+session`: a 404 to a request that
 * carried a legacy session id. `http:<status class>+<body>`: an HTTP error status with its body.
 */
export type AnswerClass =
  | ResultClass
  | `error:${ErrorClass}`
  | 'unsent'
  | 'stream-broken'
  | 'silent'
  | 'process-exited'
  | 'http:401'
  | 'http:403+scope'
  | 'http:403'
  | 'http:2xx'
  | 'http:404+session'
  | `http:${HttpStatusClass}+${BodyClass}`

/**
 * When stdout ends and the root process exits both, the exit counts as the cause when it comes no
 * later than this many milliseconds after the end of stdout (SPEC T8).
 */
export const PROCESS_EXIT_WINDOW_MS = 100

/**
 * One wire event, as a transport sees it, for one request.
 * - `unsent`: the request failed before it left: on Streamable HTTP the connection failed (DNS,
 *   refused, TLS handshake); on stdio the pipe was broken or the process had exited when the
 *   transport wrote the request.
 * - `nothing`: the transport stopped waiting with nothing for the request: the stdio probe time
 *   ran out, `close()` ran, or the call's signal fired.
 * - `line`: one line that stdio delivered.
 * - `stdio-ended`: stdout ended, the root process exited, or both; the times are milliseconds on
 *   one clock, and at least one is present.
 * - `http-aborted`: the HTTP exchange failed after the request started to go out: before the
 *   answer head came (reset, timeout), or while a 2xx body was being read and before it ended.
 *   In the legacy HTTP+SSE mode the end of the shared stream is this event for every request in
 *   flight.
 * - `http-status`: an answer whose status is not 2xx, with its headers by lower-case name and the
 *   whole body.
 * - `http-stream`: a 2xx answer: the JSON-RPC messages read so far (the JSON body, or the data of
 *   each SSE event), and whether the body ended as the peer meant it to.
 */
export type WireEvent =
  | Readonly<{ kind: 'unsent' }>
  | Readonly<{ kind: 'nothing' }>
  | Readonly<{ kind: 'line'; text: string }>
  | Readonly<{ kind: 'stdio-ended'; stdoutEndedAt?: number; exitedAt?: number }>
  | Readonly<{ kind: 'http-aborted' }>
  | Readonly<{
      kind: 'http-status'
      status: number
      headers: Readonly<{ [name: string]: string }>
      body: string
    }>
  | Readonly<{ kind: 'http-stream'; messages: readonly string[]; ended: boolean }>

/**
 * The request an event is classified for: its JSON-RPC id, its class, and whether it carried the
 * legacy session (the `Mcp-Session-Id` header, or the endpoint of the legacy HTTP+SSE mode).
 * `versions` are the modern versions the transport speaks. `mode` is `sse` in the legacy HTTP+SSE
 * mode (SPEC T3): there a 2xx POST body ends with no answer as a matter of course, because the
 * answer comes on the shared stream.
 */
export type WireContext = Readonly<{
  id: string | number
  request: RequestClass
  session: boolean
  versions: readonly string[]
  mode?: 'sse'
}>

/**
 * The classification of an event. `answer`: the event is this answer class for the request;
 * `message` is the parsed message the class was read from, when the class has one: the answer
 * to the request (a result or error class), or the JSON-RPC error body of an HTTP error status.
 * `other`: a stdio line that is not about this request (the answer to another request, a
 * request or notification of the peer, other JSON). `waiting`: a 2xx stream that is still open
 * without an answer to the request; it is no class yet.
 */
export type WireClassification =
  | Readonly<{ kind: 'answer'; answer: AnswerClass; message?: JsonObject }>
  | Readonly<{ kind: 'other' }>
  | Readonly<{ kind: 'waiting' }>

/**
 * A request or notification of the peer, as T3 reads it: a JSON object with a text `method`; a
 * request when it carries an `id` (echoed as written in the response), a notification
 * otherwise. `progressToken` is the token of a progress notification as text: a string value or
 * a number lexeme.
 */
export type PeerMessage =
  | Readonly<{ kind: 'request'; id: JsonValue; method: string }>
  | Readonly<{ kind: 'notification'; method: string; params?: JsonValue; progressToken?: string }>

/**
 * The limits of what a transport reads from the wire (SPEC T2): the byte bound of one stdio line,
 * one HTTP body or one SSE event (16 MiB), and the JSON limits a message is parsed with. A
 * transport reads with these and parses nothing with others.
 */
export const WIRE_LIMITS = {
  maxBytes: 16_777_216,
  maxDepth: 128,
  maxItems: 1_000_000,
  maxMembers: 100_000,
  maxStringLength: 16_777_216,
  maxNumberLength: 100,
} as const

const INTEGER = /^-?\d+$/u
const STATUS_CLASSES: Readonly<{ [status: number]: HttpStatusClass }> = {
  400: '400',
  404: '404',
  405: '405',
  406: '406',
  415: '415',
  429: '429',
}

const answer = (value: AnswerClass, message?: JsonObject): WireClassification =>
  message === undefined
    ? { kind: 'answer', answer: value }
    : { kind: 'answer', answer: value, message }

function parse(text: string): JsonValue | undefined {
  const read = readJsonText(text, WIRE_LIMITS)
  return read.kind === 'ok' ? read.value : undefined
}

/** The progress token of a notification's `params` as text, when it has one. */
function progressTokenOf(params: JsonValue | undefined): string | undefined {
  const token = isObject(params) ? member(params, 'progressToken') : undefined
  if (token?.kind === 'string') return token.value
  return token?.kind === 'number' ? token.lexeme : undefined
}

/**
 * Reads one line or stream message as a request or notification of the peer (T3), with the
 * limits of `classifyWireEvent`. Undefined for anything else: an answer, or text that is not a
 * JSON object with a text `method`.
 */
export function readPeerMessage(text: string): PeerMessage | undefined {
  const message = parse(text)
  const method = isObject(message) ? textOf(member(message, 'method')) : undefined
  if (!isObject(message) || method === undefined) return undefined
  const id = member(message, 'id')
  if (id !== undefined) return { kind: 'request', id, method }
  const params = member(message, 'params')
  const progressToken = progressTokenOf(params)
  return {
    kind: 'notification',
    method,
    ...(params === undefined ? {} : { params }),
    ...(progressToken === undefined ? {} : { progressToken }),
  }
}

/** The id of a message as text for comparison, or undefined when it has no string or number id. */
function idOf(message: JsonObject): string | undefined {
  const id = member(message, 'id')
  if (id?.kind === 'string') return `s:${id.value}`
  if (id?.kind === 'number') return `n:${id.lexeme}`
  return undefined
}

function sameId(message: JsonObject, id: string | number): boolean {
  return idOf(message) === (typeof id === 'string' ? `s:${id}` : `n:${String(id)}`)
}

/**
 * The JSON-RPC envelope of an answer: `jsonrpc` is `"2.0"` and exactly one of `result` and
 * `error` is present (SPEC T2).
 */
export function envelopeOf(
  message: JsonObject,
): Readonly<{ result: JsonValue }> | Readonly<{ error: JsonValue }> | undefined {
  if (textOf(member(message, 'jsonrpc')) !== '2.0') return undefined
  const result = member(message, 'result')
  const error = member(message, 'error')
  if (result !== undefined && error === undefined) return { result }
  if (error !== undefined && result === undefined) return { error }
  return undefined
}

/** The versions a `-32022` lists, or undefined when `data.supported` is no non-empty text list. */
export function supportedOf(data: JsonValue | undefined): readonly string[] | undefined {
  const items = isObject(data) ? itemsOf(member(data, 'supported')) : undefined
  if (items === undefined || items.length === 0) return undefined
  const texts = items.flatMap(item => (item.kind === 'string' ? [item.value] : []))
  return texts.length === items.length ? texts : undefined
}

/** The class of a JSON-RPC error object (SPEC T2: an object with an integer code and a text message). */
export function errorClassOf(error: JsonValue, versions: readonly string[]): ErrorClass {
  if (!isObject(error)) return 'unreadable'
  const code = member(error, 'code')
  if (code?.kind !== 'number' || !INTEGER.test(code.lexeme)) return 'unreadable'
  if (textOf(member(error, 'message')) === undefined) return 'unreadable'
  switch (code.lexeme) {
    case '-32020':
      return '-32020'
    case '-32021':
      return '-32021'
    case '-32601':
      return '-32601'
    case '-32602':
      return '-32602'
    case '-32022': {
      const modern = (supportedOf(member(error, 'data')) ?? []).filter(isModernProtocolVersion)
      if (modern.length === 0) return '-32022+legacy'
      return versions.some(version => modern.includes(version)) ? '-32022+common' : '-32022+modern'
    }
    default:
      return 'other'
  }
}

/** The class of a JSON-RPC result for a request class (SPEC T2, T6). */
export function resultClassOf(
  request: RequestClass,
  result: JsonValue,
  versions: readonly string[],
): ResultClass {
  switch (request) {
    case 'discover':
    case 'discover-retry': {
      const read = readDiscoverResult(result, versions)
      if ('ok' in read) return 'result'
      return read.failure === 'no-common-version' ? 'result:no-common' : 'result:unreadable'
    }
    case 'initialize':
      return 'ok' in readInitializeResult(result) ? 'result' : 'result:unreadable'
    case 'tools/list': {
      const read = readListingPage(result, false)
      return 'ok' in read ? 'result' : `result:${read.failure}`
    }
    case 'tasks/get': {
      const read = readTaskReport(result)
      return 'ok' in read ? 'result' : `result:${read.failure}`
    }
    case 'tools/call':
    case 'tasks/update':
    case 'tasks/cancel':
    case 'notification':
      return 'result'
    default: {
      const exhaustive: never = request
      return exhaustive
    }
  }
}

/** A message that answers the request: its envelope decides the class; a bad envelope is unreadable. */
function messageClassOf(message: JsonObject, context: WireContext): AnswerClass {
  const envelope = envelopeOf(message)
  if (envelope === undefined) return 'error:unreadable'
  if ('result' in envelope) return resultClassOf(context.request, envelope.result, context.versions)
  return `error:${errorClassOf(envelope.error, context.versions)}`
}

/** True for a message that answers the request: an object with the request's id and no method. */
function answers(message: JsonValue | undefined, context: WireContext): message is JsonObject {
  return isObject(message) && member(message, 'method') === undefined && sameId(message, context.id)
}

/** The body class of an HTTP error answer, with the message it was read from. Its id is not checked (SPEC T2). */
function bodyClassOf(
  body: string,
  versions: readonly string[],
): Readonly<{ body: BodyClass; message?: JsonObject }> {
  const message = parse(body)
  const envelope = isObject(message) ? envelopeOf(message) : undefined
  if (!isObject(message) || envelope === undefined || !('error' in envelope))
    return { body: 'plain' }
  return { body: errorClassOf(envelope.error, versions), message }
}

function statusClassOf(status: number): HttpStatusClass {
  if (status >= 500) return '5xx'
  return STATUS_CLASSES[status] ?? '4xx'
}

function httpStatusOf(
  event: Extract<WireEvent, { kind: 'http-status' }>,
  context: WireContext,
): WireClassification {
  const { status } = event
  if (status >= 200 && status < 300) return answer('http:2xx')
  if (status === 401) return answer('http:401')
  if (status === 403) {
    const challenge = event.headers['www-authenticate'] ?? ''
    return answer(/error="insufficient_scope"/iu.test(challenge) ? 'http:403+scope' : 'http:403')
  }
  if (status === 404 && context.session) return answer('http:404+session')
  const read = bodyClassOf(event.body, context.versions)
  return answer(`http:${statusClassOf(status)}+${read.body}`, read.message)
}

/**
 * The cause the end of a stdio shared stream stands for (SPEC T8): stdout ended, the root process
 * exited, or both. The exit is the cause when it came, and came no later than
 * `PROCESS_EXIT_WINDOW_MS` after stdout ended; otherwise the stream broke.
 */
export function endedCauseOf(
  event: Readonly<{ stdoutEndedAt?: number; exitedAt?: number }>,
): 'process-exited' | 'stream-broken' {
  const { stdoutEndedAt, exitedAt } = event
  if (exitedAt === undefined) return 'stream-broken'
  const exitFirst =
    stdoutEndedAt === undefined || exitedAt - stdoutEndedAt <= PROCESS_EXIT_WINDOW_MS
  return exitFirst ? 'process-exited' : 'stream-broken'
}

/** A stdio line: the answer when it carries the request's id and no method; `other` for the rest. */
function lineOf(
  event: Extract<WireEvent, { kind: 'line' }>,
  context: WireContext,
): WireClassification {
  const message = parse(event.text)
  return message !== undefined && answers(message, context)
    ? answer(messageClassOf(message, context), message)
    : { kind: 'other' }
}

/**
 * A 2xx answer: the first message that answers the request; else `http:2xx` once the body ended,
 * or `waiting` while it is open, and in the legacy HTTP+SSE mode even when it ended.
 */
function httpStreamOf(
  event: Extract<WireEvent, { kind: 'http-stream' }>,
  context: WireContext,
): WireClassification {
  for (const text of event.messages) {
    const message = parse(text)
    if (answers(message, context)) return answer(messageClassOf(message, context), message)
  }
  return event.ended && context.mode !== 'sse' ? answer('http:2xx') : { kind: 'waiting' }
}

/**
 * Puts one wire event into its T8 answer class for one request (SPEC T2, T8), one function per
 * event kind. A stdio line that is not JSON is dropped (`other`); the stream goes on. A line or a
 * 2xx message that carries the request's id and no method is the answer; its envelope and content
 * decide the class. When stdout ended and the process exited, the exit is the cause when it came
 * within `PROCESS_EXIT_WINDOW_MS` after stdout ended (`endedCauseOf`). In the legacy HTTP+SSE mode
 * a 2xx body that ended with no answer is still `waiting`: the answer comes on the shared stream.
 */
export function classifyWireEvent(event: WireEvent, context: WireContext): WireClassification {
  switch (event.kind) {
    case 'unsent':
      return answer('unsent')
    case 'nothing':
      return answer('silent')
    case 'line':
      return lineOf(event, context)
    case 'stdio-ended':
      return answer(endedCauseOf(event))
    case 'http-aborted':
      return answer('stream-broken')
    case 'http-status':
      return httpStatusOf(event, context)
    case 'http-stream':
      return httpStreamOf(event, context)
    default: {
      const exhaustive: never = event
      return exhaustive
    }
  }
}
