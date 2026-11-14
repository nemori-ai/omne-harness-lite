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

export function createHttpProtocolTransport(options: HttpProtocolTransportOptions): Transport {
  const origin = originOf(options.origin)
  const limits = options.limits ?? defaultLimits
  const urlOf = (protocol: ProtocolKey, name: string): URL =>
    new URL(`/api/${protocol.name}/v${protocol.major}/${name}`, origin)

  async function headersOf(messageId: string): Promise<Record<string, string>> {
    const credentials = (await options.credentials?.()) ?? {}
    return {
      'content-type': 'application/json',
      'omne-message-id': messageId,
      ...(credentials.proof === undefined ? {} : { authorization: `Bearer ${credentials.proof}` }),
      ...(credentials.tenant === undefined ? {} : { 'omne-acting-tenant': credentials.tenant }),
    }
  }

  async function send(
    url: URL,
    messageId: string,
    payload: JsonValue,
    signal: AbortSignal | undefined,
  ): Promise<Response | 'not-sent' | 'uncertain'> {
    if (signal?.aborted === true) return 'not-sent'
    const headers = await headersOf(messageId)
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
    const response = await send(url, request.messageId, request.body, request.signal)
    if (typeof response === 'string') return { kind: response }
    try {
      if (mediaType(response) !== 'application/json') {
        await response.body?.cancel()
        return UNCERTAIN
      }
      return answerOf(await response.text(), limits)
    } catch {
      return UNCERTAIN
    }
  }

  async function opening(request: ObserveRequest): Promise<EventReader | ObserveEnd> {
    const { signal } = request
    const url = urlOf(request.protocol, request.observation)
    const response = await send(url, request.messageId, request.open, signal)
    if (typeof response === 'string') return signal.aborted ? ABORTED : { kind: response }
    if (mediaType(response) === 'application/json') {
      const refused = answerOf(await response.text(), limits)
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
