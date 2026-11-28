import type { JsonValue } from '@omne-harness/json-text'
import type { Outcome } from '@omne-harness/operation-result'
import {
  NOT_SENT_FAILURE,
  OFFERED_LEGACY_VERSION,
  authorizationChallengeOf,
  credentialRefusalOf,
  authorizationRequiredAnswerOf,
  credentialRejectedAnswerOf,
  callAnswerOf,
  callRequestOf,
  cancelTaskRequest,
  cancelsByNotification,
  classifyWireEvent,
  clientEnvelopeOf,
  concludeAnswer,
  discoverWith,
  fallbackGetConclusionOf,
  getTaskRequest,
  getTaskResultRequest,
  legacyIdentityOf,
  legacyInitializeParamsOf,
  lineGoneAnswerOf,
  getSkillRequest,
  listActionsRequest,
  listEventTypesRequest,
  listSkillsRequest,
  pollEventsRequest,
  readResourceRequest,
  eventStreamMessageOf,
  mcpRequestHeadersOf,
  notSentFailureOf,
  notificationTextOf,
  peerRequestAnswerOf,
  listenEndOf,
  listenEventOf,
  readPeerMessage,
  requestClassOf,
  requestMetaOf,
  requestTextOf,
  responseTextOf,
  startAuthorizationDiscovery,
  stopAnswerOf,
  unusableAnswerOf,
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
  type ResourceContent,
  type SkillListingPage,
  type WireEvent,
} from '@omne-harness/mcp-contract'
import type {
  CallRequest,
  ListenEnd,
  ListenEvent,
  ListenFilter,
  EventListingPage,
  EventPollAnswer,
  EventRequest,
  EventStreamMessage,
  ListingPage,
  McpTransport,
  SentCall,
  TaskAnswer,
  TransportFailure,
  TransportMaterial,
} from '@omne-harness/mcp-contract/provider'
import type { AnswerHeaders, Exchange, GetOpened, Line, LineEvent, Outbound } from './line.ts'

export type SessionOptions = Readonly<{
  clientInfo: ClientInfo
  versions: ProtocolVersions
  fetchMetadata: MetadataFetch
  reportDefect: (defect: unknown) => void
  maxLongRequests?: number
}>

type Answered = Readonly<{ wire: WireAnswer; headers?: AnswerHeaders }>

type Connection =
  | Readonly<{ kind: 'modern'; version?: string }>
  | Readonly<{ kind: 'legacy'; version: string; session?: string }>
  | Readonly<{ kind: 'legacy-sse'; version?: string }>

type Sending =
  | Readonly<{ kind: 'probe'; version: string; request: 'discover' | 'discover-retry' }>
  | Readonly<{ kind: 'legacy-initialize' }>
  | Readonly<{
      kind: 'operation'
      values?: RequestValues
      headers?: Readonly<Record<string, string>>
    }>
  | Readonly<{
      kind: 'call'
      values: RequestValues
      signal: AbortSignal
      observe?: (notification: PeerNotification) => void
    }>
  | Readonly<{ kind: 'listen'; signal: AbortSignal; listen: (event: ListenEvent) => void }>
  | Readonly<{
      kind: 'events'
      signal: AbortSignal
      stream: (method: string, params: JsonValue | undefined) => void
      values: RequestValues
      headers: Readonly<Record<string, string>>
    }>

type Refusal = Readonly<{ soFar(): AuthorizationDiscovery; done: Promise<AuthorizationDiscovery> }>

type SentExchange = Readonly<{ kind: 'line' }> | Readonly<{ kind: 'stream'; abort(): void }>

type Phase =
  | Readonly<{ kind: 'authorizing' }>
  | Readonly<{ kind: 'sent'; exchange: SentExchange }>
  | Readonly<{ kind: 'discovery'; headers: AnswerHeaders; soFar(): AuthorizationDiscovery }>

const AUTHORIZING: Phase = { kind: 'authorizing' }
const SENT: Phase = { kind: 'sent', exchange: { kind: 'line' } }

type Pending = {
  readonly id: string
  readonly context: WireContext
  readonly controller: AbortController
  readonly answered: Promise<Answered>
  readonly settle: (answered: Answered) => void
  readonly departed: Promise<void>
  readonly depart: () => void
  readonly observe?: (notification: PeerNotification) => void
  readonly listen?: (event: ListenEvent) => void
  readonly stream?: (method: string, params: JsonValue | undefined) => void
  phase: Phase
}

const NOT_SENT: Answered = { wire: { kind: 'not-sent', failure: NOT_SENT_FAILURE } }

function drain(exchange: Exchange): void {
  if (exchange.kind !== 'stream') return
  void (async () => {
    try {
      for await (const message of exchange.messages) void message
    } catch {}
  })()
}

const answerOf = (answered: Answered): PeerAnswer => callAnswerOf(answered.wire)

export class Session implements McpTransport {
  readonly generation: Generation
  private readonly line: Line
  private readonly material: TransportMaterial
  private rejectionReported = false
  private listening = 0
  private readonly options: SessionOptions
  private readonly pending = new Map<string, Pending>()
  private readonly teardown = new AbortController()
  private nextId = 0
  private connection: Connection = { kind: 'modern' }
  private closed = false
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

  private get bound(): IdentityBound {
    return {
      generation: this.generation,
      instructionsByteLimit: this.material.instructionsByteLimit,
    }
  }

  private get view(): ConnectionView {
    const version = this.connection.version
    return {
      kind: 'streamable-http',
      version,
      mode: this.connection.kind === 'legacy-sse' ? 'sse' : 'streamable',
    }
  }

  private get sessionHeader(): string | undefined {
    return this.connection.kind === 'legacy' ? this.connection.session : undefined
  }

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

  private handedOver(answered: Answered): Answered {
    if (this.closed || this.dead === undefined) return answered
    return { ...answered, wire: unusableAnswerOf(answered.wire, this.dead) }
  }

  private get refused(): Extract<TransportFailure, { kind: 'not-sent' }> {
    return notSentFailureOf(this.closed ? undefined : this.dead)
  }

  private settle(entry: Pending, answered: Answered): void {
    if (!this.pending.delete(entry.id)) return
    entry.settle(this.handedOver(answered))
  }

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

  private die(cause: UnusableCause): void {
    this.dead ??= cause
    for (const entry of this.pending.values()) {
      const wire = lineGoneAnswerOf(entry.phase, cause)
      if (wire !== undefined) this.settle(entry, { wire })
    }
  }

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
      case 'broken':
        return this.die('stream-broken')
      default: {
        const exhaustive: never = event
        return exhaustive
      }
    }
  }

  private onPeerMessage(message: PeerMessage): void {
    if (message.kind === 'request') return this.work(() => this.respond(message))
    if (message.subscriptionId !== undefined) return this.onListened(message)
    if (message.method !== 'notifications/progress' || message.progressToken === undefined) return
    const entry = this.pending.get(message.progressToken)
    if (entry?.observe === undefined || message.params === undefined) return
    try {
      entry.observe({ kind: 'progress', notification: { untrusted: message.params } })
    } catch {}
  }

  // Calls one method of the credential handle: never after `close()` (V2). A handle that rejects
  // or throws answers nothing: its failure is the handle's (T9).
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

  private async authorize(headers: Headers): Promise<boolean> {
    if (!this.usable) return false
    const credential = this.material.credential
    if (credential === undefined) return true
    const answer = await this.callHandle(() => credential.authorize(headers))
    return answer !== undefined && !('failure' in answer)
  }

  private async authorizedToWrite(headers: Headers): Promise<boolean> {
    return (await this.authorize(headers)) && this.usable
  }

  private refusalOf(target: string, headers: AnswerHeaders, signal: AbortSignal): Refusal {
    const challenge = authorizationChallengeOf(headers['www-authenticate'])
    const run: AuthorizationDiscoveryRun = startAuthorizationDiscovery(
      target,
      challenge,
      this.options.fetchMetadata,
      signal,
    )
    return { soFar: run.soFar, done: run.done }
  }

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

  private async write(outbound: Outbound): Promise<void> {
    try {
      drain(await this.line.send(outbound, this.teardown.signal))
    } catch {}
  }

  /** Writes a response to a request of the peer (T3, P7): the POST is authorized; none after close. */
  private async respond(request: Extract<PeerMessage, { kind: 'request' }>): Promise<void> {
    const headers = new Headers()
    if (!(await this.authorizedToWrite(headers))) return
    for (const [name, value] of this.plainHeaders().entries()) headers.set(name, value)
    const answer = peerRequestAnswerOf(request)
    await this.write({ text: responseTextOf({ id: request.id, ...answer }), headers })
  }

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

  private versionOf(sending: Sending): string {
    switch (sending.kind) {
      case 'probe':
        return sending.version
      case 'legacy-initialize':
        return OFFERED_LEGACY_VERSION
      case 'operation':
      case 'call':
      case 'listen':
      case 'events':
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
    const listen = sending.kind === 'listen' ? sending.listen : undefined
    const stream = sending.kind === 'events' ? sending.stream : undefined
    return {
      id,
      context,
      controller: new AbortController(),
      answered: answered.promise,
      settle: answered.resolve,
      departed: departed.promise,
      depart: departed.resolve,
      ...(observe === undefined ? {} : { observe }),
      ...(listen === undefined ? {} : { listen }),
      ...(stream === undefined ? {} : { stream }),
      phase: AUTHORIZING,
    }
  }

  private begin(method: RequestMethod, params: PlainRecord, sending: Sending): Pending | undefined {
    if (!this.usable) return undefined
    const id = this.reserveId()
    const context: WireContext = {
      id,
      request: sending.kind === 'probe' ? sending.request : requestClassOf(method, false),
      session: this.carriesSession && method !== 'initialize',
      versions: this.options.versions,
      presented: this.material.credential !== undefined,
      ...(this.connection.kind === 'legacy-sse' ? { mode: 'sse' } : {}),
    }
    const entry = this.makeEntry(id, context, sending)
    this.pending.set(id, entry)
    if (sending.kind === 'call' || sending.kind === 'listen' || sending.kind === 'events')
      this.wireSignal(entry, sending.signal)
    this.work(() => this.sendOut(entry, method, params, sending), entry)
    return entry
  }

  private wireSignal(entry: Pending, signal: AbortSignal): void {
    const onAbort = () => this.stop(entry)
    if (signal.aborted) return onAbort()
    signal.addEventListener('abort', onAbort, { once: true })
    void entry.answered.then(() => signal.removeEventListener('abort', onAbort))
  }

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
    const extra =
      sending.kind === 'operation' || sending.kind === 'events' ? sending.headers : undefined
    for (const [name, value] of Object.entries(extra ?? {})) headers.set(name, value)
    const values =
      sending.kind === 'operation' || sending.kind === 'call' || sending.kind === 'events'
        ? sending.values
        : undefined
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
      exchange = { kind: 'aborted' }
    }
    this.dispatch(entry, exchange)
  }

  private dispatch(entry: Pending, exchange: Exchange): void {
    if (!this.inFlight(entry)) return drain(exchange)
    switch (exchange.kind) {
      case 'unsent':
        return void this.classify(entry, { kind: 'unsent' }, {})
      case 'aborted':
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
        return void this.classify(entry, { kind: 'http-aborted' }, {})
      }
      if (next.done) break
      this.onBodyMessage(entry, next.value, exchange.headers)
    }
    this.classify(entry, { kind: 'http-stream', messages: [], ended: true }, exchange.headers)
  }

  private onBodyMessage(entry: Pending, text: string, headers: AnswerHeaders): void {
    const peer = readPeerMessage(text)
    if (peer !== undefined) return this.onPeerMessage(peer)
    this.classify(entry, { kind: 'http-stream', messages: [text], ended: false }, headers)
  }

  private classify(entry: Pending, event: WireEvent, headers: AnswerHeaders): boolean {
    if (!this.inFlight(entry)) return true
    if (entry.phase.kind !== 'sent') return false
    const classified = classifyWireEvent(event, entry.context)
    if (classified.kind !== 'answer') return false
    this.apply(entry, concludeAnswer(classified, entry.context), headers)
    return true
  }

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
      case 'credential-rejected':
        this.settle(entry, { wire: credentialRejectedAnswerOf(), headers })
        return this.rejectCredential(headers)
      default: {
        const exhaustive: never = conclusion
        return exhaustive
      }
    }
  }

  // The peer refused the credential: the handle hears it once (V3), and the connection is not usable.
  private rejectCredential(headers: AnswerHeaders): void {
    const credential = this.material.credential
    if (credential !== undefined && !this.rejectionReported) {
      this.rejectionReported = true
      const refusal = credentialRefusalOf(headers['www-authenticate'])
      void this.callHandle(() => credential.reportRejection(refusal))
    }
    this.die('credential-rejected')
  }

  private enterDiscovery(entry: Pending, headers: AnswerHeaders): void {
    const refusal = this.refusalOf(
      this.material.target,
      headers,
      AbortSignal.any([this.teardown.signal, entry.controller.signal]),
    )
    entry.phase = { kind: 'discovery', headers, soFar: refusal.soFar }
    this.work(async () => {
      const discovery = await refusal.done
      this.settle(entry, { wire: authorizationRequiredAnswerOf(discovery), headers })
    }, entry)
  }

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
    return entry === undefined
      ? { wire: { kind: 'not-sent', failure: this.refused } }
      : entry.answered
  }

  private async perform<T>(composed: ComposedRequest<T>): Promise<Outcome<T, TransportFailure>> {
    const sending: Sending = {
      kind: 'operation',
      ...(composed.values === undefined ? {} : { values: composed.values }),
      ...(composed.headers === undefined ? {} : { headers: composed.headers }),
    }
    return composed.read((await this.request(composed.method, composed.params, sending)).wire)
  }

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

  private async legacyPath(): Promise<Outcome<PeerIdentity, TransportFailure>> {
    const params = legacyInitializeParamsOf(this.options.clientInfo)
    const sending: Sending = { kind: 'legacy-initialize' }
    let answered = await this.request('initialize', params, sending)
    if (answered.wire.kind === 'legacy-http') {
      const entered = await this.enterSse()
      answered =
        entered === undefined
          ? await this.request('initialize', params, sending)
          : this.handedOver(entered)
    }
    const read = legacyIdentityOf(answered.wire, this.bound)
    if ('failure' in read) return read
    this.connection = this.negotiated(read.ok.protocolVersion, answered.headers?.['mcp-session-id'])
    // `notifications/initialized` goes out before `discover` returns, so the requests that follow
    // find the peer initialized; no longer than the session is open, since it has no settlement.
    await this.untilClosed(this.notify('notifications/initialized', {}))
    return read
  }

  private negotiated(version: string, session: string | undefined): Connection {
    if (this.connection.kind === 'legacy-sse') return { kind: 'legacy-sse', version }
    return session === undefined
      ? { kind: 'legacy', version }
      : { kind: 'legacy', version, session }
  }

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

  private async refusedGet(opened: Extract<GetOpened, { kind: 'status' }>): Promise<Answered> {
    const conclusion = fallbackGetConclusionOf(
      opened,
      this.options.versions,
      this.material.credential !== undefined,
    )
    if (conclusion.kind === 'settle') return { wire: conclusion.wire }
    if (conclusion.kind === 'credential-rejected') {
      this.rejectCredential(opened.headers)
      return { wire: credentialRejectedAnswerOf() }
    }
    const refusal = this.refusalOf(this.material.target, opened.headers, this.teardown.signal)
    const discovery = (await this.untilClosed(refusal.done)) ?? refusal.soFar()
    return { wire: authorizationRequiredAnswerOf(discovery) }
  }

  private heldEndpoint(opened: Extract<GetOpened, { kind: 'stream' }>): string | undefined {
    const target = this.material.target
    const type = (opened.headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase()
    if (opened.status !== 200 || type !== 'text/event-stream') return undefined
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

  listEventTypes(cursor?: string): Promise<Outcome<EventListingPage, TransportFailure>> {
    return this.perform(listEventTypesRequest(cursor))
  }

  listSkills(cursor?: string): Promise<Outcome<SkillListingPage, TransportFailure>> {
    return this.perform(listSkillsRequest(cursor))
  }

  getSkill(uri: string): Promise<Outcome<JsonValue, TransportFailure>> {
    return this.perform(getSkillRequest(uri))
  }

  readResource(uri: string): Promise<Outcome<ResourceContent, TransportFailure>> {
    return this.perform(readResourceRequest(uri))
  }

  async call(
    request: CallRequest,
    signal: AbortSignal,
    observe?: (notification: PeerNotification) => void,
  ): Promise<Outcome<SentCall, Extract<TransportFailure, { kind: 'not-sent' }>>> {
    if (signal.aborted) return { failure: this.refused }
    const composed = callRequestOf(request)
    const entry = this.begin(composed.method, composed.params, {
      kind: 'call',
      values: composed.values,
      signal,
      ...(observe === undefined ? {} : { observe }),
    })
    if (entry === undefined) return { failure: this.refused }
    const first = await Promise.race([entry.departed.then(() => undefined), entry.answered])
    if (first?.wire.kind === 'not-sent') return { failure: first.wire.failure }
    return { ok: { requestId: entry.id, answer: entry.answered.then(answerOf) } }
  }

  // A long request: answered by its end, never as a failed request; a broken one leaves the connection as it is.
  async listen(
    filter: ListenFilter,
    signal: AbortSignal,
    observe: (event: ListenEvent) => void,
  ): Promise<ListenEnd> {
    if (signal.aborted) return { kind: 'stopped' }
    if (this.connection.kind !== 'modern' || this.listening >= (this.options.maxLongRequests ?? 0))
      return { kind: 'refused', failure: NOT_SENT_FAILURE }
    this.listening += 1
    try {
      const params = { notifications: { toolsListChanged: filter.toolsListChanged } }
      const entry = this.begin('subscriptions/listen', params, {
        kind: 'listen',
        signal,
        listen: observe,
      })
      if (entry === undefined) return { kind: 'refused', failure: this.refused }
      return listenEndOf((await entry.answered).wire)
    } finally {
      this.listening -= 1
    }
  }

  private onListened(message: Extract<PeerMessage, { kind: 'notification' }>): void {
    const entry =
      message.subscriptionId === undefined ? undefined : this.pending.get(message.subscriptionId)
    if (entry?.stream !== undefined) {
      try {
        entry.stream(message.method, message.params)
      } catch {}
      return
    }
    const event = listenEventOf(message.method, message.params)
    if (entry?.listen === undefined || event === undefined) return
    try {
      entry.listen(event)
    } catch {}
  }

  pollEvents(request: EventRequest): Promise<Outcome<EventPollAnswer, TransportFailure>> {
    return this.perform(pollEventsRequest(request))
  }

  // A stream of one subscription is a long request too: it counts against the same bound.
  async streamEvents(
    request: EventRequest,
    signal: AbortSignal,
    observe: (message: EventStreamMessage) => void,
  ): Promise<ListenEnd> {
    if (signal.aborted) return { kind: 'stopped' }
    if (this.connection.kind !== 'modern' || this.listening >= (this.options.maxLongRequests ?? 0))
      return { kind: 'refused', failure: NOT_SENT_FAILURE }
    this.listening += 1
    try {
      const entry = this.begin(
        'events/stream',
        { name: request.name, cursor: request.cursor },
        {
          kind: 'events',
          signal,
          values: { arguments: request.arguments },
          headers: request.headers,
          stream: (method, params) => {
            const message = eventStreamMessageOf(method, params)
            if (message !== undefined) observe(message)
          },
        },
      )
      if (entry === undefined) return { kind: 'refused', failure: this.refused }
      return listenEndOf((await entry.answered).wire)
    } finally {
      this.listening -= 1
    }
  }

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
