// An in-memory line for the session's unit tests: it answers each outgoing message from a script
// of replies by method, records what went out, and lets a test push events of the shared stream.
// It is not a wire; the real lines are tested on real wires in `conformance.spec.ts`.
import type { PlainJson, PlainRecord } from '@omne-harness/mcp-contract'
import type { Exchange, GetOpened, Line, LineEvent, Outbound } from '../src/line.ts'
import { AsyncQueue } from '../src/queue.ts'

/**
 * What the fallback GET gives back in a unit test. `entered` is a held fallback: a 200
 * `text/event-stream` whose first event is a same-origin `endpoint`. The others are the GET that
 * does not hold: a non-2xx status, a connection that was not made, or a stream without the endpoint.
 */
export type SseConfig =
  | Readonly<{ kind: 'entered'; gate?: Promise<void> }>
  | Readonly<{
      kind: 'status'
      status: number
      headers?: Readonly<{ [name: string]: string }>
      body?: string
    }>
  | Readonly<{ kind: 'unsent' }>
  | Readonly<{ kind: 'unavailable' }>

/**
 * How the line answers one message. `message` answers with a JSON-RPC message that gets the
 * request's id (a stdio line, or a 2xx body on HTTP). `status` is an HTTP error status. `empty`
 * is a 2xx with no message. `silent` never answers (on HTTP: a stream that stays open). `unsent`
 * fails before the message leaves. `aborted` fails before the HTTP answer head. `ended` and
 * `broken` answer `sent` and then push that event on the shared stream. `hang` is a write that
 * does not return until its signal fires, then reports `aborted`; `late-stream` is the same wait
 * ending in a 2xx answer stream, as when the wire answered while the signal was firing. `deaf` is
 * a 2xx answer stream that stays open and never looks at the signal: only `abort()` ends it.
 */
export type Reply =
  | Readonly<{
      kind: 'message'
      message: PlainRecord
      headers?: Readonly<{ [name: string]: string }>
      /** The message goes out without the `jsonrpc` member: an envelope that T2 refuses. */
      bare?: true
    }>
  | Readonly<{
      kind: 'status'
      status: number
      headers?: Readonly<{ [name: string]: string }>
      body?: string
    }>
  | Readonly<{ kind: 'empty' }>
  | Readonly<{ kind: 'silent' }>
  | Readonly<{ kind: 'unsent' }>
  | Readonly<{ kind: 'aborted' }>
  | Readonly<{ kind: 'ended'; stdoutEndedAt?: number; exitedAt?: number }>
  | Readonly<{ kind: 'broken' }>
  | Readonly<{ kind: 'hang' }>
  | Readonly<{ kind: 'late-stream' }>
  | Readonly<{ kind: 'deaf' }>

export type Script = Readonly<{ [method: string]: readonly Reply[] }>

export type Sent = Readonly<{
  message: PlainRecord
  headers: Readonly<{ [name: string]: string }>
  /** The text as the session wrote it: the lexemes the peer would read. */
  text: string
}>

function isRecord(value: unknown): value is PlainRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export class MemoryLine implements Line {
  readonly kind: 'stdio' | 'streamable-http'
  readonly sent: Sent[] = []
  readonly aborted: string[] = []
  /** The methods of the writes that waited for their signal and were ended by it (`hang`). */
  readonly hungAborted: string[] = []
  /** The ids of the answer streams that were ended through `abort()` and nothing else (`deaf`). */
  readonly streamAborted: string[] = []
  /** The streams of `late-stream` replies that were read to their end. */
  drained = 0
  /** The fallback GET streams the session turned down. */
  discarded = 0
  readonly queue = new AsyncQueue<LineEvent>()
  readonly events: AsyncIterable<LineEvent>
  closeCount = 0
  /** The headers of the fallback GET, when the session tried it. */
  sseAttempts: Headers[] = []
  sse = false
  private readonly script: Script
  private readonly consumed = new Map<string, number>()
  private readonly sseConfig: SseConfig | undefined

  constructor(
    kind: 'stdio' | 'streamable-http',
    script: Script,
    sse?: Readonly<{ entry: SseConfig }>,
  ) {
    this.kind = kind
    this.script = script
    this.events = this.queue
    this.sseConfig = sse?.entry
    if (kind === 'streamable-http' && sse !== undefined) this.openGet = this.getStream.bind(this)
  }

  openGet: ((headers: Headers, signal: AbortSignal) => Promise<GetOpened>) | undefined

  private async getStream(headers: Headers): Promise<GetOpened> {
    this.sseAttempts.push(headers)
    const config = this.sseConfig ?? { kind: 'unavailable' }
    switch (config.kind) {
      case 'entered':
        if (config.gate !== undefined) await config.gate
        return {
          kind: 'stream',
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
          first: { event: 'endpoint', data: '/message?sessionId=1' },
          enter: () => {
            this.sse = true
          },
          discard: () => {
            this.discarded += 1
          },
        }
      case 'status':
        return {
          kind: 'status',
          status: config.status,
          headers: config.headers ?? {},
          body: config.body ?? '',
        }
      case 'unsent':
      case 'unavailable':
        return { kind: config.kind }
      default: {
        const exhaustive: never = config
        return exhaustive
      }
    }
  }

  /** Pushes a message of the peer on the shared stream (stdio, or the SSE mode). */
  push(message: PlainJson): void {
    this.queue.push({ kind: 'line', text: JSON.stringify(message) })
  }

  pushText(text: string): void {
    this.queue.push({ kind: 'line', text })
  }

  /** The messages sent with `method`. */
  requests(method: string): readonly Sent[] {
    return this.sent.filter(entry => entry.message['method'] === method)
  }

  private pick(method: string): Reply | undefined {
    const replies = this.script[method]
    if (replies === undefined || replies.length === 0) return undefined
    const index = this.consumed.get(method) ?? 0
    this.consumed.set(method, index + 1)
    return replies[Math.min(index, replies.length - 1)]
  }

  async send(outbound: Outbound, signal: AbortSignal): Promise<Exchange> {
    const parsed: unknown = JSON.parse(outbound.text)
    if (!isRecord(parsed)) throw new TypeError('the session sent something that is not an object')
    const headers = Object.fromEntries(outbound.headers.entries())
    const method = parsed['method']
    const id = parsed['id']
    const reply =
      typeof method === 'string'
        ? (this.pick(method) ?? defaultReply(method, id !== undefined))
        : undefined
    // A message that fails before it leaves is one the peer never sees.
    if (reply?.kind === 'unsent') return { kind: 'unsent' }
    this.sent.push({ message: parsed, headers, text: outbound.text })
    if (reply?.kind === 'hang' || reply?.kind === 'late-stream')
      return this.hold(reply.kind, typeof method === 'string' ? method : '', signal)
    if (reply === undefined) return this.kind === 'stdio' ? { kind: 'sent' } : ended({})
    if (this.kind === 'stdio' || this.sse) return this.onStream(reply, id)
    return this.onHttp(reply, id, signal)
  }

  /** A write that does not return until its signal fires. */
  private hold(
    kind: 'hang' | 'late-stream',
    method: string,
    signal: AbortSignal,
  ): Promise<Exchange> {
    return new Promise<Exchange>(resolve => {
      const fired = () => {
        this.hungAborted.push(method)
        if (kind === 'hang') return resolve({ kind: 'aborted' })
        const messages = new AsyncQueue<string>()
        messages.end()
        resolve({
          kind: 'stream',
          headers: {},
          messages: {
            [Symbol.asyncIterator]: () => {
              const inner = messages[Symbol.asyncIterator]()
              return {
                next: async () => {
                  const next = await inner.next()
                  if (next.done) this.drained += 1
                  return next
                },
              }
            },
          },
          abort: () => undefined,
        })
      }
      if (signal.aborted) fired()
      else signal.addEventListener('abort', fired, { once: true })
    })
  }

  /** stdio and the SSE mode: the message is written; the answer comes on the shared stream. */
  private onStream(reply: Reply, id: PlainJson | undefined): Exchange {
    const sent: Exchange = this.kind === 'stdio' ? { kind: 'sent' } : ended({})
    switch (reply.kind) {
      case 'message':
        queueMicrotask(() => this.push(answerOf(reply, id)))
        return sent
      case 'ended':
        queueMicrotask(() => this.queue.push({ ...reply }))
        return sent
      case 'broken':
        queueMicrotask(() => this.queue.push({ kind: 'broken' }))
        return sent
      case 'silent':
        return sent
      case 'status':
        if (this.kind === 'stdio') throw new TypeError('an HTTP status on stdio')
        return {
          kind: 'status',
          status: reply.status,
          headers: reply.headers ?? {},
          body: reply.body ?? '',
        }
      case 'empty':
        return sent
      case 'aborted':
        if (this.kind === 'stdio') throw new TypeError('an aborted exchange on stdio')
        return { kind: 'aborted' }
      case 'unsent':
        return { kind: 'unsent' }
      case 'hang':
      case 'late-stream':
      case 'deaf':
        throw new TypeError(`${reply.kind} on a shared stream`)
      default: {
        const exhaustive: never = reply
        return exhaustive
      }
    }
  }

  private onHttp(reply: Reply, id: PlainJson | undefined, signal: AbortSignal): Exchange {
    switch (reply.kind) {
      case 'message':
        return ended(reply.headers ?? {}, [JSON.stringify(answerOf(reply, id))])
      case 'empty':
        return ended({})
      case 'status':
        return {
          kind: 'status',
          status: reply.status,
          headers: reply.headers ?? {},
          body: reply.body ?? '',
        }
      case 'aborted':
        return { kind: 'aborted' }
      case 'silent': {
        const messages = new AsyncQueue<string>()
        let done = false
        const abort = () => {
          if (done) return
          done = true
          if (typeof id === 'string') this.aborted.push(id)
          messages.fail(new Error('aborted'))
        }
        signal.addEventListener('abort', abort, { once: true })
        return { kind: 'stream', headers: {}, messages, abort }
      }
      case 'deaf':
        return {
          kind: 'stream',
          headers: {},
          messages: new AsyncQueue<string>(),
          abort: () => {
            this.streamAborted.push(typeof id === 'string' ? id : '')
          },
        }
      case 'ended':
      case 'broken':
      case 'hang':
      case 'late-stream':
        throw new TypeError(`${reply.kind} on a Streamable HTTP request`)
      case 'unsent':
        return { kind: 'unsent' }
      default: {
        const exhaustive: never = reply
        return exhaustive
      }
    }
  }

  async close(): Promise<void> {
    this.closeCount += 1
    this.queue.end()
  }
}

/** The answer message of a `message` reply: enveloped, or bare when the reply says so. */
function answerOf(
  reply: Extract<Reply, { kind: 'message' }>,
  id: PlainJson | undefined,
): PlainRecord {
  const body = { id: id ?? null, ...reply.message }
  return reply.bare === true ? body : { jsonrpc: '2.0', ...body }
}

/** A 2xx answer whose messages are all there and whose body ended. */
function ended(
  headers: Readonly<{ [name: string]: string }>,
  messages: readonly string[] = [],
): Exchange {
  const queue = new AsyncQueue<string>()
  for (const message of messages) queue.push(message)
  queue.end()
  return { kind: 'stream', headers, messages: queue, abort: () => undefined }
}

/** What an unscripted method gets: a notification nothing, a request `-32601`. */
function defaultReply(method: string, request: boolean): Reply {
  if (!request) return { kind: 'empty' }
  if (method === 'server/discover')
    return {
      kind: 'message',
      message: { result: { supportedVersions: ['2026-07-28'], capabilities: {} } },
    }
  return { kind: 'message', message: { error: { code: -32601, message: 'Method not found' } } }
}
