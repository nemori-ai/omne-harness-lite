// The Streamable HTTP line: one POST per message to the connection target, the answer in the
// JSON body or as SSE events, no redirects followed, no timeout of its own. It also carries the
// legacy HTTP+SSE mode (contract T3): after the session enters it on a GET, messages post to the
// endpoint the peer named and the answers come on the shared GET stream as `line` events. The line
// puts the credential's headers on the wire and nowhere else; it reports what the wire did and
// classifies nothing, and judges nothing.
import { EventSourceParserStream, type EventSourceMessage } from 'eventsource-parser/stream'
import { bodyOf } from './body.ts'
import { BYTE_LIMIT } from './limits.ts'
import type {
  AnswerHeaders,
  Exchange,
  FirstEvent,
  GetOpened,
  Line,
  LineEvent,
  Outbound,
} from './line.ts'
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

function headersOf(response: Response): AnswerHeaders {
  const headers: { [name: string]: string } = {}
  response.headers.forEach((value, name) => {
    headers[name.toLowerCase()] = value
  })
  return headers
}

function mediaTypeOf(response: Response): string {
  return (response.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
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

/** One exchange's abort controller, linked to the caller's signal, with a way to unlink it. */
type Linked = Readonly<{ controller: AbortController; unlink: () => void }>

export class HttpLine implements Line {
  readonly kind = 'streamable-http'
  readonly events: AsyncIterable<LineEvent>
  readonly openGet: (headers: Headers, signal: AbortSignal) => Promise<GetOpened>
  private readonly queue = new AsyncQueue<LineEvent>()
  private readonly target: string
  private readonly fetch: Fetch
  private readonly controllers = new Set<AbortController>()
  /** The endpoint of the legacy HTTP+SSE mode, once the session entered it. */
  private endpoint: string | undefined
  private closed = false

  constructor(target: string, fetchFn: Fetch) {
    this.target = target
    this.fetch = fetchFn
    this.events = this.queue
    this.openGet = (headers, signal) => this.getStream(headers, signal)
  }

  /** An abort controller for one exchange, aborted with the caller's signal and on close. */
  private link(signal: AbortSignal): Linked {
    const controller = new AbortController()
    this.controllers.add(controller)
    const onAbort = () => controller.abort(signal.reason)
    if (signal.aborted) controller.abort(signal.reason)
    else signal.addEventListener('abort', onAbort)
    return {
      controller,
      unlink: () => {
        signal.removeEventListener('abort', onAbort)
        this.controllers.delete(controller)
      },
    }
  }

  async send(outbound: Outbound, signal: AbortSignal): Promise<Exchange> {
    if (this.closed) return { kind: 'unsent' }
    const linked = this.link(signal)
    const headers = new Headers(outbound.headers)
    headers.set('content-type', 'application/json')
    headers.set('accept', 'application/json, text/event-stream')
    let response: Response
    try {
      response = await this.fetch(this.endpoint ?? this.target, {
        method: 'POST',
        headers,
        body: outbound.text,
        signal: linked.controller.signal,
        redirect: 'manual',
      })
    } catch (error) {
      linked.unlink()
      return linked.controller.signal.aborted ? { kind: 'aborted' } : failedExchange(error)
    }
    const answered = headersOf(response)
    if (!response.ok) {
      const body = await bodyOf(response).catch(() => '')
      linked.unlink()
      return { kind: 'status', status: response.status, headers: answered, body }
    }
    return {
      kind: 'stream',
      headers: answered,
      messages: this.stream(response, linked),
      abort: () => linked.controller.abort(),
    }
  }

  /** The messages of a 2xx answer; the exchange is unlinked when the body ends, breaks or is let go. */
  private stream(response: Response, linked: Linked): AsyncIterable<string> {
    const messages = messagesOf(response)
    return {
      [Symbol.asyncIterator]: () => {
        const iterator = messages[Symbol.asyncIterator]()
        return {
          next: () =>
            iterator.next().then(
              result => {
                if (result.done) linked.unlink()
                return result
              },
              error => {
                linked.unlink()
                throw error
              },
            ),
          return: () => {
            linked.unlink()
            linked.controller.abort()
            return iterator.return(undefined)
          },
        }
      },
    }
  }

  /**
   * The GET of the legacy HTTP+SSE fallback (T3): GET the target and report what came back. The
   * session judges whether the fallback holds; this reports the status, the headers, and the first
   * event when the body was an SSE stream, and keeps or discards the stream on the session's word.
   */
  private async getStream(headers: Headers, signal: AbortSignal): Promise<GetOpened> {
    if (this.closed || this.endpoint !== undefined) return { kind: 'unavailable' }
    const linked = this.link(signal)
    const sent = new Headers(headers)
    sent.set('accept', 'text/event-stream')
    let response: Response
    try {
      response = await this.fetch(this.target, {
        method: 'GET',
        headers: sent,
        signal: linked.controller.signal,
        redirect: 'manual',
      })
    } catch (error) {
      linked.unlink()
      return failedExchange(error).kind === 'unsent' ? { kind: 'unsent' } : { kind: 'unavailable' }
    }
    if (response.status < 200 || response.status >= 300) {
      const body = await bodyOf(response).catch(() => '')
      linked.unlink()
      return { kind: 'status', status: response.status, headers: headersOf(response), body }
    }
    return this.openStream(response, linked)
  }

  /** A 2xx GET answer: its first SSE event when it has one, and the handles to keep or discard it. */
  private async openStream(response: Response, linked: Linked): Promise<GetOpened> {
    const answered = headersOf(response)
    const reader =
      mediaTypeOf(response) === 'text/event-stream' && response.body !== null
        ? eventsOf(response.body).getReader()
        : undefined
    const first = reader === undefined ? undefined : await firstEventOf(reader)
    return {
      kind: 'stream',
      status: response.status,
      headers: answered,
      first,
      enter: endpoint => {
        this.endpoint = endpoint
        if (reader === undefined) linked.unlink()
        else void this.readSharedStream(reader, linked)
      },
      discard: () => {
        linked.unlink()
        linked.controller.abort()
        if (reader !== undefined) void reader.cancel().catch(() => undefined)
        else void response.body?.cancel().catch(() => undefined)
      },
    }
  }

  /** The shared stream of the SSE mode: each message event is a line; its end breaks the line. */
  private async readSharedStream(
    reader: ReadableStreamDefaultReader<EventSourceMessage>,
    linked: Linked,
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
    linked.unlink()
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

/** The first event of a GET stream, or undefined when it ends or breaks before one. */
async function firstEventOf(
  reader: ReadableStreamDefaultReader<EventSourceMessage>,
): Promise<FirstEvent | undefined> {
  const result = await reader.read().then(
    read => (read.done ? undefined : read.value),
    () => undefined,
  )
  if (result === undefined) return undefined
  return result.event === undefined
    ? { data: result.data }
    : { event: result.event, data: result.data }
}
