// The Streamable HTTP line: one POST per message to the connection target, the answer in the
// JSON body or as SSE events, no redirects followed, no timeout of its own. It also carries the
// legacy HTTP+SSE mode (contract T3): after `enterSse`, messages post to the endpoint the peer
// named and the answers come on the shared GET stream as `line` events. The line puts the
// credential's headers on the wire and nowhere else; it reports what the wire did and classifies
// nothing.
import { EventSourceParserStream, type EventSourceMessage } from 'eventsource-parser/stream'
import { BYTE_LIMIT } from './limits.ts'
import type { Exchange, Line, LineEvent, Outbound, SseEntry } from './line.ts'
import { AsyncQueue } from './queue.ts'

type Fetch = typeof fetch

/**
 * The `cause.code` values of a `fetch` failure before the connection was made (contract T8:
 * "the request failed before it left"). Anything else after the request started is a broken
 * stream. The TLS codes are those of a failed handshake.
 */
const UNSENT_CODES: readonly string[] = [
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EADDRNOTAVAIL',
  'UND_ERR_CONNECT_TIMEOUT',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'CERT_HAS_EXPIRED',
]

function codeOf(error: unknown): string | undefined {
  const cause: unknown = error instanceof Error ? error.cause : undefined
  if (typeof cause !== 'object' || cause === null || !('code' in cause)) return undefined
  return typeof cause.code === 'string' ? cause.code : undefined
}

/** `unsent` for a connection that was not made; `aborted` for a request that started to go out. */
function failedExchange(error: unknown): Exchange {
  const code = codeOf(error)
  const unsent = code !== undefined && (UNSENT_CODES.includes(code) || code.startsWith('ERR_SSL_'))
  return { kind: unsent ? 'unsent' : 'aborted' }
}

function headersOf(response: Response): Readonly<{ [name: string]: string }> {
  const headers: { [name: string]: string } = {}
  response.headers.forEach((value, name) => {
    headers[name.toLowerCase()] = value
  })
  return headers
}

function mediaTypeOf(response: Response): string {
  return (response.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
}

/** The whole body as text, up to the byte bound; above it the body counts as broken. */
async function bodyOf(response: Response): Promise<string> {
  const body = response.body
  if (body === null) return ''
  const decoder = new TextDecoder()
  let bytes = 0
  let text = ''
  for await (const chunk of body) {
    bytes += chunk.byteLength
    if (bytes > BYTE_LIMIT) {
      await body.cancel().catch(() => undefined)
      throw new RangeError('the body is above the byte bound')
    }
    text += decoder.decode(chunk, { stream: true })
  }
  return text + decoder.decode()
}

/** The events of an SSE body. */
function eventsOf(body: ReadableStream<Uint8Array>): ReadableStream<EventSourceMessage> {
  return body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new EventSourceParserStream({ maxBufferSize: BYTE_LIMIT }))
}

/** The JSON-RPC messages of a 2xx answer: the JSON body as one, the data of each SSE message event. */
async function* messagesOf(response: Response): AsyncGenerator<string> {
  const type = mediaTypeOf(response)
  if (type === 'application/json') {
    yield await bodyOf(response)
    return
  }
  if (type !== 'text/event-stream' || response.body === null) {
    await bodyOf(response).catch(() => undefined)
    return
  }
  for await (const event of eventsOf(response.body))
    if (event.event === undefined || event.event === 'message') yield event.data
}

export class HttpLine implements Line {
  readonly kind = 'streamable-http'
  readonly events: AsyncIterable<LineEvent>
  readonly enterSse: (headers: Headers, signal: AbortSignal) => Promise<SseEntry>
  private readonly queue = new AsyncQueue<LineEvent>()
  private readonly target: string
  private readonly fetch: Fetch
  private readonly controllers = new Set<AbortController>()
  /** The endpoint of the legacy HTTP+SSE mode, once entered. */
  private endpoint: string | undefined
  private closed = false

  constructor(target: string, fetchFn: Fetch) {
    this.target = target
    this.fetch = fetchFn
    this.events = this.queue
    this.enterSse = (headers, signal) => this.tryEnterSse(headers, signal)
  }

  /** An abort controller for one exchange, aborted with the caller's signal and on close. */
  private controllerFor(signal: AbortSignal): AbortController {
    const controller = new AbortController()
    this.controllers.add(controller)
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true })
    if (signal.aborted) controller.abort(signal.reason)
    return controller
  }

  async send(outbound: Outbound, signal: AbortSignal): Promise<Exchange> {
    if (this.closed) return { kind: 'unsent' }
    const controller = this.controllerFor(signal)
    const headers = new Headers(outbound.headers)
    headers.set('content-type', 'application/json')
    headers.set('accept', 'application/json, text/event-stream')
    let response: Response
    try {
      response = await this.fetch(this.endpoint ?? this.target, {
        method: 'POST',
        headers,
        body: outbound.text,
        signal: controller.signal,
        redirect: 'manual',
      })
    } catch (error) {
      this.controllers.delete(controller)
      return controller.signal.aborted ? { kind: 'aborted' } : failedExchange(error)
    }
    const answered = headersOf(response)
    if (!response.ok) {
      const body = await bodyOf(response).catch(() => '')
      this.controllers.delete(controller)
      return { kind: 'status', status: response.status, headers: answered, body }
    }
    const messages = messagesOf(response)
    const release = () => this.controllers.delete(controller)
    return {
      kind: 'stream',
      headers: answered,
      messages: {
        [Symbol.asyncIterator]: () => {
          const iterator = messages[Symbol.asyncIterator]()
          return {
            next: () =>
              iterator.next().then(
                result => {
                  if (result.done) release()
                  return result
                },
                error => {
                  release()
                  throw error
                },
              ),
            return: () => {
              release()
              controller.abort()
              return iterator.return(undefined)
            },
          }
        },
      },
      abort: () => controller.abort(),
    }
  }

  /**
   * The legacy HTTP+SSE fallback (T3): GET the target; a 200 `text/event-stream` whose first
   * event is a same-origin `endpoint` enters the mode. The stream then carries the answers.
   */
  private async tryEnterSse(headers: Headers, signal: AbortSignal): Promise<SseEntry> {
    if (this.closed || this.endpoint !== undefined) return { kind: 'unavailable' }
    const controller = this.controllerFor(signal)
    const sent = new Headers(headers)
    sent.set('accept', 'text/event-stream')
    let response: Response
    try {
      response = await this.fetch(this.target, {
        method: 'GET',
        headers: sent,
        signal: controller.signal,
        redirect: 'manual',
      })
    } catch (error) {
      this.controllers.delete(controller)
      return failedExchange(error).kind === 'unsent' ? { kind: 'unsent' } : { kind: 'unavailable' }
    }
    if (response.status !== 200) {
      const body = await bodyOf(response).catch(() => '')
      this.controllers.delete(controller)
      if (response.status >= 200 && response.status < 300) return { kind: 'unavailable' }
      return { kind: 'status', status: response.status, headers: headersOf(response), body }
    }
    if (mediaTypeOf(response) !== 'text/event-stream' || response.body === null) {
      controller.abort()
      this.controllers.delete(controller)
      return { kind: 'unavailable' }
    }
    const reader = eventsOf(response.body).getReader()
    const first = await reader.read().then(
      result => (result.done ? undefined : result.value),
      () => undefined,
    )
    const endpoint = first === undefined ? undefined : this.endpointOf(first)
    if (endpoint === undefined) {
      controller.abort()
      await reader.cancel().catch(() => undefined)
      this.controllers.delete(controller)
      return { kind: 'unavailable' }
    }
    this.endpoint = endpoint
    void this.readSharedStream(reader, controller)
    return { kind: 'entered' }
  }

  /** The endpoint of an `endpoint` event, when it resolves to the origin of the target. */
  private endpointOf(event: EventSourceMessage): string | undefined {
    if (event.event !== 'endpoint') return undefined
    let url: URL
    try {
      url = new URL(event.data, this.target)
    } catch {
      return undefined
    }
    return url.origin === new URL(this.target).origin ? url.href : undefined
  }

  /** The shared stream of the SSE mode: each message event is a line; its end breaks the line. */
  private async readSharedStream(
    reader: ReadableStreamDefaultReader<EventSourceMessage>,
    controller: AbortController,
  ): Promise<void> {
    try {
      for (;;) {
        const next = await reader.read()
        if (next.done) break
        if (next.value.event === undefined || next.value.event === 'message')
          this.queue.push({ kind: 'line', text: next.value.data })
      }
    } catch {
      // The stream broke: the same event as its end.
    }
    this.controllers.delete(controller)
    if (!this.closed) this.queue.push({ kind: 'broken' })
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    for (const controller of this.controllers) controller.abort()
    this.controllers.clear()
    this.queue.end()
  }
}
