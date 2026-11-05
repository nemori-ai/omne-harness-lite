// The protocol session: one `McpTransport` over one line. It composes the requests of contract
// T3 with the contract's functions, turns what the line reports into contract wire events,
// classifies them with `classifyWireEvent`, and draws the conclusion of the T8 row. It owns the
// in-flight requests, the stdio probe time, the re-send of a read request, cancellation and
// closing (T5), the credential handle (T4, T9), and the legacy HTTP+SSE fallback (T3). The line
// does not classify; the session does not touch a wire.
import type { JsonValue } from '@omne-harness/json-text'
import type { Outcome } from '@omne-harness/operation-result'
import {
  FIRST_MODERN_PROTOCOL_VERSION,
  LEGACY_PROTOCOL_VERSIONS,
  authorizationChallengeOf,
  authorizationDiscoveryOf,
  classifyWireEvent,
  clientEnvelopeOf,
  errorAnswerOf,
  mcpRequestHeadersOf,
  metadataCandidatesOf,
  peerIdentityOf,
  readDiscoverResult,
  readInitializeResult,
  readListingPage,
  readTaskAnswer,
  readTaskReport,
  type AnswerClass,
  type AnswerMalformed,
  type AuthorizationDiscovery,
  type ClientInfo,
  type Generation,
  type NoAnswerCause,
  type PeerAnswer,
  type PeerIdentity,
  type PeerNotification,
  type PlainRecord,
  type RequestClass,
  type TaskId,
  type TaskReport,
  type WireContext,
  type WireEvent,
} from '@omne-harness/mcp-contract'
import type {
  CallRequest,
  HttpCredentialHandle,
  ListingPage,
  McpTransport,
  SentCall,
  TaskAnswer,
  TransportFailure,
  TransportMaterial,
} from '@omne-harness/mcp-contract/provider'
import type { Exchange, Line, LineEvent, Outbound } from './line.ts'
import {
  memberOf,
  messageText,
  parseMessage,
  plainIdOf,
  plainOf,
  textOf,
  type JsonObject,
} from './message.ts'

export type SessionOptions = Readonly<{
  clientInfo: ClientInfo
  /** The modern versions the transport speaks on `server/discover`, highest first. */
  versions: readonly string[]
  /** stdio: how long a `server/discover` waits for its answer (contract T3). */
  probeTimeoutMs: number
  /** Fetches the protected resource metadata at one address (R4); undefined when it cannot. */
  fetchMetadata: (url: string, signal: AbortSignal) => Promise<JsonValue | undefined>
}>

type NotSent = Extract<TransportFailure, { kind: 'not-sent' }>

/** What came back for one request, before the session reads it. */
type Wire =
  | Readonly<{ kind: 'result'; result: JsonValue; session?: string }>
  | Readonly<{ kind: 'error'; error: JsonValue }>
  | Readonly<{ kind: 'no-answer'; cause: NoAnswerCause }>
  /** `legacyHttp`: a 4xx with a plain body to `initialize` (T8 I07): the HTTP+SSE fallback may follow. */
  | Readonly<{ kind: 'not-sent'; failure: NotSent; legacyHttp?: true }>
  | Readonly<{ kind: 'legacy-signal' }>
  | Readonly<{ kind: 'probe-timeout' }>
  /** An HTTP 5xx without a JSON-RPC answer: `no-answer` (`stream-broken`), never re-sent. */
  | Readonly<{ kind: 'server-error' }>

/**
 * What the modern path makes of one answer to `server/discover`. `fallback` tries the legacy path
 * and reports this failure if that fails too; `legacy-peer` tries it and reports its failure.
 */
type Probe =
  | Readonly<{ kind: 'identity'; identity: PeerIdentity }>
  | Readonly<{ kind: 'retry'; version: string }>
  | Readonly<{ kind: 'final'; failure: TransportFailure }>
  | Readonly<{ kind: 'fallback'; failure: TransportFailure }>
  | Readonly<{ kind: 'legacy-peer' }>

/** What the session knows about one answer when it draws the conclusion. */
type Payload = Readonly<{
  message?: JsonObject | undefined
  headers?: Readonly<{ [name: string]: string }>
  body?: string
}>

class Deferred<T> {
  settled = false
  value: T | undefined
  resolve: (value: T) => void = () => undefined
  readonly promise: Promise<T>
  constructor() {
    this.promise = new Promise<T>(resolve => {
      this.resolve = value => {
        if (this.settled) return
        this.settled = true
        this.value = value
        resolve(value)
      }
    })
  }
}

/** One request in flight. */
type Pending = {
  readonly id: string
  readonly context: WireContext
  readonly controller: AbortController
  readonly deferred: Deferred<Wire>
  readonly authorized: boolean
  readonly observe?: (notification: PeerNotification) => void
  probe?: ReturnType<typeof setTimeout>
  stream?: Readonly<{ abort(): void }>
}

const [OFFERED_LEGACY_VERSION] = LEGACY_PROTOCOL_VERSIONS
const MODERN_ERROR_CODES: readonly number[] = [-32022, -32021, -32020]
const METHOD_NOT_FOUND = -32601
const READ_METHODS: readonly string[] = ['server/discover', 'tools/list', 'tasks/get']
const PROBES: readonly RequestClass[] = ['discover', 'discover-retry']
const HTTP_CLASS = /^http:([^+]+)\+(.+)$/u
const DATE = /^\d{4}-\d{2}-\d{2}$/u

const notSent: NotSent = { kind: 'not-sent', cause: 'connection-unavailable' }
const NOT_SENT: Wire = { kind: 'not-sent', failure: notSent }
const ABANDONED: Wire = { kind: 'no-answer', cause: 'abandoned' }
const malformed = (what: AnswerMalformed['what']): TransportFailure => ({
  kind: 'answer-malformed',
  what,
})

/** A reader of the contract as a reader of the transport: its defect is the `what` of T7. */
function reading<T, W extends AnswerMalformed['what']>(
  read: (result: JsonValue) => Outcome<T, W>,
): (result: JsonValue) => Outcome<T, TransportFailure> {
  return result => {
    const outcome = read(result)
    return 'ok' in outcome ? outcome : { failure: malformed(outcome.failure) }
  }
}

const readTask = reading(readTaskReport)
const readAnswer = reading(readTaskAnswer)

/** Reads an answer to a non-call request with the reader of that request. */
function interpret<T>(
  wire: Wire,
  read: (result: JsonValue) => Outcome<T, TransportFailure>,
): Outcome<T, TransportFailure> {
  switch (wire.kind) {
    case 'result':
      return read(wire.result)
    case 'error': {
      const answer = errorAnswerOf(wire.error)
      return answer === undefined ? { failure: malformed('error-shape') } : { failure: answer }
    }
    case 'no-answer':
      return { failure: { kind: 'no-answer', cause: wire.cause } }
    case 'server-error':
      return { failure: { kind: 'no-answer', cause: 'stream-broken' } }
    case 'not-sent':
      return { failure: wire.failure }
    case 'legacy-signal':
    case 'probe-timeout':
      return { failure: malformed('discover-shape') }
    default: {
      const exhaustive: never = wire
      return exhaustive
    }
  }
}

/** `expired` for the `-32602` error of a task operation that reads a task. */
function expiredOf<T>(wire: Wire): Outcome<T | 'expired', TransportFailure> | undefined {
  if (wire.kind !== 'error') return undefined
  return errorAnswerOf(wire.error)?.code === -32602 ? { ok: 'expired' } : undefined
}

/** The answer of a sent call (T8 C01–C05, S03, S04). */
function answerOf(wire: Wire): PeerAnswer {
  switch (wire.kind) {
    case 'result':
      return { kind: 'result', result: wire.result }
    case 'error':
      return { kind: 'error', error: wire.error }
    case 'no-answer':
      return { kind: 'no-answer', cause: wire.cause }
    case 'server-error':
      return { kind: 'no-answer', cause: 'stream-broken' }
    case 'not-sent':
    case 'legacy-signal':
    case 'probe-timeout':
      return { kind: 'no-answer', cause: 'abandoned' }
    default: {
      const exhaustive: never = wire
      return exhaustive
    }
  }
}

function interpretFailure(
  wire: Extract<Wire, { kind: 'no-answer' | 'not-sent' | 'server-error' }>,
): TransportFailure {
  if (wire.kind === 'not-sent') return wire.failure
  return { kind: 'no-answer', cause: wire.kind === 'no-answer' ? wire.cause : 'stream-broken' }
}

/** `data.supported` of a `-32022` error: a non-empty list of texts, or undefined. */
function supportedOf(data: JsonValue | undefined): readonly string[] | undefined {
  if (data?.kind !== 'object') return undefined
  const supported = memberOf(data, 'supported')
  if (supported?.kind !== 'array' || supported.items.length === 0) return undefined
  const texts = supported.items.flatMap(item => (item.kind === 'string' ? [item.value] : []))
  return texts.length === supported.items.length ? texts : undefined
}

/** The error object of a message whose envelope carries `error`, else the whole message (T2, C02). */
function errorPayloadOf(message: JsonObject): JsonValue {
  const error = memberOf(message, 'error')
  return error !== undefined && memberOf(message, 'result') === undefined ? error : message
}

/** The error object in an HTTP body that the contract classified as a JSON-RPC error. */
function bodyErrorOf(body: string | undefined): JsonValue {
  const message = body === undefined ? undefined : parseMessage(body)
  const error = message === undefined ? undefined : memberOf(message, 'error')
  return error ?? { kind: 'null' }
}

/** Reads a stream to its end in the background: an answer nobody waits for (T8 N01). */
function drain(exchange: Exchange): void {
  if (exchange.kind !== 'stream') return
  void (async () => {
    try {
      for await (const message of exchange.messages) void message
    } catch {
      // The body of an answer nobody waits for may break; nothing depends on it.
    }
  })()
}

/** The cause an `ended` event stands for, by the contract's rule on the exit window (T8). */
function causeOfEnded(
  event: Extract<LineEvent, { kind: 'ended' }>,
  versions: readonly string[],
): NoAnswerCause {
  const anyRequest: WireContext = { id: '', request: 'tools/list', session: false, versions }
  const classified = classifyWireEvent({ ...event, kind: 'stdio-ended' }, anyRequest)
  return classified.kind === 'answer' && classified.answer === 'process-exited'
    ? 'process-exited'
    : 'stream-broken'
}

/** One transport over one line. */
export class Session implements McpTransport {
  readonly generation: Generation
  private readonly line: Line
  private readonly material: TransportMaterial
  private readonly options: SessionOptions
  private readonly pending = new Map<string, Pending>()
  /** Aborts what no request owns: notifications, responses to the peer, the fallback GET, metadata. */
  private readonly closing = new AbortController()
  private nextId = 0
  private version: string | undefined
  private legacy = false
  /** The legacy HTTP+SSE mode (T3): requests post to the endpoint, answers come on the stream. */
  private sse = false
  /** The `Mcp-Session-Id` of a legacy Streamable HTTP connection. */
  private session: string | undefined
  private closed = false
  private dead: NoAnswerCause | 'session-ended' | undefined

  constructor(line: Line, material: TransportMaterial, options: SessionOptions) {
    this.line = line
    this.material = material
    this.options = options
    this.generation = material.generation
    void this.pump()
  }

  private get highest(): string {
    const highest = this.options.versions[0]
    if (highest === undefined) throw new TypeError('the transport speaks no protocol version')
    return highest
  }

  private get usable(): boolean {
    return !this.closed && this.dead === undefined
  }

  private get credential(): HttpCredentialHandle | undefined {
    return this.material.kind === 'streamable-http' ? this.material.credential : undefined
  }

  private get stdio(): boolean {
    return this.line.kind === 'stdio'
  }

  private envelope(version: string): PlainRecord {
    return clientEnvelopeOf(version, this.options.clientInfo)
  }

  private reserveId(): string {
    this.nextId += 1
    return `r${this.nextId}`
  }

  /** The stream or the process is gone: every pending request answers with the cause. */
  private die(cause: NoAnswerCause): void {
    this.dead ??= cause
    for (const entry of this.pending.values()) this.settle(entry, { kind: 'no-answer', cause })
  }

  private settle(entry: Pending, wire: Wire): void {
    if (entry.deferred.settled) return
    clearTimeout(entry.probe)
    this.pending.delete(entry.id)
    entry.deferred.resolve(wire)
  }

  /** Reads the events of the line until it closes. */
  private async pump(): Promise<void> {
    try {
      for await (const event of this.line.events) this.onEvent(event)
    } catch {
      // A line whose events reject is gone; the pending requests settle through `die` or `close`.
    }
  }

  private onEvent(event: LineEvent): void {
    switch (event.kind) {
      case 'line': {
        const message = parseMessage(event.text)
        if (message !== undefined && memberOf(message, 'method') !== undefined)
          return this.onPeerMessage(message)
        for (const entry of this.pending.values()) {
          const classified = classifyWireEvent({ kind: 'line', text: event.text }, entry.context)
          if (classified.kind === 'answer') {
            void this.conclude(entry, classified.answer, { message })
            return
          }
        }
        return
      }
      case 'ended':
        return this.die(causeOfEnded(event, this.options.versions))
      case 'broken':
        return this.die('stream-broken')
      default: {
        const exhaustive: never = event
        return exhaustive
      }
    }
  }

  /**
   * A request or notification of the peer (T3): `ping` answers an empty result, every other
   * request `-32601`; a progress notification whose token is the token of a call in flight goes
   * to its observer, as written and untrusted (S6); every other notification is dropped.
   */
  private onPeerMessage(message: JsonObject): void {
    const method = textOf(memberOf(message, 'method'))
    const id = plainIdOf(message)
    if (id !== undefined) {
      void this.respond(
        method === 'ping'
          ? { id, result: {} }
          : { id, error: { code: METHOD_NOT_FOUND, message: 'Method not found' } },
      )
      return
    }
    if (method !== 'notifications/progress') return
    const params = memberOf(message, 'params')
    const token = params?.kind === 'object' ? memberOf(params, 'progressToken') : undefined
    const tokenText =
      token?.kind === 'string' ? token.value : token?.kind === 'number' ? token.lexeme : undefined
    const entry = tokenText === undefined ? undefined : this.pending.get(tokenText)
    if (entry?.observe === undefined || params === undefined) return
    try {
      entry.observe({ kind: 'progress', notification: { untrusted: params } })
    } catch {
      // S6: an observer that throws does not change the outcome.
    }
  }

  /** The headers of a message that is not a request: the protocol version and the session. */
  private plainHeaders(): Headers {
    const headers = new Headers()
    headers.set('mcp-protocol-version', this.version ?? this.highest)
    if (this.session !== undefined && !this.sse) headers.set('mcp-session-id', this.session)
    return headers
  }

  /** Writes a response to a request of the peer. What the wire answers has no outcome (N01). */
  private async respond(response: PlainRecord): Promise<void> {
    if (!this.usable) return
    await this.write({ text: messageText(response), headers: this.plainHeaders() })
  }

  /** Writes a message nobody waits for. Whatever the wire does with it has no outcome (N01). */
  private async write(outbound: Outbound): Promise<void> {
    try {
      drain(await this.line.send(outbound, this.closing.signal))
    } catch {
      // A line that rejects a write is a defect of the line; the message has no outcome anyway.
    }
  }

  /** Sends a notification (T3). Whatever the peer answers to it does not change any outcome (N01). */
  private async sendNotification(method: string, params: PlainRecord): Promise<void> {
    if (!this.usable) return
    const version = this.version ?? this.highest
    const headers = new Headers()
    if (!(await this.authorize(headers))) return
    this.setMcpHeaders(headers, method, params, version)
    const text = messageText({ method, params: { ...params, _meta: this.envelope(version) } })
    await this.write({ text, headers })
  }

  private setMcpHeaders(
    headers: Headers,
    method: string,
    params: PlainRecord,
    version: string,
  ): void {
    const session = this.sse ? undefined : this.session
    const mcp = mcpRequestHeadersOf(method, params, version, session)
    for (const [name, value] of Object.entries(mcp))
      if (value !== undefined) headers.set(name, value)
  }

  /**
   * Authorizes an outgoing request with the credential handle, when the material has one. True
   * when the request may go out; `undefined` from a handle that rejects or throws leaves it not
   * sent (T9).
   */
  private async authorize(headers: Headers): Promise<boolean> {
    const credential = this.credential
    if (credential === undefined) return true
    const answer = await Promise.resolve()
      .then(() => credential.authorize(headers))
      .catch(() => undefined)
    return answer !== undefined && !('failure' in answer)
  }

  /**
   * Composes one request (T3) and hands it to the line. Undefined when it is not sent: the
   * transport is unusable or the credential handle did not authorize it. Otherwise the pending
   * request, settled already when the wire answered at once.
   */
  private async send(
    method: string,
    params: PlainRecord,
    how: Readonly<{
      version?: string
      retry?: boolean
      observe?: (notification: PeerNotification) => void
    }>,
  ): Promise<Pending | undefined> {
    if (!this.usable) return undefined
    const id = this.reserveId()
    const headers = new Headers()
    const authorized = this.credential !== undefined
    if (!(await this.authorize(headers))) return undefined
    // The transport may have closed while the handle was authorizing (T5).
    if (!this.usable) return undefined
    const version = how.version ?? this.version ?? this.highest
    this.setMcpHeaders(headers, method, params, version)
    const meta: PlainRecord =
      method === 'tools/call'
        ? { ...this.envelope(version), progressToken: id }
        : this.envelope(version)
    const text = messageText({ id, method, params: { ...params, _meta: meta } })
    const entry: Pending = {
      id,
      context: {
        id,
        request: this.classOf(method, how.retry === true),
        session: (this.session !== undefined || this.sse) && method !== 'initialize',
        versions: this.options.versions,
        ...(this.sse ? { mode: 'sse' } : {}),
      },
      controller: new AbortController(),
      deferred: new Deferred<Wire>(),
      authorized,
      ...(how.observe === undefined ? {} : { observe: how.observe }),
    }
    this.pending.set(id, entry)
    await this.dispatch(entry, { text, headers })
    return entry
  }

  private classOf(method: string, retry: boolean): RequestClass {
    switch (method) {
      case 'server/discover':
        return retry ? 'discover-retry' : 'discover'
      case 'initialize':
      case 'tools/list':
      case 'tools/call':
      case 'tasks/get':
      case 'tasks/update':
      case 'tasks/cancel':
        return method
      default:
        throw new TypeError(`${method} is not a request the session sends`)
    }
  }

  /** Hands one request to the line and settles it from what the wire did at once. */
  private async dispatch(entry: Pending, outbound: Outbound): Promise<void> {
    let exchange: Exchange
    try {
      exchange = await this.line.send(outbound, entry.controller.signal)
    } catch {
      exchange = { kind: 'aborted' }
    }
    if (entry.deferred.settled) return drain(exchange)
    switch (exchange.kind) {
      case 'unsent':
        return this.conclude(entry, 'unsent', {})
      case 'sent':
        if (this.stdio && PROBES.includes(entry.context.request))
          entry.probe = setTimeout(
            () => this.settle(entry, { kind: 'probe-timeout' }),
            this.options.probeTimeoutMs,
          )
        return
      case 'aborted':
        if (entry.controller.signal.aborted) return this.settle(entry, ABANDONED)
        return this.conclude(entry, 'stream-broken', {})
      case 'status': {
        const classified = classifyWireEvent({ ...exchange, kind: 'http-status' }, entry.context)
        if (classified.kind === 'answer')
          return this.conclude(entry, classified.answer, {
            headers: exchange.headers,
            body: exchange.body,
          })
        return
      }
      case 'stream':
        entry.stream = exchange
        void this.consume(entry, exchange)
        return
      default: {
        const exhaustive: never = exchange
        return exhaustive
      }
    }
  }

  /** Reads a 2xx answer stream: the messages of the peer, and the answer when it comes. */
  private async consume(
    entry: Pending,
    exchange: Extract<Exchange, { kind: 'stream' }>,
  ): Promise<void> {
    const seen: string[] = []
    try {
      for await (const text of exchange.messages) {
        seen.push(text)
        const message = parseMessage(text)
        if (message !== undefined && memberOf(message, 'method') !== undefined) {
          this.onPeerMessage(message)
          continue
        }
        if (entry.deferred.settled) continue
        const event: WireEvent = { kind: 'http-stream', messages: [text], ended: false }
        const classified = classifyWireEvent(event, entry.context)
        if (classified.kind === 'answer')
          await this.conclude(entry, classified.answer, { message, headers: exchange.headers })
      }
      if (entry.deferred.settled) return
      const ended: WireEvent = { kind: 'http-stream', messages: seen, ended: true }
      const classified = classifyWireEvent(ended, entry.context)
      // `waiting` (the legacy HTTP+SSE mode): the answer comes on the shared stream.
      if (classified.kind === 'answer')
        await this.conclude(entry, classified.answer, { headers: exchange.headers })
    } catch {
      if (entry.deferred.settled) return
      if (entry.controller.signal.aborted) return this.settle(entry, ABANDONED)
      await this.conclude(entry, 'stream-broken', {})
    }
  }

  /** Settles a request from its answer class (T8) and applies what the row says of the transport. */
  private async conclude(entry: Pending, answer: AnswerClass, payload: Payload): Promise<void> {
    switch (answer) {
      case 'unsent':
        this.settle(entry, NOT_SENT)
        if (this.stdio) this.die('stream-broken')
        return
      case 'silent':
        return this.settle(entry, ABANDONED)
      case 'stream-broken':
      case 'http:2xx':
        return this.settle(entry, { kind: 'no-answer', cause: 'stream-broken' })
      case 'process-exited':
        this.settle(entry, { kind: 'no-answer', cause: 'process-exited' })
        return this.die('process-exited')
      case 'http:401':
      case 'http:403+scope':
        return this.settle(
          entry,
          await this.authorizationRequired(entry.authorized, payload.headers ?? {}),
        )
      case 'http:403':
        return this.settle(entry, NOT_SENT)
      case 'http:404+session':
        this.dead = 'session-ended'
        return this.settle(entry, {
          kind: 'not-sent',
          failure: { kind: 'not-sent', cause: 'session-ended' },
        })
      default:
        return this.settle(entry, this.answerWireOf(entry, answer, payload))
    }
  }

  /** The wire of a JSON-RPC answer, direct or in an HTTP error body. */
  private answerWireOf(entry: Pending, answer: AnswerClass, payload: Payload): Wire {
    const { message } = payload
    if (answer.startsWith('result')) {
      const result = message === undefined ? undefined : memberOf(message, 'result')
      const session =
        entry.context.request === 'initialize' ? payload.headers?.['mcp-session-id'] : undefined
      return {
        kind: 'result',
        result: result ?? { kind: 'null' },
        ...(session === undefined ? {} : { session }),
      }
    }
    if (answer.startsWith('error:'))
      return {
        kind: 'error',
        error: message === undefined ? { kind: 'null' } : errorPayloadOf(message),
      }
    const match = HTTP_CLASS.exec(answer)
    const status = match?.[1]
    const body = match?.[2]
    const probe = PROBES.includes(entry.context.request)
    if (body === 'plain') {
      if (status === '5xx') return { kind: 'server-error' }
      if (probe) return { kind: 'legacy-signal' }
      if (entry.context.request === 'initialize' && !this.sse)
        return { kind: 'not-sent', failure: notSent, legacyHttp: true }
      return NOT_SENT
    }
    const error = bodyErrorOf(payload.body)
    if (!probe) return { kind: 'error', error }
    // A probe: 5xx is final (D16); a modern code in a 4xx body is the answer (D04–D08); the rest
    // is a legacy peer (D12).
    if (status === '5xx') return { kind: 'server-error' }
    const code = errorAnswerOf(error)?.code
    return code !== undefined && MODERN_ERROR_CODES.includes(code)
      ? { kind: 'error', error }
      : { kind: 'legacy-signal' }
  }

  /** T4: reports the rejection to the handle that authorized the request, then discovers. */
  private async authorizationRequired(
    authorized: boolean,
    headers: Readonly<{ [name: string]: string }>,
  ): Promise<Wire> {
    const credential = this.credential
    if (credential !== undefined && authorized)
      // A handle whose reportRejection rejects or throws is ignored (T9).
      await Promise.resolve()
        .then(() => credential.reportRejection())
        .catch(() => undefined)
    const challenge = authorizationChallengeOf(headers['www-authenticate'])
    const discovery = await this.discoverAuthorization(challenge)
    return {
      kind: 'not-sent',
      failure: { kind: 'not-sent', cause: 'authorization-required', discovery },
    }
  }

  private async discoverAuthorization(
    challenge: ReadonlyMap<string, string>,
  ): Promise<AuthorizationDiscovery> {
    const target =
      this.material.kind === 'streamable-http' ? this.material.target : 'https://invalid.test/'
    const candidates = metadataCandidatesOf(target, challenge)
    const fetched: (JsonValue | undefined)[] = []
    for (const url of candidates) {
      const metadata = await this.options
        .fetchMetadata(url, this.closing.signal)
        .catch(() => undefined)
      fetched.push(metadata)
      // A document that is not a JSON object counts as not fetched (R4): the next address is tried.
      if (metadata?.kind === 'object') break
    }
    return authorizationDiscoveryOf(challenge, candidates, fetched)
  }

  /** Sends one non-call request; on Streamable HTTP a read request is re-sent once after a broken stream (D15, O05). */
  private async request(
    method: string,
    params: PlainRecord,
    how: Readonly<{ version?: string; retry?: boolean }> = {},
  ): Promise<Wire> {
    const first = await this.once(method, params, how)
    const read = this.line.kind === 'streamable-http' && !this.sse && READ_METHODS.includes(method)
    if (read && first.kind === 'no-answer' && first.cause === 'stream-broken')
      return this.once(method, params, how)
    return first
  }

  private async once(
    method: string,
    params: PlainRecord,
    how: Readonly<{ version?: string; retry?: boolean }>,
  ): Promise<Wire> {
    const entry = await this.send(method, params, how)
    return entry === undefined ? NOT_SENT : entry.deferred.promise
  }

  async discover(): Promise<Outcome<PeerIdentity, TransportFailure>> {
    const modern = await this.modernPath()
    if (modern.kind === 'identity') return { ok: modern.identity }
    if (modern.kind === 'final') return { failure: modern.failure }
    const legacy = await this.legacyPath()
    if ('ok' in legacy || modern.kind === 'legacy-peer') return legacy
    return { failure: modern.failure }
  }

  /** The modern path: `server/discover`, once more after a `-32022` that names a version in common. */
  private async modernPath(): Promise<Exclude<Probe, Readonly<{ kind: 'retry' }>>> {
    let version = this.highest
    let retried = false
    for (;;) {
      const wire = await this.request('server/discover', {}, { version, retry: retried })
      const probe = this.probeOf(wire, retried)
      if (probe.kind !== 'retry') return probe
      retried = true
      version = probe.version
    }
  }

  /** What one answer to `server/discover` means (T3, T8 D rows). */
  private probeOf(wire: Wire, retried: boolean): Probe {
    switch (wire.kind) {
      case 'result': {
        const read = readDiscoverResult(wire.result, this.options.versions)
        if ('ok' in read) {
          this.version = read.ok.protocolVersion
          return { kind: 'identity', identity: peerIdentityOf(read.ok, this.bound) }
        }
        if (read.failure === 'no-common-version') return { kind: 'legacy-peer' }
        return { kind: 'fallback', failure: malformed('discover-shape') }
      }
      case 'error':
        return this.probeErrorOf(wire.error, retried)
      case 'no-answer':
      case 'not-sent':
      case 'server-error':
        return { kind: 'final', failure: interpretFailure(wire) }
      case 'legacy-signal':
      case 'probe-timeout':
        return { kind: 'legacy-peer' }
      default: {
        const exhaustive: never = wire
        return exhaustive
      }
    }
  }

  /** A JSON-RPC error on `server/discover`: the modern codes are final, `-32601` is a legacy peer. */
  private probeErrorOf(error: JsonValue, retried: boolean): Probe {
    const answer = errorAnswerOf(error)
    if (answer === undefined) return { kind: 'fallback', failure: malformed('error-shape') }
    if (answer.code === -32022 && !retried) return this.versionRetryOf(answer.data)
    if (MODERN_ERROR_CODES.includes(answer.code)) return { kind: 'final', failure: answer }
    if (answer.code === METHOD_NOT_FOUND) return { kind: 'legacy-peer' }
    return { kind: 'fallback', failure: answer }
  }

  /** The first `-32022` (D04–D06): a version in common is retried; modern versions with none in common are final. */
  private versionRetryOf(data: JsonValue | undefined): Probe {
    const modern = (supportedOf(data) ?? []).filter(isModern)
    if (modern.length === 0) return { kind: 'legacy-peer' }
    const common = this.options.versions.find(version => modern.includes(version))
    return common === undefined
      ? { kind: 'final', failure: malformed('discover-shape') }
      : { kind: 'retry', version: common }
  }

  private get bound(): Readonly<{ generation: Generation; instructionsByteLimit: number }> {
    return {
      generation: this.generation,
      instructionsByteLimit: this.material.instructionsByteLimit,
    }
  }

  /** The legacy path (T3): `initialize` with the highest legacy version, then `notifications/initialized`. */
  private async legacyPath(): Promise<Outcome<PeerIdentity, TransportFailure>> {
    const params: PlainRecord = {
      protocolVersion: OFFERED_LEGACY_VERSION,
      capabilities: {},
      clientInfo: { ...this.options.clientInfo },
    }
    const how = { version: OFFERED_LEGACY_VERSION }
    let wire = await this.request('initialize', params, how)
    if (wire.kind === 'not-sent' && wire.legacyHttp === true) {
      // T8 I07: the peer may speak the legacy HTTP+SSE transport (T3).
      const entered = await this.enterSse()
      wire = entered === undefined ? await this.request('initialize', params, how) : entered
    }
    const read = interpret(wire, (result): Outcome<PeerIdentity, TransportFailure> => {
      const legacy = readInitializeResult(result)
      if ('failure' in legacy) return { failure: malformed('discover-shape') }
      this.version = legacy.ok.protocolVersion
      this.legacy = true
      return { ok: peerIdentityOf(legacy.ok, this.bound) }
    })
    if ('failure' in read) return read
    if (wire.kind === 'result') this.session = wire.session
    await this.sendNotification('notifications/initialized', {})
    return read
  }

  /**
   * Tries the legacy HTTP+SSE fallback (T3). Undefined when the line entered the SSE mode;
   * otherwise the wire that `initialize` reports: a refused authorization of the GET (S05, S06),
   * or `not-sent` (I07).
   */
  private async enterSse(): Promise<Wire | undefined> {
    const enter = this.line.enterSse?.bind(this.line)
    if (enter === undefined || this.sse || !this.usable) return NOT_SENT
    const headers = new Headers()
    const authorized = this.credential !== undefined
    if (!(await this.authorize(headers))) return NOT_SENT
    if (!this.usable) return NOT_SENT
    headers.set('mcp-protocol-version', OFFERED_LEGACY_VERSION)
    const entry = await enter(headers, this.closing.signal)
    switch (entry.kind) {
      case 'entered':
        this.sse = true
        return undefined
      case 'status': {
        const context: WireContext = {
          id: '',
          request: 'initialize',
          session: false,
          versions: this.options.versions,
        }
        const classified = classifyWireEvent({ ...entry, kind: 'http-status' }, context)
        if (
          classified.kind === 'answer' &&
          (classified.answer === 'http:401' || classified.answer === 'http:403+scope')
        )
          return this.authorizationRequired(authorized, entry.headers)
        return NOT_SENT
      }
      case 'unsent':
      case 'unavailable':
        return NOT_SENT
      default: {
        const exhaustive: never = entry
        return exhaustive
      }
    }
  }

  async listActions(cursor?: string): Promise<Outcome<ListingPage, TransportFailure>> {
    const wire = await this.request('tools/list', cursor === undefined ? {} : { cursor })
    // SEP-2243 belongs to the modern revision: a legacy connection is not checked (T2).
    const checked = this.line.kind === 'streamable-http' && !this.legacy
    return interpret(
      wire,
      reading(result => readListingPage(result, checked)),
    )
  }

  async call(
    request: CallRequest,
    signal: AbortSignal,
    observe?: (notification: PeerNotification) => void,
  ): Promise<Outcome<SentCall, Extract<TransportFailure, { kind: 'not-sent' }>>> {
    if (!this.usable || signal.aborted) return { failure: notSent }
    const continuation = request.continuation
    const params: PlainRecord = {
      name: request.action,
      arguments: plainOf(request.args),
      ...(continuation?.requestState === undefined
        ? {}
        : { requestState: continuation.requestState }),
      ...(continuation?.inputResponses === undefined
        ? {}
        : { inputResponses: plainOf(continuation.inputResponses) }),
    }
    const entry = await this.sendCall(params, signal, observe)
    if (entry === undefined) return { failure: notSent }
    const wire = entry.deferred.value
    if (wire?.kind === 'not-sent') return { failure: wire.failure }
    return { ok: { requestId: entry.id, answer: entry.deferred.promise.then(answerOf) } }
  }

  /** Sends `tools/call`; the caller's signal, once it fires, abandons the answer (T5). */
  private async sendCall(
    params: PlainRecord,
    signal: AbortSignal,
    observe: ((notification: PeerNotification) => void) | undefined,
  ): Promise<Pending | undefined> {
    let entry: Pending | undefined
    const abandon = (): void => {
      if (entry === undefined) return
      entry.controller.abort()
      entry.stream?.abort()
      this.settle(entry, ABANDONED)
    }
    signal.addEventListener('abort', abandon, { once: true })
    entry = await this.send('tools/call', params, observe === undefined ? {} : { observe })
    if (entry === undefined) {
      signal.removeEventListener('abort', abandon)
      return undefined
    }
    // A signal that fired while the line was writing finds the request now.
    if (signal.aborted) abandon()
    void entry.deferred.promise.then(() => signal.removeEventListener('abort', abandon))
    return entry
  }

  /**
   * stdio, and Streamable HTTP on a legacy revision, send `notifications/cancelled`; Streamable
   * HTTP on a modern revision ends the answer stream (T5).
   */
  async cancelRequest(requestId: string): Promise<void> {
    if (this.stdio || this.legacy || this.sse) {
      await this.sendNotification('notifications/cancelled', { requestId })
      return
    }
    const entry = this.pending.get(requestId)
    if (entry === undefined) return
    entry.controller.abort()
    entry.stream?.abort()
    this.settle(entry, ABANDONED)
  }

  async getTask(taskId: TaskId): Promise<Outcome<TaskReport | 'expired', TransportFailure>> {
    const wire = await this.request('tasks/get', { taskId })
    return expiredOf<TaskReport>(wire) ?? interpret(wire, readTask)
  }

  async getTaskResult(taskId: TaskId): Promise<Outcome<TaskAnswer, TransportFailure>> {
    const wire = await this.request('tasks/get', { taskId })
    if (expiredOf(wire) !== undefined) return { ok: { kind: 'expired' } }
    return interpret(wire, readAnswer)
  }

  async updateTask(
    taskId: TaskId,
    inputResponses: JsonValue,
  ): Promise<Outcome<'accepted', TransportFailure>> {
    const wire = await this.request('tasks/update', {
      taskId,
      inputResponses: plainOf(inputResponses),
    })
    return interpret(wire, () => ({ ok: 'accepted' }))
  }

  async cancelTask(taskId: TaskId): Promise<Outcome<'requested', TransportFailure>> {
    const wire = await this.request('tasks/cancel', { taskId })
    return interpret(wire, () => ({ ok: 'requested' }))
  }

  /** Closes the transport (T5): the requests in flight are abandoned, then the line closes. */
  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    for (const entry of this.pending.values()) {
      entry.controller.abort()
      entry.stream?.abort()
      this.settle(entry, ABANDONED)
    }
    this.closing.abort()
    await this.line.close()
  }
}

/** A modern revision: a date not before `FIRST_MODERN_PROTOCOL_VERSION` (T3). */
function isModern(version: string): boolean {
  return DATE.test(version) && version >= FIRST_MODERN_PROTOCOL_VERSION
}
