// The protocol session: one `McpTransport` over one line. It composes the requests of contract
// T3 with the contract's functions, turns what the line reports into contract wire events,
// classifies them with `classifyWireEvent`, and draws the conclusion of the decision layer
// (`concludeAnswer`, `discoverWith`). It owns the in-flight requests, the stdio probe time, the
// re-send of a read request, cancellation and closing (T5), the credential handle (T4, T9), and
// the legacy HTTP+SSE fallback (T3). The line does not classify; the session does not touch a wire.
//
// Every effect of the session goes through an injected port: the line, the credential handle of
// the material, the metadata fetch, and the scheduler. It reads no global clock and arms no global
// timer itself, so a test can drive it and order every line reply, credential call and timer fire.
import type { JsonValue } from '@omne-harness/json-text'
import type { Outcome } from '@omne-harness/operation-result'
import {
  ABANDONED,
  NOT_SENT_FAILURE,
  OFFERED_LEGACY_VERSION,
  PROBE_REQUESTS,
  authorizationChallengeOf,
  callAnswerOf,
  classifyWireEvent,
  clientEnvelopeOf,
  concludeAnswer,
  discoverAuthorization,
  discoverWith,
  interpretAnswer,
  legacyIdentityOf,
  legacyInitializeParamsOf,
  listingPageOf,
  mcpRequestHeadersOf,
  notificationTextOf,
  peerRequestAnswerOf,
  readPeerMessage,
  requestClassOf,
  requestTextOf,
  responseTextOf,
  taskAnswerOf,
  taskReportOf,
  type AnswerConclusion,
  type ClientInfo,
  type Generation,
  type IdentityBound,
  type MetadataFetch,
  type NotificationMethod,
  type PeerAnswer,
  type PeerIdentity,
  type PeerMessage,
  type PeerNotification,
  type PlainRecord,
  type ProtocolVersions,
  type RequestMethod,
  type TaskId,
  type TaskReport,
  type WireAnswer,
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
import type { AnswerHeaders, Exchange, GetOpened, Line, LineEvent, Outbound } from './line.ts'

/** Arms a one-shot timer; the returned function cancels it. The factory gives the default. */
export type Scheduler = (delayMs: number, fire: () => void) => () => void

export type SessionOptions = Readonly<{
  clientInfo: ClientInfo
  /** The modern versions the transport speaks on `server/discover`, highest first: at least one. */
  versions: ProtocolVersions
  /** stdio: how long a `server/discover` waits for its answer (contract T3). */
  probeTimeoutMs: number
  /** Fetches the protected resource metadata at one address (R4); undefined when it cannot. */
  fetchMetadata: MetadataFetch
  /** Arms the stdio probe time. Injected so a test drives when it fires. */
  schedule: Scheduler
}>

/** What one request settled with: the decision-layer answer, and the headers of an HTTP answer. */
type Answered = Readonly<{ wire: WireAnswer; headers?: AnswerHeaders }>

/** How one request is sent: the `_meta` version, the request class, the call observer and signal. */
type Dispatch = Readonly<{
  version?: string
  request?: WireContext['request']
  observe?: (notification: PeerNotification) => void
  /** Params the caller wrote as value trees, written as they are (RFC-0010). */
  values?: Readonly<{ [key: string]: JsonValue }>
  /** Wires the caller's signal to the entry, once it is registered. */
  wire?: (entry: Pending) => void
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

/**
 * One request in flight. `phase` says what a close does with it: a request still authorizing never
 * left (`not-sent`); one that left is abandoned; one discovering authorization finishes that flow.
 */
type Pending = {
  readonly id: string
  readonly context: WireContext
  readonly controller: AbortController
  readonly deferred: Deferred<Answered>
  readonly authorized: boolean
  readonly observe?: (notification: PeerNotification) => void
  phase: 'authorizing' | 'sent' | 'discovery'
  cancelProbe?: () => void
  stream?: Readonly<{ abort(): void }>
}

const NOT_SENT: Answered = { wire: { kind: 'not-sent', failure: NOT_SENT_FAILURE } }

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

  private get usable(): boolean {
    return !this.closed && this.dead === undefined
  }

  private get credential(): HttpCredentialHandle | undefined {
    return this.material.kind === 'streamable-http' ? this.material.credential : undefined
  }

  private get stdio(): boolean {
    return this.line.kind === 'stdio'
  }

  private get target(): string | undefined {
    return this.material.kind === 'streamable-http' ? this.material.target : undefined
  }

  private get bound(): IdentityBound {
    return {
      generation: this.generation,
      instructionsByteLimit: this.material.instructionsByteLimit,
    }
  }

  private envelope(version: string): PlainRecord {
    return clientEnvelopeOf(version, this.options.clientInfo)
  }

  private reserveId(): string {
    this.nextId += 1
    return `r${this.nextId}`
  }

  /**
   * The stream or the process is gone (T8 S rows): every request that left answers with the cause.
   * A request still authorizing never reached the wire; it becomes `not-sent` where it stands.
   */
  private die(cause: NoAnswerCause | 'session-ended'): void {
    this.dead ??= cause
    if (cause === 'session-ended') return
    for (const entry of this.pending.values())
      if (entry.phase === 'sent')
        this.settle(entry, { wire: { kind: 'no-answer', cause, resend: false } })
  }

  private settle(entry: Pending, answered: Answered): void {
    if (entry.deferred.settled) return
    entry.cancelProbe?.()
    this.pending.delete(entry.id)
    entry.deferred.resolve(answered)
  }

  /** The caller's signal fired (T5): stop waiting. A discovery in flight only ends its fetch. */
  private abandon(entry: Pending): void {
    if (entry.deferred.settled) return
    entry.controller.abort()
    if (entry.phase === 'discovery') return
    entry.stream?.abort()
    this.settle(entry, { wire: ABANDONED })
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
        const peer = readPeerMessage(event.text)
        if (peer !== undefined) return this.onPeerMessage(peer)
        for (const entry of this.pending.values())
          if (this.classify(entry, { kind: 'line', text: event.text }, {})) return
        return
      }
      case 'ended':
        return this.die(this.causeOfEnded(event))
      case 'broken':
        return this.die('stream-broken')
      default: {
        const exhaustive: never = event
        return exhaustive
      }
    }
  }

  /** The cause an `ended` event stands for, by the contract's rule on the exit window (T8). */
  private causeOfEnded(event: Extract<LineEvent, { kind: 'ended' }>): NoAnswerCause {
    const context: WireContext = {
      id: '',
      request: 'tools/list',
      session: false,
      versions: this.options.versions,
    }
    const classified = classifyWireEvent({ ...event, kind: 'stdio-ended' }, context)
    return classified.kind === 'answer' && classified.answer === 'process-exited'
      ? 'process-exited'
      : 'stream-broken'
  }

  /**
   * A request or notification of the peer (T3): `ping` answers an empty result, every other
   * request `-32601`; a progress notification whose token is the token of a call in flight goes
   * to its observer, as written and untrusted (S6); every other notification is dropped.
   */
  private onPeerMessage(message: PeerMessage): void {
    if (message.kind === 'request') return void this.respond(message)
    if (message.method !== 'notifications/progress' || message.progressToken === undefined) return
    const entry = this.pending.get(message.progressToken)
    if (entry?.observe === undefined || message.params === undefined) return
    try {
      entry.observe({ kind: 'progress', notification: { untrusted: message.params } })
    } catch {
      // S6: an observer that throws does not change the outcome.
    }
  }

  /** The headers of a message that is not a request: the protocol version and the session. */
  private plainHeaders(): Headers {
    const headers = new Headers()
    headers.set('mcp-protocol-version', this.version ?? this.options.versions[0])
    if (this.session !== undefined && !this.sse) headers.set('mcp-session-id', this.session)
    return headers
  }

  /** Writes a response to a request of the peer (T3, P7): the POST is authorized; none after close. */
  private async respond(request: Extract<PeerMessage, { kind: 'request' }>): Promise<void> {
    if (!this.usable) return
    const headers = new Headers()
    if (!(await this.authorize(headers))) return
    if (!this.usable) return
    for (const [name, value] of this.plainHeaders().entries()) headers.set(name, value)
    const answer = peerRequestAnswerOf(request)
    await this.write({ text: responseTextOf({ id: request.id, ...answer }), headers })
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
  private async sendNotification(method: NotificationMethod, params: PlainRecord): Promise<void> {
    if (!this.usable) return
    const version = this.version ?? this.options.versions[0]
    const headers = new Headers()
    if (!(await this.authorize(headers))) return
    if (!this.usable) return
    this.setMcpHeaders(headers, method, params, version)
    const text = notificationTextOf({
      method,
      params: { ...params, _meta: this.envelope(version) },
    })
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

  private makeEntry(id: string, context: WireContext, how: Dispatch): Pending {
    return {
      id,
      context,
      controller: new AbortController(),
      deferred: new Deferred<Answered>(),
      authorized: this.credential !== undefined,
      phase: 'authorizing',
      ...(how.observe === undefined ? {} : { observe: how.observe }),
    }
  }

  /**
   * Composes one request (T3), registers it, authorizes it and hands it to the line. The pending
   * request, settled already when it did not go out or the wire answered at once; undefined only
   * when the transport was unusable before it began.
   */
  private async send(
    method: RequestMethod,
    params: PlainRecord,
    how: Dispatch,
  ): Promise<Pending | undefined> {
    if (!this.usable) return undefined
    const id = this.reserveId()
    const version = how.version ?? this.version ?? this.options.versions[0]
    const context: WireContext = {
      id,
      request: how.request ?? requestClassOf(method, false),
      session: (this.session !== undefined || this.sse) && method !== 'initialize',
      versions: this.options.versions,
      ...(this.sse ? { mode: 'sse' } : {}),
    }
    const entry = this.makeEntry(id, context, how)
    this.pending.set(id, entry)
    how.wire?.(entry)
    const headers = new Headers()
    if (!(await this.authorize(headers))) {
      this.settle(entry, NOT_SENT)
      return entry
    }
    // The transport may have closed (not-sent) or the signal fired (abandoned) while authorizing.
    if (entry.deferred.settled) return entry
    // It may also have died while authorizing: a request that never left is not sent (T8 S, X).
    if (!this.usable) {
      this.settle(entry, NOT_SENT)
      return entry
    }
    this.setMcpHeaders(headers, method, params, version)
    const meta: PlainRecord =
      method === 'tools/call'
        ? { ...this.envelope(version), progressToken: id }
        : this.envelope(version)
    const text = requestTextOf({
      id,
      method,
      params: { ...params, _meta: meta },
      values: how.values ?? {},
    })
    entry.phase = 'sent'
    await this.dispatch(entry, { text, headers })
    return entry
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
        return void this.classify(entry, { kind: 'unsent' }, {})
      case 'sent':
        if (this.stdio && PROBE_REQUESTS.includes(entry.context.request))
          entry.cancelProbe = this.options.schedule(this.options.probeTimeoutMs, () =>
            this.classify(entry, { kind: 'nothing' }, {}),
          )
        return
      case 'aborted':
        // On stdio an aborted write is the signal ending it: `abandon` already settled this entry
        // and the line reported the broken stream. On HTTP it is a reset before the answer head.
        if (entry.controller.signal.aborted) return
        return void this.classify(entry, { kind: 'http-aborted' }, {})
      case 'status':
        return void this.classify(
          entry,
          {
            kind: 'http-status',
            status: exchange.status,
            headers: exchange.headers,
            body: exchange.body,
          },
          exchange.headers,
        )
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
    try {
      for await (const text of exchange.messages) {
        const peer = readPeerMessage(text)
        if (peer !== undefined) {
          this.onPeerMessage(peer)
          continue
        }
        if (entry.deferred.settled) continue
        this.classify(
          entry,
          { kind: 'http-stream', messages: [text], ended: false },
          exchange.headers,
        )
      }
      // The body ended with no answer: `http:2xx` on a modern connection, `waiting` in the SSE mode.
      this.classify(entry, { kind: 'http-stream', messages: [], ended: true }, exchange.headers)
    } catch {
      if (entry.deferred.settled || entry.controller.signal.aborted) return
      this.classify(entry, { kind: 'http-aborted' }, {})
    }
  }

  /**
   * Classifies one wire event for the entry and applies the T8 conclusion. True when the event was
   * the answer (settled or entered a flow); false when it was no answer to this request.
   */
  private classify(entry: Pending, event: WireEvent, headers: AnswerHeaders): boolean {
    if (entry.deferred.settled) return true
    const classified = classifyWireEvent(event, entry.context)
    if (classified.kind !== 'answer') return false
    void this.apply(entry, concludeAnswer(classified, entry.context, this.line.kind), headers)
    return true
  }

  /** Settles a request from its T8 conclusion and applies what the row says of the transport. */
  private async apply(
    entry: Pending,
    conclusion: AnswerConclusion,
    headers: AnswerHeaders,
  ): Promise<void> {
    switch (conclusion.kind) {
      case 'wait':
        return
      case 'settle':
        this.settle(entry, { wire: conclusion.wire, headers })
        if (conclusion.unusable !== undefined) this.die(conclusion.unusable)
        return
      case 'authorization-required':
        entry.phase = 'discovery'
        return this.settle(entry, {
          wire: await this.authorizationRequired(
            entry.authorized,
            headers,
            entry.controller.signal,
          ),
          headers,
        })
      default: {
        const exhaustive: never = conclusion
        return exhaustive
      }
    }
  }

  /** T4: reports the rejection to the handle that authorized the request, then discovers (R4). */
  private async authorizationRequired(
    authorized: boolean,
    headers: AnswerHeaders,
    signal: AbortSignal,
  ): Promise<WireAnswer> {
    const credential = this.credential
    if (credential !== undefined && authorized)
      // A handle whose reportRejection rejects or throws is ignored (T9).
      await Promise.resolve()
        .then(() => credential.reportRejection())
        .catch(() => undefined)
    const target = this.target
    if (target === undefined) return NOT_SENT.wire
    const challenge = authorizationChallengeOf(headers['www-authenticate'])
    const discovery = await discoverAuthorization(
      target,
      challenge,
      this.options.fetchMetadata,
      AbortSignal.any([this.closing.signal, signal]),
    )
    return {
      kind: 'not-sent',
      failure: { kind: 'not-sent', cause: 'authorization-required', discovery },
    }
  }

  /** Sends one non-call request; a read request is re-sent once after a broken stream (D15, O05). */
  private async request(
    method: RequestMethod,
    params: PlainRecord,
    how: Dispatch = {},
  ): Promise<Answered> {
    const first = await this.once(method, params, how)
    if (first.wire.kind === 'no-answer' && first.wire.resend) return this.once(method, params, how)
    return first
  }

  private async once(method: RequestMethod, params: PlainRecord, how: Dispatch): Promise<Answered> {
    const entry = await this.send(method, params, how)
    return entry === undefined ? NOT_SENT : entry.deferred.promise
  }

  async discover(): Promise<Outcome<PeerIdentity, TransportFailure>> {
    const discovered = await discoverWith(
      {
        probe: async (version, request) =>
          (await this.request('server/discover', {}, { version, request })).wire,
        legacy: () => this.legacyPath(),
      },
      this.options.versions,
      this.bound,
    )
    if ('ok' in discovered) this.version ??= discovered.ok.protocolVersion
    return discovered
  }

  /** The legacy path (T3): `initialize` with the highest legacy version, then `notifications/initialized`. */
  private async legacyPath(): Promise<Outcome<PeerIdentity, TransportFailure>> {
    const params = legacyInitializeParamsOf(this.options.clientInfo)
    const how: Dispatch = { version: OFFERED_LEGACY_VERSION }
    let answered = await this.request('initialize', params, how)
    if (answered.wire.kind === 'legacy-http') {
      // T8 I07: the peer may speak the legacy HTTP+SSE transport (T3).
      const entered = await this.enterSse()
      answered = entered ?? (await this.request('initialize', params, how))
    }
    const read = legacyIdentityOf(answered.wire, this.bound)
    if ('failure' in read) return read
    this.version = read.ok.protocolVersion
    this.legacy = true
    if (answered.wire.kind === 'result') this.session = answered.headers?.['mcp-session-id']
    await this.sendNotification('notifications/initialized', {})
    return read
  }

  /**
   * Tries the legacy HTTP+SSE fallback (T3). Undefined when the line entered the SSE mode;
   * otherwise the answer that `initialize` reports: a refused authorization of the GET (S05, S06),
   * or `not-sent` (I07).
   */
  private async enterSse(): Promise<Answered | undefined> {
    const openGet = this.line.openGet?.bind(this.line)
    if (openGet === undefined || this.sse || !this.usable) return NOT_SENT
    const headers = new Headers()
    const authorized = this.credential !== undefined
    if (!(await this.authorize(headers))) return NOT_SENT
    if (!this.usable) return NOT_SENT
    headers.set('mcp-protocol-version', OFFERED_LEGACY_VERSION)
    const opened = await openGet(headers, this.closing.signal)
    if (!this.usable) {
      if (opened.kind === 'stream') opened.discard()
      return NOT_SENT
    }
    return this.enterFrom(opened, authorized)
  }

  /** Judges the GET the line reported (T3): the fallback holds, or it is read as a refusal or not-sent. */
  private async enterFrom(opened: GetOpened, authorized: boolean): Promise<Answered | undefined> {
    switch (opened.kind) {
      case 'stream': {
        const endpoint = this.heldEndpoint(opened)
        if (endpoint === undefined) {
          opened.discard()
          return NOT_SENT
        }
        opened.enter(endpoint)
        this.sse = true
        return undefined
      }
      case 'status': {
        const context: WireContext = {
          id: '',
          request: 'initialize',
          session: false,
          versions: this.options.versions,
        }
        const classified = classifyWireEvent(
          {
            kind: 'http-status',
            status: opened.status,
            headers: opened.headers,
            body: opened.body,
          },
          context,
        )
        if (
          concludeAnswer(classified, context, 'streamable-http').kind === 'authorization-required'
        )
          return {
            wire: await this.authorizationRequired(authorized, opened.headers, this.closing.signal),
          }
        return NOT_SENT
      }
      case 'unsent':
      case 'unavailable':
        return NOT_SENT
      default: {
        const exhaustive: never = opened
        return exhaustive
      }
    }
  }

  /** Whether the GET stream holds the legacy HTTP+SSE fallback (T3): 200, event-stream, same-origin endpoint. */
  private heldEndpoint(opened: Extract<GetOpened, { kind: 'stream' }>): string | undefined {
    const target = this.target
    const type = (opened.headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase()
    if (opened.status !== 200 || type !== 'text/event-stream' || target === undefined)
      return undefined
    const first = opened.first
    if (first?.event !== 'endpoint') return undefined
    try {
      const url = new URL(first.data, target)
      return url.origin === new URL(target).origin ? url.href : undefined
    } catch {
      return undefined
    }
  }

  async listActions(cursor?: string): Promise<Outcome<ListingPage, TransportFailure>> {
    const answered = await this.request('tools/list', cursor === undefined ? {} : { cursor })
    // SEP-2243 belongs to the modern revision: a legacy connection is not checked (T2).
    return listingPageOf(answered.wire, this.line.kind === 'streamable-http' && !this.legacy)
  }

  async call(
    request: CallRequest,
    signal: AbortSignal,
    observe?: (notification: PeerNotification) => void,
  ): Promise<Outcome<SentCall, Extract<TransportFailure, { kind: 'not-sent' }>>> {
    if (!this.usable || signal.aborted) return { failure: NOT_SENT_FAILURE }
    const continuation = request.continuation
    const params: PlainRecord = {
      name: request.action,
      ...(continuation?.requestState === undefined
        ? {}
        : { requestState: continuation.requestState }),
    }
    const values: Readonly<{ [key: string]: JsonValue }> = {
      arguments: request.args,
      ...(continuation?.inputResponses === undefined
        ? {}
        : { inputResponses: continuation.inputResponses }),
    }
    const entry = await this.send('tools/call', params, {
      values,
      wire: pending => this.wireSignal(pending, signal),
      ...(observe === undefined ? {} : { observe }),
    })
    if (entry === undefined) return { failure: NOT_SENT_FAILURE }
    // A 401 or scoped 403 enters the discovery flow before it settles (T8 S05): the call's own
    // outcome is `not-sent`, so it is awaited rather than carried on the answer.
    const settled =
      entry.phase === 'discovery' ? await entry.deferred.promise : entry.deferred.value
    if (settled?.wire.kind === 'not-sent') return { failure: settled.wire.failure }
    return {
      ok: { requestId: entry.id, answer: entry.deferred.promise.then(this.answerOf) },
    }
  }

  private readonly answerOf = (answered: Answered): PeerAnswer => callAnswerOf(answered.wire)

  /** Wires the call's signal to the entry: once it fires, the answer is abandoned (T5). */
  private wireSignal(entry: Pending, signal: AbortSignal): void {
    const onAbort = () => this.abandon(entry)
    if (signal.aborted) return onAbort()
    signal.addEventListener('abort', onAbort, { once: true })
    void entry.deferred.promise.then(() => signal.removeEventListener('abort', onAbort))
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
    if (entry !== undefined) this.abandon(entry)
  }

  async getTask(taskId: TaskId): Promise<Outcome<TaskReport | 'expired', TransportFailure>> {
    return taskReportOf((await this.request('tasks/get', { taskId })).wire)
  }

  async getTaskResult(taskId: TaskId): Promise<Outcome<TaskAnswer, TransportFailure>> {
    return taskAnswerOf((await this.request('tasks/get', { taskId })).wire)
  }

  async updateTask(
    taskId: TaskId,
    inputResponses: JsonValue,
  ): Promise<Outcome<'accepted', TransportFailure>> {
    const answered = await this.request('tasks/update', { taskId }, { values: { inputResponses } })
    return interpretAnswer(answered.wire, () => ({ ok: 'accepted' }))
  }

  async cancelTask(taskId: TaskId): Promise<Outcome<'requested', TransportFailure>> {
    const answered = await this.request('tasks/cancel', { taskId })
    return interpretAnswer(answered.wire, () => ({ ok: 'requested' }))
  }

  /** Closes the transport (T5): the requests in flight are abandoned, then the line closes. */
  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    const flows: Promise<unknown>[] = []
    for (const entry of this.pending.values()) {
      entry.controller.abort()
      entry.stream?.abort()
      if (entry.phase === 'discovery') flows.push(entry.deferred.promise)
      // A request still authorizing never left (not-sent); one that left is abandoned.
      else this.settle(entry, entry.phase === 'authorizing' ? NOT_SENT : { wire: ABANDONED })
    }
    this.closing.abort()
    await Promise.all(flows)
    await this.line.close()
  }
}

type NoAnswerCause = Extract<PeerAnswer, { kind: 'no-answer' }>['cause']
