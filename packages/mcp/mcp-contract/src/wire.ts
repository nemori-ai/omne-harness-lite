import { readJsonText, type JsonValue } from '@omne-harness/json-text'
import { isObject, itemsOf, member, textOf, type JsonObject } from './json.ts'
import {
  readDiscoverResult,
  readInitializeResult,
  readListingPage,
  readTaskReport,
} from './readers.ts'
import { isModernProtocolVersion } from './revisions.ts'

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

export const HTTP_STATUS_CLASSES = ['400', '404', '405', '406', '415', '429', '4xx', '5xx'] as const

export type HttpStatusClass = (typeof HTTP_STATUS_CLASSES)[number]

export type BodyClass = ErrorClass | 'plain'

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

export const PROCESS_EXIT_WINDOW_MS = 100

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

export type WireContext = Readonly<{
  id: string | number
  request: RequestClass
  session: boolean
  versions: readonly string[]
  mode?: 'sse'
}>

export type WireClassification =
  | Readonly<{ kind: 'answer'; answer: AnswerClass; message?: JsonObject }>
  | Readonly<{ kind: 'other' }>
  | Readonly<{ kind: 'waiting' }>

export type PeerMessage =
  | Readonly<{ kind: 'request'; id: JsonValue; method: string }>
  | Readonly<{ kind: 'notification'; method: string; params?: JsonValue; progressToken?: string }>

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

function progressTokenOf(params: JsonValue | undefined): string | undefined {
  const token = isObject(params) ? member(params, 'progressToken') : undefined
  if (token?.kind === 'string') return token.value
  return token?.kind === 'number' ? token.lexeme : undefined
}

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

function idOf(message: JsonObject): string | undefined {
  const id = member(message, 'id')
  if (id?.kind === 'string') return `s:${id.value}`
  if (id?.kind === 'number') return `n:${id.lexeme}`
  return undefined
}

function sameId(message: JsonObject, id: string | number): boolean {
  return idOf(message) === (typeof id === 'string' ? `s:${id}` : `n:${String(id)}`)
}

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

export function supportedOf(data: JsonValue | undefined): readonly string[] | undefined {
  const items = isObject(data) ? itemsOf(member(data, 'supported')) : undefined
  if (items === undefined || items.length === 0) return undefined
  const texts = items.flatMap(item => (item.kind === 'string' ? [item.value] : []))
  return texts.length === items.length ? texts : undefined
}

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

function messageClassOf(message: JsonObject, context: WireContext): AnswerClass {
  const envelope = envelopeOf(message)
  if (envelope === undefined) return 'error:unreadable'
  if ('result' in envelope) return resultClassOf(context.request, envelope.result, context.versions)
  return `error:${errorClassOf(envelope.error, context.versions)}`
}

function answers(message: JsonValue | undefined, context: WireContext): message is JsonObject {
  return isObject(message) && member(message, 'method') === undefined && sameId(message, context.id)
}

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

export function endedCauseOf(
  event: Readonly<{ stdoutEndedAt?: number; exitedAt?: number }>,
): 'process-exited' | 'stream-broken' {
  const { stdoutEndedAt, exitedAt } = event
  if (exitedAt === undefined) return 'stream-broken'
  const exitFirst =
    stdoutEndedAt === undefined || exitedAt - stdoutEndedAt <= PROCESS_EXIT_WINDOW_MS
  return exitFirst ? 'process-exited' : 'stream-broken'
}

function lineOf(
  event: Extract<WireEvent, { kind: 'line' }>,
  context: WireContext,
): WireClassification {
  const message = parse(event.text)
  return message !== undefined && answers(message, context)
    ? answer(messageClassOf(message, context), message)
    : { kind: 'other' }
}

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
