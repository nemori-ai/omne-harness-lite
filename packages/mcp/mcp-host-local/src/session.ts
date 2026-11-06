// The protocol session: one `McpTransport` over one line. It composes the requests of contract
// T3 with the contract's functions, turns what the line reports into contract wire events,
// classifies them with `classifyWireEvent`, and draws the conclusion of the decision layer
// (`concludeAnswer`, `discoverWith`). It owns the in-flight requests, the stdio probe time, the
// re-send of a read request, cancellation and closing (T5), the credential handle (T4, T9), and
// the legacy HTTP+SSE fallback (T3). The line does not classify; the session does not touch a wire.
//
// A caller waits on a settlement, never on a workflow. Every request is registered as a pending
// entry with its own settlement before anything is awaited; the work that follows (authorize,
// compose, hand to the line, read the answer; report a refusal and discover; answer the peer;
// notify) is background work the session owns, started through `work`. The caller's signal and
// `close()` settle the entry there and then, by the phase it is in, with the contract's one rule
// (T5, `stopAnswerOf`); a line that is gone settles the phases that depend on it (T8,
// `lineGoneAnswerOf`). The in-flight table is the one re-check of every workflow: an entry that
// left it is dropped, whatever the work finds out after. So a credential handle, a metadata
// fetch, the line or the peer may hang without holding a caller. A defect of the workflow stops
// its entry by the same rule and goes to the defect outlet of the options.
//
// Every effect of the session goes through an injected port: the line, the credential handle of
// the material, the metadata fetch, and the scheduler. It reads no global clock and arms no global
// timer itself, so a test can drive it and order every line reply, credential call and timer fire.
import type { JsonValue } from '@omne-harness/json-text'
import type { Outcome } from '@omne-harness/operation-result'
import {
  NOT_SENT_FAILURE,
  OFFERED_LEGACY_VERSION,
  PROBE_REQUESTS,
  authorizationChallengeOf,
  authorizationRequiredAnswerOf,
  callAnswerOf,
  callRequestOf,
  cancelTaskRequest,
  cancelsByNotification,
  classifyWireEvent,
  clientEnvelopeOf,
  concludeAnswer,
  discoverWith,
  endedCauseOf,
  fallbackGetConclusionOf,
  getTaskRequest,
  getTaskResultRequest,
  legacyIdentityOf,
  legacyInitializeParamsOf,
  lineGoneAnswerOf,
  listActionsRequest,
  mcpRequestHeadersOf,
  notificationTextOf,
  peerRequestAnswerOf,
  readPeerMessage,
  requestClassOf,
  requestMetaOf,
  requestTextOf,
  responseTextOf,
  startAuthorizationDiscovery,
  stopAnswerOf,
  updateTaskRequest,
  withOneResend,
  type AnswerConclusion,
  type AuthorizationDiscovery,
  type AuthorizationDiscoveryRun,
  type ClientInfo,
  type ComposedRequest,
  type ConnectionView,
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
  type RequestValues,
  type TaskId,
  type TaskReport,
  type UnusableCause,
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
  /**
   * Where a defect of the session's own work goes: a reject nobody expected, a throw on the way
   * an event is read, or events of the line that reject (read as a broken stream). The entry it
   * was for is stopped by its phase as well (DP-06). The factory throws it outside any promise,
   * so the host's uncaught-exception handling sees it.
   */
  reportDefect: (defect: unknown) => void
}>

/** What one request settled with: the decision-layer answer, and the headers of an HTTP answer. */
type Answered = Readonly<{ wire: WireAnswer; headers?: AnswerHeaders }>

/**
 * The connection mode (contract T3): what `discover` negotiated, and how messages go out.
 * - `modern`: the modern path; `version` once `server/discover` was read.
 * - `legacy`: a legacy revision on stdio, or on Streamable HTTP with the `Mcp-Session-Id` the
 *   peer gave on `initialize`, when it gave one.
 * - `legacy-sse`: the legacy HTTP+SSE mode: requests post to the endpoint, answers come on the
 *   shared stream; `version` once `initialize` was read there.
 */
type Connection =
  | Readonly<{ kind: 'modern'; version?: string }>
  | Readonly<{ kind: 'legacy'; version: string; session?: string }>
  | Readonly<{ kind: 'legacy-sse'; version?: string }>

/**
 * How one request is sent.
 * - `probe`: a `server/discover` with this `_meta` version and request class (T3).
 * - `legacy-initialize`: the `initialize` of the legacy path, with the version it offers (T3).
 * - `operation`: the request of an operation, with the values the caller wrote (RFC-0010).
 * - `call`: a `tools/call`: the values, the caller's signal, and the observer of its progress.
 */
type Sending =
  | Readonly<{ kind: 'probe'; version: string; request: 'discover' | 'discover-retry' }>
  | Readonly<{ kind: 'legacy-initialize' }>
  | Readonly<{ kind: 'operation'; values?: RequestValues }>
  | Readonly<{
      kind: 'call'
      values: RequestValues
      signal: AbortSignal
      observe?: (notification: PeerNotification) => void
    }>

/**
 * The refusal flow of T4 after a 401 or scoped 403: `reportRejection` once on the handle that
 * authorized the request, and the discovery of R4. `soFar()` is the discovery from what was
 * fetched by now: what the request settles with when it is stopped before the flow ended.
 */
type Refusal = Readonly<{ soFar(): AuthorizationDiscovery; done: Promise<AuthorizationDiscovery> }>

/**
 * What a sent request holds of its exchange: nothing yet, or once the line answered, the 2xx
 * answer stream being read (a stop aborts it), or the stdio probe time (a settlement cancels it).
 */
type SentExchange =
  | Readonly<{ kind: 'line' }>
  | Readonly<{ kind: 'stream'; abort(): void }>
  | Readonly<{ kind: 'probe'; cancel(): void }>

/**
 * The phase of a request in flight: the contract's `InFlightPhase` (T5, T8) with what each phase
 * holds here: registered but not handed to the line yet (`authorizing`); handed to the line
 * (`sent`), with its exchange; refused and discovering the authorization (`discovery`), with the
 * headers of the refusal and the discovery so far. The contract's `stopAnswerOf` and
 * `lineGoneAnswerOf` read the phase; the session adds the headers of the refusal.
 */
type Phase =
  | Readonly<{ kind: 'authorizing' }>
  | Readonly<{ kind: 'sent'; exchange: SentExchange }>
  | Readonly<{ kind: 'discovery'; headers: AnswerHeaders; soFar(): AuthorizationDiscovery }>

const AUTHORIZING: Phase = { kind: 'authorizing' }
const SENT: Phase = { kind: 'sent', exchange: { kind: 'line' } }

/**
 * One request in flight. `answered` is its settlement, what every caller waits on; `departed`
 * resolves once the line took the request (a stdio write completed, an HTTP answer stream began):
 * what `call` waits on, with the settlement, whichever comes first. Both are one-shot; the
 * in-flight table says whether the entry is still open.
 */
type Pending = {
  readonly id: string
  readonly context: WireContext
  readonly controller: AbortController
  readonly answered: Promise<Answered>
  readonly settle: (answered: Answered) => void
  readonly departed: Promise<void>
  readonly depart: () => void
  readonly observe?: (notification: PeerNotification) => void
  phase: Phase
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

const answerOf = (answered: Answered): PeerAnswer => callAnswerOf(answered.wire)

/** One transport over one line. */
export class Session implements McpTransport {
  readonly generation: Generation
  private readonly line: Line
  private readonly material: TransportMaterial
  private readonly options: SessionOptions
  /** The requests in flight: an entry leaves the table when it settles, and only then. */
  private readonly pending = new Map<string, Pending>()
  /** Aborts what no request owns: notifications, responses to the peer, the fallback GET, metadata. */
  private readonly teardown = new AbortController()
  private nextId = 0
  private connection: Connection = { kind: 'modern' }
  private closed = false
  /** The one close in progress, once `close()` ran: every caller of `close()` gets it. */
  private closing: Promise<void> | undefined
  private dead: UnusableCause | undefined

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

  /** The connection as the contract's T2 and T5 rules see it. */
  private get view(): ConnectionView {
    const version = this.connection.version
    if (this.line.kind === 'stdio') return { kind: 'stdio', version }
    return {
      kind: 'streamable-http',
      version,
      mode: this.connection.kind === 'legacy-sse' ? 'sse' : 'streamable',
    }
  }

  /** The `Mcp-Session-Id` a message carries: the legacy session, outside the SSE mode. */
  private get sessionHeader(): string | undefined {
    return this.connection.kind === 'legacy' ? this.connection.session : undefined
  }

  /** Whether a request carries a legacy session for T8 S07: the session header, or the SSE endpoint. */
  private get carriesSession(): boolean {
    return this.sessionHeader !== undefined || this.connection.kind === 'legacy-sse'
  }

  private reserveId(): string {
    this.nextId += 1
    return `r${this.nextId}`
  }

  private inFlight(entry: Pending): boolean {
    return this.pending.has(entry.id)
  }

  // ---- The workflows the session owns ----

  /**
   * Starts background work the session owns. The caller does not wait for it: it waits on the
   * settlement of its entry. A reject the work did not expect is a defect of the session: it goes
   * to the outlet first, so that a stop that throws cannot lose it; then the entry it was for is
   * stopped where it stands (DP-06), and a throw of that stop goes to the outlet too. Work
   * without an entry has no outcome.
   */
  private work(flow: () => Promise<void>, entry?: Pending): void {
    void flow().catch((defect: unknown) => {
      this.options.reportDefect(defect)
      if (entry === undefined) return
      try {
        this.stop(entry)
      } catch (stopDefect) {
        this.options.reportDefect(stopDefect)
      }
    })
  }

  private settle(entry: Pending, answered: Answered): void {
    if (!this.pending.delete(entry.id)) return
    const phase = entry.phase
    if (phase.kind === 'sent' && phase.exchange.kind === 'probe') phase.exchange.cancel()
    entry.settle(answered)
  }

  /**
   * Stops a request where it stands: the caller's signal fired, `close()` ran, or its workflow
   * failed. The entry settles by its phase there and then with the contract's rule (T5); its
   * exchange is released.
   */
  private stop(entry: Pending): void {
    if (!this.inFlight(entry)) return
    entry.controller.abort()
    const phase = entry.phase
    if (phase.kind === 'sent' && phase.exchange.kind === 'stream') phase.exchange.abort()
    this.settle(
      entry,
      phase.kind === 'discovery'
        ? { wire: stopAnswerOf(phase), headers: phase.headers }
        : { wire: stopAnswerOf(phase) },
    )
  }

  /**
   * The line is gone (T8 S rows, the SSE mode, S07): the transport is unusable from now on, and
   * every request in flight settles by its phase with the contract's rule: one still authorizing
   * is `not-sent`, one handed to the line answers the cause (left alone when the peer ended the
   * session), one discovering its authorization goes on to `authorization-required`.
   */
  private die(cause: UnusableCause): void {
    this.dead ??= cause
    for (const entry of this.pending.values()) {
      const wire = lineGoneAnswerOf(entry.phase, cause)
      if (wire !== undefined) this.settle(entry, { wire })
    }
  }

  /**
   * Reads the events of the line until it closes. Events that reject are a line that broke its
   * port: the shared stream is gone, so the session dies as on a broken stream (`die`, the
   * requests in flight settle by their phase), and the reason goes to the outlet. A throw on
   * reading one event is a defect of the session: it goes to the outlet, and the reading goes on.
   */
  private async pump(): Promise<void> {
    const events = this.line.events[Symbol.asyncIterator]()
    for (;;) {
      let next: IteratorResult<LineEvent>
      try {
        next = await events.next()
      } catch (broken) {
        this.die('stream-broken')
        this.options.reportDefect(broken)
        return
      }
      if (next.done) return
      try {
        this.onEvent(next.value)
      } catch (defect) {
        this.options.reportDefect(defect)
      }
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
        return this.die(endedCauseOf(event))
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
  private onPeerMessage(message: PeerMessage): void {
    if (message.kind === 'request') return this.work(() => this.respond(message))
    if (message.method !== 'notifications/progress' || message.progressToken === undefined) return
    const entry = this.pending.get(message.progressToken)
    if (entry?.observe === undefined || message.params === undefined) return
    try {
      entry.observe({ kind: 'progress', notification: { untrusted: message.params } })
    } catch {
      // S6: an observer that throws does not change the outcome.
    }
  }

  // ---- The credential handle (T4, T9) ----

  /**
   * Calls one method of the credential handle: never after `close()` (V2). A handle that rejects
   * or throws answers nothing: its failure is the handle's (T9).
   */
  private callHandle<T>(call: () => Promise<T>): Promise<T | undefined> {
    if (this.closed) return Promise.resolve(undefined)
    try {
      return Promise.resolve(call()).then(
        answer => answer,
        () => undefined,
      )
    } catch {
      return Promise.resolve(undefined)
    }
  }

  /**
   * Authorizes an outgoing request with the credential handle, when the material has one. True
   * when the handle let it go out; a transport that cannot be used, or a handle that fails,
   * rejects or throws, leaves it not sent (T9). What happened while the handle was asked is the
   * caller's to re-check: a request by its entry in the in-flight table, a message with no entry
   * by `authorizedToWrite`.
   */
  private async authorize(headers: Headers): Promise<boolean> {
    if (!this.usable) return false
    const credential = this.credential
    if (credential === undefined) return true
    const answer = await this.callHandle(() => credential.authorize(headers))
    return answer !== undefined && !('failure' in answer)
  }

  /**
   * Authorizes a message that has no entry (a response to the peer, a notification, the fallback
   * GET): true when the handle let it go out and the session is still usable now that the handle
   * answered.
   */
  private async authorizedToWrite(headers: Headers): Promise<boolean> {
    return (await this.authorize(headers)) && this.usable
  }

  /**
   * The refusal flow of T4 for a request sent to `target`: `reportRejection` once on the handle
   * that authorized it (every request of a material with a handle was), and the discovery of R4,
   * both from now on. The signal ends the discovery: no fetch starts after it, the one in flight
   * is let go, and what was not fetched by then is unavailable.
   */
  private refusalOf(target: string, headers: AnswerHeaders, signal: AbortSignal): Refusal {
    const credential = this.credential
    const reported =
      credential === undefined
        ? Promise.resolve()
        : this.callHandle(() => credential.reportRejection())
    const challenge = authorizationChallengeOf(headers['www-authenticate'])
    const run: AuthorizationDiscoveryRun = startAuthorizationDiscovery(
      target,
      challenge,
      this.options.fetchMetadata,
      signal,
    )
    return { soFar: run.soFar, done: Promise.all([reported, run.done]).then(([, found]) => found) }
  }

  // ---- Writing: headers, notifications, responses to the peer ----

  /** The headers of a message that is not a request: the protocol version and the session. */
  private plainHeaders(): Headers {
    const headers = new Headers()
    headers.set('mcp-protocol-version', this.connection.version ?? this.options.versions[0])
    const session = this.sessionHeader
    if (session !== undefined) headers.set('mcp-session-id', session)
    return headers
  }

  private setMcpHeaders(
    headers: Headers,
    method: string,
    params: PlainRecord,
    version: string,
  ): void {
    const mcp = mcpRequestHeadersOf(method, params, version, this.sessionHeader)
    for (const [name, value] of Object.entries(mcp))
      if (value !== undefined) headers.set(name, value)
  }

  /** Writes a message nobody waits for. Whatever the wire does with it has no outcome (N01). */
  private async write(outbound: Outbound): Promise<void> {
    try {
      drain(await this.line.send(outbound, this.teardown.signal))
    } catch {
      // A line that rejects a write is a defect of the line; the message has no outcome anyway.
    }
  }

  /** Writes a response to a request of the peer (T3, P7): the POST is authorized; none after close. */
  private async respond(request: Extract<PeerMessage, { kind: 'request' }>): Promise<void> {
    const headers = new Headers()
    if (!(await this.authorizedToWrite(headers))) return
    for (const [name, value] of this.plainHeaders().entries()) headers.set(name, value)
    const answer = peerRequestAnswerOf(request)
    await this.write({ text: responseTextOf({ id: request.id, ...answer }), headers })
  }

  /** Writes a notification (T3). Whatever the peer answers to it does not change any outcome (N01). */
  private async notify(method: NotificationMethod, params: PlainRecord): Promise<void> {
    const version = this.connection.version ?? this.options.versions[0]
    const headers = new Headers()
    if (!(await this.authorizedToWrite(headers))) return
    this.setMcpHeaders(headers, method, params, version)
    const text = notificationTextOf({
      method,
      params: { ...params, _meta: clientEnvelopeOf(version, this.options.clientInfo) },
    })
    await this.write({ text, headers })
  }

  // ---- Requests: registration, the workflow, and the answer ----

  private versionOf(sending: Sending): string {
    switch (sending.kind) {
      case 'probe':
        return sending.version
      case 'legacy-initialize':
        return OFFERED_LEGACY_VERSION
      case 'operation':
      case 'call':
        return this.connection.version ?? this.options.versions[0]
      default: {
        const exhaustive: never = sending
        return exhaustive
      }
    }
  }

  private makeEntry(id: string, context: WireContext, sending: Sending): Pending {
    const answered = Promise.withResolvers<Answered>()
    const departed = Promise.withResolvers<void>()
    const observe = sending.kind === 'call' ? sending.observe : undefined
    return {
      id,
      context,
      controller: new AbortController(),
      answered: answered.promise,
      settle: answered.resolve,
      departed: departed.promise,
      depart: departed.resolve,
      ...(observe === undefined ? {} : { observe }),
      phase: AUTHORIZING,
    }
  }

  /**
   * Registers one request and starts its workflow; the caller waits on the entry's settlement.
   * Undefined when the transport cannot be used: nothing is registered.
   */
  private begin(method: RequestMethod, params: PlainRecord, sending: Sending): Pending | undefined {
    if (!this.usable) return undefined
    const id = this.reserveId()
    const context: WireContext = {
      id,
      request: sending.kind === 'probe' ? sending.request : requestClassOf(method, false),
      session: this.carriesSession && method !== 'initialize',
      versions: this.options.versions,
      ...(this.connection.kind === 'legacy-sse' ? { mode: 'sse' } : {}),
    }
    const entry = this.makeEntry(id, context, sending)
    this.pending.set(id, entry)
    if (sending.kind === 'call') this.wireSignal(entry, sending.signal)
    this.work(() => this.sendOut(entry, method, params, sending), entry)
    return entry
  }

  /** Wires the call's signal to the entry: once it fires, the entry is stopped where it stands (T5). */
  private wireSignal(entry: Pending, signal: AbortSignal): void {
    const onAbort = () => this.stop(entry)
    if (signal.aborted) return onAbort()
    signal.addEventListener('abort', onAbort, { once: true })
    void entry.answered.then(() => signal.removeEventListener('abort', onAbort))
  }

  /**
   * The workflow of one request: authorizes it, composes it (T3) and hands it to the line, then
   * settles it from what the wire did at once. An entry stopped meanwhile drops what came back.
   */
  private async sendOut(
    entry: Pending,
    method: RequestMethod,
    params: PlainRecord,
    sending: Sending,
  ): Promise<void> {
    const headers = new Headers()
    if (!(await this.authorize(headers))) return this.settle(entry, NOT_SENT)
    if (!this.inFlight(entry)) return
    const version = this.versionOf(sending)
    this.setMcpHeaders(headers, method, params, version)
    const values =
      sending.kind === 'operation' || sending.kind === 'call' ? sending.values : undefined
    const text = requestTextOf({
      id: entry.id,
      method,
      params: {
        ...params,
        _meta: requestMetaOf(method, entry.id, version, this.options.clientInfo),
      },
      ...(values === undefined ? {} : { values }),
    })
    entry.phase = SENT
    let exchange: Exchange
    try {
      exchange = await this.line.send({ text, headers }, entry.controller.signal)
    } catch {
      // A line that rejects a send is a defect of the line: the exchange ended before an answer.
      exchange = { kind: 'aborted' }
    }
    this.dispatch(entry, exchange)
  }

  /** Settles the entry from what the wire did with the request at once, or keeps reading. */
  private dispatch(entry: Pending, exchange: Exchange): void {
    if (!this.inFlight(entry)) return drain(exchange)
    switch (exchange.kind) {
      case 'unsent':
        return void this.classify(entry, { kind: 'unsent' }, {})
      case 'sent':
        entry.depart()
        return this.armProbe(entry)
      case 'aborted':
        // The exchange ended before the answer head and the entry is still open: an HTTP reset.
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
        entry.phase = { kind: 'sent', exchange: { kind: 'stream', abort: () => exchange.abort() } }
        entry.depart()
        return this.work(() => this.consume(entry, exchange), entry)
      default: {
        const exhaustive: never = exchange
        return exhaustive
      }
    }
  }

  /** stdio: a probe waits for its answer no longer than the probe time (T3, T8 D13). */
  private armProbe(entry: Pending): void {
    if (!this.stdio || !PROBE_REQUESTS.includes(entry.context.request)) return
    const cancel = this.options.schedule(this.options.probeTimeoutMs, () =>
      this.classify(entry, { kind: 'nothing' }, {}),
    )
    entry.phase = { kind: 'sent', exchange: { kind: 'probe', cancel } }
  }

  /**
   * Reads a 2xx answer stream: the messages of the peer, and the answer when it comes. Only the
   * reading of the body can break; a throw on one message is a defect of the session, which
   * `work` settles by the phase and reports.
   */
  private async consume(
    entry: Pending,
    exchange: Extract<Exchange, { kind: 'stream' }>,
  ): Promise<void> {
    const messages = exchange.messages[Symbol.asyncIterator]()
    for (;;) {
      let next: IteratorResult<string>
      try {
        next = await messages.next()
      } catch {
        // The body broke before it ended: a broken stream for an entry still open.
        return void this.classify(entry, { kind: 'http-aborted' }, {})
      }
      if (next.done) break
      this.onBodyMessage(entry, next.value, exchange.headers)
    }
    // The body ended with no answer: `http:2xx` on a modern connection, `waiting` in the SSE mode.
    this.classify(entry, { kind: 'http-stream', messages: [], ended: true }, exchange.headers)
  }

  /** One message of a 2xx body: a request or notification of the peer, or a candidate answer. */
  private onBodyMessage(entry: Pending, text: string, headers: AnswerHeaders): void {
    const peer = readPeerMessage(text)
    if (peer !== undefined) return this.onPeerMessage(peer)
    this.classify(entry, { kind: 'http-stream', messages: [text], ended: false }, headers)
  }

  /**
   * Classifies one wire event for the entry and applies the T8 conclusion. True when the event was
   * the answer (settled or entered a flow) or the entry is settled already; false when it was no
   * answer to this request, or the request was not handed to the line yet or has its conclusion
   * already (T5: the first event decides; an answer reaches a request in the `sent` phase only).
   */
  private classify(entry: Pending, event: WireEvent, headers: AnswerHeaders): boolean {
    if (!this.inFlight(entry)) return true
    if (entry.phase.kind !== 'sent') return false
    const classified = classifyWireEvent(event, entry.context)
    if (classified.kind !== 'answer') return false
    this.apply(entry, concludeAnswer(classified, entry.context, this.line.kind), headers)
    return true
  }

  /** Settles a request from its T8 conclusion and applies what the row says of the transport. */
  private apply(entry: Pending, conclusion: AnswerConclusion, headers: AnswerHeaders): void {
    switch (conclusion.kind) {
      case 'wait':
        return
      case 'settle':
        this.settle(entry, { wire: conclusion.wire, headers })
        if (conclusion.unusable !== undefined) this.die(conclusion.unusable)
        return
      case 'authorization-required':
        return this.enterDiscovery(entry, headers)
      default: {
        const exhaustive: never = conclusion
        return exhaustive
      }
    }
  }

  /**
   * T4: the request was refused. The refusal flow runs in the background; the entry settles with
   * `authorization-required` when the flow ends, or with what was fetched when it is stopped first.
   */
  private enterDiscovery(entry: Pending, headers: AnswerHeaders): void {
    const target = this.target
    if (target === undefined) return this.settle(entry, { ...NOT_SENT, headers })
    const refusal = this.refusalOf(
      target,
      headers,
      AbortSignal.any([this.teardown.signal, entry.controller.signal]),
    )
    entry.phase = { kind: 'discovery', headers, soFar: refusal.soFar }
    this.work(async () => {
      const discovery = await refusal.done
      this.settle(entry, { wire: authorizationRequiredAnswerOf(discovery), headers })
    }, entry)
  }

  /** Sends one non-call request; a read request is re-sent once after a broken stream (D15, O05). */
  private request(
    method: RequestMethod,
    params: PlainRecord,
    sending: Sending = { kind: 'operation' },
  ): Promise<Answered> {
    return withOneResend(() => this.once(method, params, sending))
  }

  /** Registers one request and waits on its settlement only: never on its workflow. */
  private async once(
    method: RequestMethod,
    params: PlainRecord,
    sending: Sending,
  ): Promise<Answered> {
    const entry = this.begin(method, params, sending)
    return entry === undefined ? NOT_SENT : entry.answered
  }

  /** Sends the request an operation composed and reads its answer the way the operation does. */
  private async perform<T>(composed: ComposedRequest<T>): Promise<Outcome<T, TransportFailure>> {
    const sending: Sending =
      composed.values === undefined
        ? { kind: 'operation' }
        : { kind: 'operation', values: composed.values }
    return composed.read((await this.request(composed.method, composed.params, sending)).wire)
  }

  /**
   * Waits for `work` no longer than the session is open: the value when it settled first,
   * undefined once `close()` ran (or when the work rejected). The work itself goes on; its late
   * value is the caller's to discard.
   */
  private untilClosed<T>(work: Promise<T>): Promise<T | undefined> {
    const signal = this.teardown.signal
    if (signal.aborted) return Promise.resolve(undefined)
    return new Promise<T | undefined>(resolve => {
      const onClose = () => resolve(undefined)
      signal.addEventListener('abort', onClose, { once: true })
      void work
        .then(
          value => resolve(value),
          () => resolve(undefined),
        )
        .finally(() => signal.removeEventListener('abort', onClose))
    })
  }

  // ---- The operations (T2, T3, T5, T6) ----

  async discover(): Promise<Outcome<PeerIdentity, TransportFailure>> {
    const discovered = await discoverWith(
      {
        probe: async (version, request) =>
          (await this.request('server/discover', {}, { kind: 'probe', version, request })).wire,
        legacy: () => this.legacyPath(),
      },
      this.options.versions,
      this.bound,
    )
    if (
      'ok' in discovered &&
      this.connection.kind === 'modern' &&
      this.connection.version === undefined
    )
      this.connection = { kind: 'modern', version: discovered.ok.protocolVersion }
    return discovered
  }

  /** The legacy path (T3): `initialize` with the highest legacy version, then `notifications/initialized`. */
  private async legacyPath(): Promise<Outcome<PeerIdentity, TransportFailure>> {
    const params = legacyInitializeParamsOf(this.options.clientInfo)
    const sending: Sending = { kind: 'legacy-initialize' }
    let answered = await this.request('initialize', params, sending)
    if (answered.wire.kind === 'legacy-http') {
      // T8 I07: the peer may speak the legacy HTTP+SSE transport (T3).
      const entered = await this.enterSse()
      answered = entered ?? (await this.request('initialize', params, sending))
    }
    const read = legacyIdentityOf(answered.wire, this.bound)
    if ('failure' in read) return read
    this.connection = this.negotiated(read.ok.protocolVersion, answered.headers?.['mcp-session-id'])
    // `notifications/initialized` goes out before `discover` returns, so the requests that follow
    // find the peer initialized; no longer than the session is open, since it has no settlement.
    await this.untilClosed(this.notify('notifications/initialized', {}))
    return read
  }

  /** The connection once the legacy path read `initialize`: the revision, and the session when the peer gave one. */
  private negotiated(version: string, session: string | undefined): Connection {
    if (this.connection.kind === 'legacy-sse') return { kind: 'legacy-sse', version }
    return session === undefined
      ? { kind: 'legacy', version }
      : { kind: 'legacy', version, session }
  }

  /**
   * Tries the legacy HTTP+SSE fallback (T3), waiting on the handle and the line no longer than the
   * session is open. Undefined when the line entered the SSE mode; otherwise the answer that
   * `initialize` reports: a refused authorization of the GET (S05, S06), or `not-sent` (I07).
   */
  private async enterSse(): Promise<Answered | undefined> {
    const openGet = this.line.openGet?.bind(this.line)
    if (openGet === undefined || this.connection.kind === 'legacy-sse' || !this.usable)
      return NOT_SENT
    const headers = new Headers()
    if ((await this.untilClosed(this.authorizedToWrite(headers))) !== true) return NOT_SENT
    headers.set('mcp-protocol-version', OFFERED_LEGACY_VERSION)
    const opening = openGet(headers, this.teardown.signal)
    const opened = await this.untilClosed(opening)
    if (opened === undefined || !this.usable) {
      // A stream that comes back once the session is closed or dead is let go.
      void opening.then(
        late => {
          if (late.kind === 'stream') late.discard()
        },
        () => undefined,
      )
      return NOT_SENT
    }
    return this.enterFrom(opened)
  }

  /** Judges the GET the line reported (T3): the fallback holds, or it is read as a refusal or not-sent. */
  private async enterFrom(opened: GetOpened): Promise<Answered | undefined> {
    switch (opened.kind) {
      case 'stream': {
        const endpoint = this.heldEndpoint(opened)
        if (endpoint === undefined) {
          opened.discard()
          return NOT_SENT
        }
        opened.enter(endpoint)
        this.connection = { kind: 'legacy-sse' }
        return undefined
      }
      case 'status':
        return this.refusedGet(opened)
      case 'unsent':
      case 'unavailable':
        return NOT_SENT
      default: {
        const exhaustive: never = opened
        return exhaustive
      }
    }
  }

  /**
   * A GET answered with an error status, by the contract's rule for it (T3): S05 runs the refusal
   * flow until the session closes; the rest is I07's `not-sent`.
   */
  private async refusedGet(opened: Extract<GetOpened, { kind: 'status' }>): Promise<Answered> {
    const target = this.target
    const conclusion = fallbackGetConclusionOf(opened, this.options.versions)
    if (conclusion.kind === 'settle') return { wire: conclusion.wire }
    if (target === undefined) return NOT_SENT
    const refusal = this.refusalOf(target, opened.headers, this.teardown.signal)
    const discovery = (await this.untilClosed(refusal.done)) ?? refusal.soFar()
    return { wire: authorizationRequiredAnswerOf(discovery) }
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

  listActions(cursor?: string): Promise<Outcome<ListingPage, TransportFailure>> {
    return this.perform(listActionsRequest(cursor, this.view))
  }

  /**
   * `call` waits for the request to leave or to settle, whichever comes first (T5): the line took
   * it (`SentCall`, the answer still to come), or it settled before: `not-sent` is the call's own
   * failure, anything else its answer.
   */
  async call(
    request: CallRequest,
    signal: AbortSignal,
    observe?: (notification: PeerNotification) => void,
  ): Promise<Outcome<SentCall, Extract<TransportFailure, { kind: 'not-sent' }>>> {
    if (signal.aborted) return { failure: NOT_SENT_FAILURE }
    const composed = callRequestOf(request)
    const entry = this.begin(composed.method, composed.params, {
      kind: 'call',
      values: composed.values,
      signal,
      ...(observe === undefined ? {} : { observe }),
    })
    if (entry === undefined) return { failure: NOT_SENT_FAILURE }
    const first = await Promise.race([entry.departed.then(() => undefined), entry.answered])
    if (first?.wire.kind === 'not-sent') return { failure: first.wire.failure }
    return { ok: { requestId: entry.id, answer: entry.answered.then(answerOf) } }
  }

  /**
   * T5, by the contract's `cancelsByNotification`: the notification goes out as background work
   * and this returns at once (it does not prove the peer stopped); on modern Streamable HTTP the
   * answer stream is ended and the answer is abandoned.
   */
  cancelRequest(requestId: string): Promise<void> {
    if (cancelsByNotification(this.view))
      this.work(() => this.notify('notifications/cancelled', { requestId }))
    else {
      const entry = this.pending.get(requestId)
      if (entry !== undefined) this.stop(entry)
    }
    return Promise.resolve()
  }

  getTask(taskId: TaskId): Promise<Outcome<TaskReport | 'expired', TransportFailure>> {
    return this.perform(getTaskRequest(taskId))
  }

  getTaskResult(taskId: TaskId): Promise<Outcome<TaskAnswer, TransportFailure>> {
    return this.perform(getTaskResultRequest(taskId))
  }

  updateTask(
    taskId: TaskId,
    inputResponses: JsonValue,
  ): Promise<Outcome<'accepted', TransportFailure>> {
    return this.perform(updateTaskRequest(taskId, inputResponses))
  }

  cancelTask(taskId: TaskId): Promise<Outcome<'requested', TransportFailure>> {
    return this.perform(cancelTaskRequest(taskId))
  }

  /**
   * Closes the transport (T5): marks it closed, settles every request in flight by its phase there
   * and then, ends everything the session waits on, and then waits for the line's `close()` only.
   * One close for every caller: a second call gets the same result, after the line closed.
   */
  close(): Promise<void> {
    if (this.closing === undefined) {
      this.closed = true
      for (const entry of this.pending.values()) this.stop(entry)
      this.teardown.abort()
      this.closing = this.line.close()
    }
    return this.closing
  }
}
