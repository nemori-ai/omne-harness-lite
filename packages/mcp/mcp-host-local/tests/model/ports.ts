// The ports of the explorer: the line, the credential handle, the metadata fetch and the
// scheduler that `Session` is driven on. Every call the session makes on a port is a
// `PortCall` that stays pending until the explorer settles it with one of the port's answers,
// or leaves it pending forever (a hang). A port call that was given a signal does not settle by
// itself when the signal fires: the explorer chooses whether the port honours the abort, answers
// late, or hangs. The ports also keep the ledger of what went out and what came in, which the
// properties read; none of them reads the session.
import { AsyncLocalStorage } from 'node:async_hooks'
import type { JsonValue } from '@omne-harness/json-text'
import type { Ack } from '@omne-harness/operation-result'
import type { MetadataFetch } from '@omne-harness/mcp-contract'
import type { HttpCredentialHandle } from '@omne-harness/mcp-contract/provider'
import type { Exchange, GetOpened, Line, LineEvent, Outbound } from '../../src/line.ts'
import { AsyncQueue } from '../../src/queue.ts'
import type { Scheduler } from '../../src/session.ts'

/** The answers of each port, the lawful one first. A run driven to rest answers with the first. */
export const PORT_ANSWERS = {
  'line.send': [
    'answer',
    'sent',
    'stream',
    'empty',
    '401',
    '403+scope',
    '403',
    '404+session',
    '4xx',
    '5xx',
    'unsent',
    'aborted',
    'reject',
  ],
  'stream.next': ['result', 'ping', 'end', 'break'],
  'line.openGet': ['entered', '401', '403', '4xx', 'unsent', 'unavailable', 'reject'],
  'line.close': ['ok', 'reject'],
  'credential.authorize': ['ok', 'fail', 'reject'],
  'credential.reportRejection': ['ok', 'reject'],
  fetchMetadata: ['ok', 'none', 'reject'],
} as const

export type PortName = keyof typeof PORT_ANSWERS
export type AnswerOf<P extends PortName> = (typeof PORT_ANSWERS)[P][number]
export type Answer = AnswerOf<PortName>

/** A port answer that breaks the port's contract: a reject, a refused authorization. */
export const BREACHES: ReadonlySet<Answer> = new Set<Answer>(['reject', 'fail'])

/**
 * A wire answer other than the lawful one: what the peer, the network or the process may do.
 * Each of them spends the wire budget of the scenario.
 */
export const WIRE_FAULTS: ReadonlySet<Answer> = new Set<Answer>([
  'stream',
  'empty',
  '401',
  '403+scope',
  '403',
  '404+session',
  '4xx',
  '5xx',
  'unsent',
  'aborted',
  'ping',
  'break',
])

/** What a call was made under: the client operation, and the request id once the line saw it. */
export type Context = Readonly<{ op: string; request?: string }>

export const contexts = new AsyncLocalStorage<Context>()

export type PortCall = Readonly<{
  /** The order the call was made in, within one run. */
  seq: number
  port: PortName
  /** The request id, the stream, or the resource the call acts on. */
  subject: string
  context: Context | undefined
  /** The signal the session gave the call, when the port takes one. */
  signal: AbortSignal | undefined
  /** The functions of `src/` on the stack when the call was made: where its answer goes. */
  site: string
}>

/** A port call that rejected on the explorer's say. */
export class PortFault extends Error {
  readonly call: PortCall

  constructor(call: PortCall) {
    super(`${call.port} ${call.subject} rejected`)
    this.name = 'PortFault'
    this.call = call
  }
}

export type CallRequest<T> = Readonly<{
  port: PortName
  subject: string
  signal?: AbortSignal
  /** The value of an answer that does not reject. */
  value: (answer: Answer) => T
}>

/** The explorer side of the ports: it registers each call and settles it later. */
export interface CallDesk {
  open<T>(request: CallRequest<T>): Promise<T>
  readonly ledger: Ledger
}

/** One message the session wrote: its method, its id when it is a request, and its session header. */
export type SentMessage = Readonly<{
  method: string
  id: string | undefined
  session: boolean
  /** Whether the credential wrote an `authorization` header into it. */
  authorized: boolean
  /** The `requestId` of a `notifications/cancelled`. */
  cancels: string | undefined
}>

/** What the ports saw: every message out, every credential call, every stream and line event. */
export type Ledger = {
  sent: SentMessage[]
  /** The `authorize` calls, with whether the session had already closed when each was made. */
  authorizations: number
  rejections: number
  /** `reportRejection` calls made after `close()` resolved, and `authorize` calls likewise. */
  credentialCallsAfterClose: string[]
  /** The ids of the answer streams the session aborted. */
  abortedStreams: string[]
  lineCloses: number
  /** The events pushed on the shared stream, in order. */
  events: string[]
  /** The fallback GET: whether the session kept the stream (`enter`) or let it go. */
  getEntered: boolean
  getDiscarded: boolean
}

export function emptyLedger(): Ledger {
  return {
    sent: [],
    authorizations: 0,
    rejections: 0,
    credentialCallsAfterClose: [],
    abortedStreams: [],
    lineCloses: 0,
    events: [],
    getEntered: false,
    getDiscarded: false,
  }
}

const TARGET = 'https://peer.test/mcp'
const METADATA_URL = 'https://peer.test/.well-known/oauth-protected-resource/mcp'

/** The address `metadataCandidatesOf` tries first for `TARGET` with a challenge that names none. */
export { METADATA_URL, TARGET }

function isRecord(value: unknown): value is Readonly<{ [key: string]: unknown }> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The text of a result for the request `id`, as the peer would write it. */
function resultTextOf(id: string, method: string): string {
  const result =
    method === 'server/discover'
      ? { supportedVersions: ['2026-07-28'], capabilities: {} }
      : method === 'initialize'
        ? { protocolVersion: '2025-11-25', capabilities: {} }
        : method === 'tools/list'
          ? { tools: [] }
          : {}
  return JSON.stringify({ jsonrpc: '2.0', id, result })
}

const PING_TEXT = '{"jsonrpc":"2.0","id":7,"method":"ping"}'

/** The headers of the HTTP status classes the explorer answers with (T8 S05–S07, O08, O07). */
function statusExchange(answer: Answer): Exchange | undefined {
  switch (answer) {
    case '401':
      return { kind: 'status', status: 401, headers: { 'www-authenticate': 'Bearer' }, body: '' }
    case '403+scope':
      return {
        kind: 'status',
        status: 403,
        headers: { 'www-authenticate': 'Bearer error="insufficient_scope"' },
        body: '',
      }
    case '403':
      return { kind: 'status', status: 403, headers: {}, body: '' }
    case '404+session':
      return { kind: 'status', status: 404, headers: {}, body: '' }
    case '4xx':
      return { kind: 'status', status: 400, headers: {}, body: '' }
    case '5xx':
      return { kind: 'status', status: 500, headers: {}, body: '' }
    default:
      return undefined
  }
}

/** A 2xx answer whose messages are all there and whose body ended. */
function endedStream(messages: readonly string[]): Exchange {
  const queue = new AsyncQueue<string>()
  for (const message of messages) queue.push(message)
  queue.end()
  return { kind: 'stream', headers: {}, messages: queue, abort: () => undefined }
}

/**
 * A 2xx answer stream the explorer feeds: every `next()` of the consumer is a pending
 * `stream.next` call. `abort()` by the session is recorded; the stream does not end by itself.
 */
class ExplorerStream implements AsyncIterable<string> {
  aborted = false
  private readonly desk: CallDesk
  private readonly id: string
  private readonly method: string
  private done = false

  constructor(desk: CallDesk, id: string, method: string) {
    this.desk = desk
    this.id = id
    this.method = method
  }

  abort(): void {
    if (this.aborted) return
    this.aborted = true
    this.desk.ledger.abortedStreams.push(this.id)
  }

  [Symbol.asyncIterator](): AsyncIterator<string> {
    return {
      next: () => {
        if (this.done) return Promise.resolve({ value: undefined, done: true })
        return this.desk.open<IteratorResult<string>>({
          port: 'stream.next',
          subject: this.id,
          value: answer => {
            switch (answer) {
              case 'result':
                return { value: resultTextOf(this.id, this.method), done: false }
              case 'ping':
                return { value: PING_TEXT, done: false }
              case 'end':
                this.done = true
                return { value: undefined, done: true }
              default:
                throw new TypeError(`${answer} is not an answer of stream.next`)
            }
          },
        })
      },
      return: () => {
        this.done = true
        return Promise.resolve({ value: undefined, done: true })
      },
    }
  }
}

export class ExplorerLine implements Line {
  readonly kind: 'stdio' | 'streamable-http'
  readonly events: AsyncIterable<LineEvent>
  readonly queue = new AsyncQueue<LineEvent>()
  readonly openGet: ((headers: Headers, signal: AbortSignal) => Promise<GetOpened>) | undefined
  /** The answer streams the session holds, by request id. */
  readonly streams = new Map<string, ExplorerStream>()
  private readonly desk: CallDesk
  private sse = false
  private closed = false

  constructor(kind: 'stdio' | 'streamable-http', desk: CallDesk, withGet: boolean) {
    this.kind = kind
    this.desk = desk
    this.events = this.queue
    this.openGet = kind === 'streamable-http' && withGet ? this.getStream.bind(this) : undefined
  }

  get inSseMode(): boolean {
    return this.sse
  }

  /** Pushes one event of the shared stream: a line of the peer, `ended`, or `broken`. */
  push(event: LineEvent): void {
    this.desk.ledger.events.push(
      event.kind === 'line' ? `line:${event.text.length > 40 ? 'ping' : event.text}` : event.kind,
    )
    this.queue.push(event)
  }

  /** The answer of the peer to the sent request `id`, on the shared stream. */
  pushAnswer(sent: SentMessage): void {
    if (sent.id === undefined) throw new TypeError('a notification has no answer')
    this.desk.ledger.events.push(`line:answer ${sent.id}`)
    this.queue.push({ kind: 'line', text: resultTextOf(sent.id, sent.method) })
  }

  pushPing(): void {
    this.desk.ledger.events.push('line:ping')
    this.queue.push({ kind: 'line', text: PING_TEXT })
  }

  send(outbound: Outbound, signal: AbortSignal): Promise<Exchange> {
    const parsed: unknown = JSON.parse(outbound.text)
    if (!isRecord(parsed)) throw new TypeError('the session sent something that is not an object')
    const method = typeof parsed['method'] === 'string' ? parsed['method'] : '?'
    const id = typeof parsed['id'] === 'string' ? parsed['id'] : undefined
    const params = parsed['params']
    const cancels =
      isRecord(params) && typeof params['requestId'] === 'string' ? params['requestId'] : undefined
    const sent: SentMessage = {
      method,
      id,
      session: outbound.headers.has('mcp-session-id'),
      authorized: outbound.headers.has('authorization'),
      cancels,
    }
    this.desk.ledger.sent.push(sent)
    // The request id becomes part of the context of what the session does with the answer.
    const store = contexts.getStore()
    if (store !== undefined && id !== undefined) contexts.enterWith({ ...store, request: id })
    if (this.closed) return Promise.resolve({ kind: 'unsent' })
    return this.desk.open<Exchange>({
      port: 'line.send',
      subject: id ?? method,
      signal,
      value: answer => this.exchangeOf(answer, id ?? method, method),
    })
  }

  private exchangeOf(answer: Answer, id: string, method: string): Exchange {
    const shared = this.kind === 'stdio' || this.sse
    switch (answer) {
      case 'answer':
        if (shared) {
          queueMicrotask(() => this.pushAnswerText(id, method))
          return { kind: 'sent' }
        }
        return endedStream([resultTextOf(id, method)])
      case 'sent':
        return { kind: 'sent' }
      case 'stream': {
        const stream = new ExplorerStream(this.desk, id, method)
        this.streams.set(id, stream)
        return { kind: 'stream', headers: {}, messages: stream, abort: () => stream.abort() }
      }
      case 'empty':
        return endedStream([])
      case 'unsent':
      case 'aborted':
        return { kind: answer }
      default: {
        const status = statusExchange(answer)
        if (status === undefined) throw new TypeError(`${answer} is not an answer of line.send`)
        return status
      }
    }
  }

  private pushAnswerText(id: string, method: string): void {
    this.desk.ledger.events.push(`line:answer ${id}`)
    this.queue.push({ kind: 'line', text: resultTextOf(id, method) })
  }

  private getStream(headers: Headers, signal: AbortSignal): Promise<GetOpened> {
    void headers
    if (this.closed || this.sse) return Promise.resolve({ kind: 'unavailable' })
    return this.desk.open<GetOpened>({
      port: 'line.openGet',
      subject: 'get',
      signal,
      value: answer => this.openedOf(answer),
    })
  }

  private openedOf(answer: Answer): GetOpened {
    switch (answer) {
      case 'entered':
        return {
          kind: 'stream',
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
          first: { event: 'endpoint', data: '/message?sessionId=1' },
          enter: () => {
            this.sse = true
            this.desk.ledger.getEntered = true
          },
          discard: () => {
            this.desk.ledger.getDiscarded = true
          },
        }
      case '401':
        return { kind: 'status', status: 401, headers: { 'www-authenticate': 'Bearer' }, body: '' }
      case '403':
        return { kind: 'status', status: 403, headers: {}, body: '' }
      case '4xx':
        return { kind: 'status', status: 400, headers: {}, body: '' }
      case 'unsent':
      case 'unavailable':
        return { kind: answer }
      default:
        throw new TypeError(`${answer} is not an answer of line.openGet`)
    }
  }

  close(): Promise<void> {
    this.desk.ledger.lineCloses += 1
    if (this.closed) return Promise.resolve()
    return this.desk.open<void>({
      port: 'line.close',
      subject: 'line',
      value: () => {
        this.closed = true
        this.queue.end()
      },
    })
  }
}

/** The credential handle of the material: `authorize` and `reportRejection` are explorer calls. */
export function explorerCredential(
  desk: CallDesk,
  closeReturned: () => boolean,
): HttpCredentialHandle {
  return {
    purpose: 'http-authorization',
    authorize(headers): Promise<Ack<'rejected' | 'unknown'>> {
      desk.ledger.authorizations += 1
      if (closeReturned()) desk.ledger.credentialCallsAfterClose.push('authorize')
      return desk.open<Ack<'rejected' | 'unknown'>>({
        port: 'credential.authorize',
        subject: 'handle',
        value: answer => {
          if (answer === 'fail') return { failure: 'rejected' }
          headers.set('authorization', 'Bearer token')
          return { ok: true }
        },
      })
    },
    reportRejection(): Promise<void> {
      desk.ledger.rejections += 1
      if (closeReturned()) desk.ledger.credentialCallsAfterClose.push('reportRejection')
      return desk.open<void>({
        port: 'credential.reportRejection',
        subject: 'handle',
        value: () => undefined,
      })
    },
    release: () => Promise.resolve(),
  }
}

const METADATA: JsonValue = {
  kind: 'object',
  entries: [
    {
      key: 'authorization_servers',
      value: { kind: 'array', items: [{ kind: 'string', value: 'https://issuer.test' }] },
    },
  ],
}

/** The metadata fetch of the material (R4): one explorer call per address. */
export function explorerMetadataFetch(desk: CallDesk): MetadataFetch {
  return (url, signal) =>
    desk.open<JsonValue | undefined>({
      port: 'fetchMetadata',
      subject: url === METADATA_URL ? 'first' : 'root',
      signal,
      value: answer => (answer === 'ok' ? METADATA : undefined),
    })
}

/** A timer the explorer fires: named by the request it was armed for. */
export type Timer = Readonly<{ name: string; fire: () => void; context: Context | undefined }>

/** The scheduler of the session: every probe time is a timer of the explorer. */
export function explorerScheduler(timers: Timer[]): Scheduler {
  return (_delayMs, fire) => {
    const context = contexts.getStore()
    const timer: Timer = { name: `T(${context?.request ?? '?'})`, fire, context }
    timers.push(timer)
    return () => {
      const index = timers.indexOf(timer)
      if (index >= 0) timers.splice(index, 1)
    }
  }
}
