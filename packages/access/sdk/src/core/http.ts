import { createParser } from 'eventsource-parser'
import {
  readJsonText,
  writeJsonText,
  type JsonLimits,
  type JsonValue,
} from '@omne-harness/json-text'
import { defaultLimits } from '../limits.ts'
import type {
  CallReport,
  CallRequest,
  ObserveEnd,
  ObserveRequest,
  ProtocolKey,
  Transport,
} from './transport.ts'
import { neverWritten } from '../never-written.ts'

export type Credentials = { readonly proof?: string; readonly tenant?: string }

export type HttpProtocolTransportOptions = {
  readonly origin: string
  readonly credentials?: () => Credentials | Promise<Credentials>
  readonly limits?: JsonLimits
}

const UNCERTAIN: CallReport = Object.freeze({ kind: 'uncertain' })

function originOf(text: string): URL {
  const refusal = new TypeError('origin must be an http or https origin')
  let url: URL
  try {
    url = new URL(text)
  } catch {
    throw refusal
  }
  const plain = url.username === '' && url.password === ''
  const bare = url.pathname === '/' && url.search === '' && url.hash === ''
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !plain || !bare) throw refusal
  return url
}

function mediaType(response: Response): string | undefined {
  return response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
}

function member(value: JsonValue, key: string): JsonValue | undefined {
  if (value.kind !== 'object') return undefined
  return value.entries.find(entry => entry.key === key)?.value
}

function text(value: JsonValue | undefined): string | undefined {
  return value?.kind === 'string' ? value.value : undefined
}

function answerOf(source: string, limits: JsonLimits): CallReport {
  const read = readJsonText(source, limits)
  if (read.kind !== 'ok') return UNCERTAIN
  const outcome = text(member(read.value, 'outcome'))
  const body = member(read.value, 'body')
  if (outcome === undefined || body?.kind !== 'object') return UNCERTAIN
  return { kind: 'answered', outcome, body }
}

type EventReader = ReadableStreamDefaultReader<string>

const ABORTED: ObserveEnd = Object.freeze({ kind: 'aborted' })
const STOPPED: ObserveEnd = Object.freeze({ kind: 'uncertain' })
const NOT_SENT = Object.freeze({ kind: 'not-sent' as const })

const NOT_EXECUTED: readonly (string | undefined)[] = ['not-offered', 'not-mounted', 'conflict']

/** The server says what was asked for is not provided. Nothing ran, so it is as if nothing was sent. */
function notOffered(response: Response, source: string, limits: JsonLimits): boolean {
  if (response.status !== 404) return false
  const read = readJsonText(source, limits)
  if (read.kind !== 'ok' || read.value.kind !== 'object' || read.value.entries.length !== 2)
    return false
  const reason = text(member(read.value, 'reason'))
  return text(member(read.value, 'kind')) === 'not-executed' && NOT_EXECUTED.includes(reason)
}

function eventOf(
  data: string,
  limits: JsonLimits,
): { readonly frame: JsonValue } | { readonly end: ObserveEnd } {
  const read = readJsonText(data, limits)
  if (read.kind !== 'ok') return { end: STOPPED }
  const kind = text(member(read.value, 'kind'))
  if (kind === 'ended') {
    const reason = text(member(read.value, 'reason'))
    return { end: reason === undefined ? STOPPED : { kind: 'ended', reason } }
  }
  const frame = member(read.value, 'frame')
  return kind === 'frame' && frame !== undefined ? { frame } : { end: STOPPED }
}

type Sent = Readonly<{ messageId: string; revision?: number }>

export function createHttpProtocolTransport(options: HttpProtocolTransportOptions): Transport {
  const origin = originOf(options.origin)
  const limits = options.limits ?? defaultLimits
  const urlOf = (protocol: ProtocolKey, name: string): URL =>
    new URL(`/api/${protocol.name}/v${protocol.major}/${name}`, origin)

  async function headersOf(sent: Sent): Promise<Record<string, string>> {
    const credentials = (await options.credentials?.()) ?? {}
    return {
      'content-type': 'application/json',
      'omne-message-id': sent.messageId,
      ...(sent.revision === undefined ? {} : { 'omne-contract-revision': String(sent.revision) }),
      ...(credentials.proof === undefined ? {} : { authorization: `Bearer ${credentials.proof}` }),
      ...(credentials.tenant === undefined ? {} : { 'omne-acting-tenant': credentials.tenant }),
    }
  }

  async function send(
    url: URL,
    sent: Sent,
    payload: JsonValue,
    signal: AbortSignal | undefined,
  ): Promise<Response | 'not-sent' | 'uncertain'> {
    if (signal?.aborted === true) return 'not-sent'
    const headers = await headersOf(sent)
    try {
      return await fetch(url, {
        method: 'POST',
        headers,
        body: writeJsonText(payload),
        redirect: 'manual',
        cache: 'no-store',
        ...(signal === undefined ? {} : { signal }),
      })
    } catch (error) {
      return neverWritten(error) ? 'not-sent' : 'uncertain'
    }
  }

  async function call(request: CallRequest): Promise<CallReport> {
    const url = urlOf(request.protocol, request.operation)
    const response = await send(url, request, request.body, request.signal)
    if (typeof response === 'string') return { kind: response }
    try {
      if (mediaType(response) !== 'application/json') {
        await response.body?.cancel()
        return UNCERTAIN
      }
      const source = await response.text()
      return notOffered(response, source, limits) ? NOT_SENT : answerOf(source, limits)
    } catch {
      return UNCERTAIN
    }
  }

  async function opening(request: ObserveRequest): Promise<EventReader | ObserveEnd> {
    const { signal } = request
    const url = urlOf(request.protocol, request.observation)
    const response = await send(url, request, request.open, signal)
    if (typeof response === 'string') return signal.aborted ? ABORTED : { kind: response }
    if (mediaType(response) === 'application/json') {
      const source = await response.text()
      if (notOffered(response, source, limits)) return NOT_SENT
      const refused = answerOf(source, limits)
      return refused.kind === 'answered' ? { kind: 'refused', outcome: refused.outcome } : STOPPED
    }
    const body = response.body
    if (response.status !== 200 || mediaType(response) !== 'text/event-stream' || body === null) {
      await body?.cancel()
      return STOPPED
    }
    return body.pipeThrough(new TextDecoderStream()).getReader()
  }

  async function* events(
    reader: EventReader,
    signal: AbortSignal,
  ): AsyncGenerator<JsonValue, ObserveEnd> {
    const queue: string[] = []
    const parser = createParser({ onEvent: event => queue.push(event.data) })
    try {
      for (;;) {
        for (let data = queue.shift(); data !== undefined; data = queue.shift()) {
          const event = eventOf(data, limits)
          if ('end' in event) return event.end
          yield event.frame
        }
        const chunk = await reader.read().catch(() => undefined)
        if (chunk === undefined) return signal.aborted ? ABORTED : STOPPED
        if (chunk.done) return STOPPED
        parser.feed(chunk.value)
      }
    } finally {
      await reader.cancel().catch(() => {})
    }
  }

  async function* observe(request: ObserveRequest): AsyncGenerator<JsonValue, ObserveEnd> {
    const opened = await opening(request)
    if ('kind' in opened) return opened
    return yield* events(opened, request.signal)
  }

  return { call, observe }
}
