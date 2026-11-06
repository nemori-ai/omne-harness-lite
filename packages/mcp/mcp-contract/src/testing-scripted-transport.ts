// An in-memory transport that answers from a `PeerScript`. It composes the JSON-RPC requests that
// SPEC T3 names (request ids, the `_meta` envelope, the progress token) with the contract's one
// implementation, turns each scripted reply into the wire event a real line would report,
// classifies it with `classifyWireEvent` and takes the conclusion of the decision layer. A request
// is registered before it is authorized; the caller's signal and `close()` settle it by its phase
// with the contract's one rule (T5). It keeps only the in-memory wire and its in-flight table, and
// records what the peer received. It does not speak a protocol and is not a product transport.
import type { JsonValue } from '@omne-harness/json-text'
import type { Outcome } from '@omne-harness/operation-result'
import { callAnswerOf, legacyIdentityOf } from './answer-readings.ts'
import { authorizationChallengeOf, startAuthorizationDiscovery } from './authorization.ts'
import type { Generation, TaskId } from './brands.ts'
import {
  OFFERED_LEGACY_VERSION,
  callRequestOf,
  cancelTaskRequest,
  getTaskRequest,
  getTaskResultRequest,
  legacyInitializeParamsOf,
  listActionsRequest,
  notificationTextOf,
  peerRequestAnswerOf,
  requestMetaOf,
  requestTextOf,
  responseTextOf,
  updateTaskRequest,
  type ComposedRequest,
  type NotificationMethod,
  type RequestMethod,
} from './composition.ts'
import { cancelsByNotification, type ConnectionView } from './connection.ts'
import {
  ABANDONED,
  NOT_SENT_FAILURE,
  authorizationRequiredAnswerOf,
  concludeAnswer,
  lineGoneAnswerOf,
  requestClassOf,
  stopAnswerOf,
  type AnswerConclusion,
  type ProtocolVersions,
  type UnusableCause,
  type WireAnswer,
} from './decisions.ts'
import { discoverWith, withOneResend } from './discovery.ts'
import { clientEnvelopeOf, mcpRequestHeadersOf, type ClientInfo } from './envelope.ts'
import type { AuthorizationDiscovery, TaskReport } from './outcomes.ts'
import { isPlainJson, isPlainRecord, type PlainJson, type PlainRecord } from './plain.ts'
import type { HttpCredentialHandle } from './ports.ts'
import type { IdentityBound } from './readers.ts'
import { isModernProtocolVersion } from './revisions.ts'
import type {
  PeerNotificationScript,
  PeerReceived,
  PeerReply,
  PeerScript,
  Replies,
} from './testing-transport.ts'
import { jsonOf } from './testing-values.ts'
import type {
  CallRequest,
  ListingPage,
  McpTransport,
  McpTransportFactory,
  PeerNotification,
  SentCall,
  TaskAnswer,
  TransportFailure,
  TransportMaterial,
} from './transport.ts'
import type { PeerIdentity } from './values.ts'
import { classifyWireEvent, type RequestClass, type WireContext, type WireEvent } from './wire.ts'

export type ScriptedTransportOptions = Readonly<{
  /**
   * The modern versions the transport speaks on `server/discover`, highest first. A legacy version
   * here is a `RangeError`: the legacy path offers `LEGACY_PROTOCOL_VERSIONS`. Default:
   * `['2026-07-28']`.
   */
  protocolVersions?: readonly string[]
  clientInfo?: Readonly<{ name: string; version: string }>
  /** How long a stdio `server/discover` waits before the peer counts as legacy. Default: 0. */
  probeTimeoutMs?: number
  /** Awaited before the peer answers each request: a test orders answers with it. */
  pace?: (received: PeerReceived) => Promise<void> | void
}>

export type ScriptedTransportFactory = McpTransportFactory &
  Readonly<{
    /** What the peer received so far, in order. */
    received(): readonly PeerReceived[]
  }>

type Request = Extract<PeerReceived, { kind: 'request' }>
type Headers = Readonly<{ [name: string]: string }>

const DEFAULT_CLIENT_INFO: ClientInfo = { name: 'scripted-transport', version: '0' }

/** The plain record a message of this side reads as, the way the peer would read it. */
function plainRecordOf(text: string): PlainRecord {
  const parsed: unknown = JSON.parse(text)
  if (!isPlainJson(parsed) || !isPlainRecord(parsed))
    throw new TypeError('a message of this side did not write as a JSON object')
  return parsed
}

function isList(value: Replies): value is readonly PeerReply[] {
  return Array.isArray(value)
}

const SILENT: PeerReply = { kind: 'silent' }

/** The peer: picks the scripted reply for each request, in order, and records what it saw. */
class ScriptedPeer {
  readonly log: PeerReceived[] = []
  private readonly consumed = new Map<string, number>()
  private readonly script: PeerScript
  private readonly versions: readonly string[]

  constructor(script: PeerScript, versions: readonly string[]) {
    this.script = script
    this.versions = versions
  }

  private pick(key: string, replies: Replies | undefined, fallback: PeerReply): PeerReply {
    const list = replies === undefined ? undefined : isList(replies) ? replies : [replies]
    if (list === undefined || list.length === 0) return fallback
    const index = this.consumed.get(key) ?? 0
    this.consumed.set(key, index + 1)
    return list[Math.min(index, list.length - 1)] ?? fallback
  }

  reply(method: string, params: PlainRecord): PeerReply {
    const error = (code: number, message: string): PeerReply => ({
      kind: 'error',
      error: { code, message },
    })
    const text = (key: string) => {
      const value = params[key]
      return typeof value === 'string' ? value : ''
    }
    const task = this.script.tasks?.[text('taskId')]
    switch (method) {
      case 'server/discover':
        return this.pick(method, this.script.discover, {
          kind: 'result',
          result: { supportedVersions: [...this.versions], capabilities: { tools: {} } },
        })
      case 'initialize':
        return this.pick(method, this.script.initialize, error(-32601, 'Method not found'))
      case 'tools/list':
        return this.pick(
          `${method}:${text('cursor')}`,
          this.script.listing?.[text('cursor')],
          error(-32602, 'Unknown cursor'),
        )
      case 'tools/call':
        return this.pick(
          `${method}:${text('name')}`,
          this.script.calls?.[text('name')],
          error(-32602, 'Unknown tool'),
        )
      case 'tasks/get':
        return this.pick(`${method}:${text('taskId')}`, task?.get, error(-32602, 'Task not found'))
      case 'tasks/update':
      case 'tasks/cancel': {
        if (task === undefined) return error(-32602, 'Task not found')
        const scripted = method === 'tasks/update' ? task.update : task.cancel
        return this.pick(`${method}:${text('taskId')}`, scripted, { kind: 'result', result: {} })
      }
      default:
        return error(-32601, 'Method not found')
    }
  }

  wellKnown(url: string): PlainJson | undefined {
    this.log.push({ kind: 'fetch', url })
    return this.script.wellKnown?.[new URL(url).pathname]
  }

  /** The requests the peer sends at a point of the legacy path. */
  peerRequests(at: 'initialize' | 'initialized'): readonly Readonly<{ method: string }>[] {
    return (this.script.peerRequests ?? []).filter(request => (request.at ?? 'initialized') === at)
  }

  /** How the peer answers a notification of the client. */
  notificationReply(method: string): PeerReply | undefined {
    const replies = this.script.notifications
    return replies === undefined ? undefined : this.pick(`notification:${method}`, replies, SILENT)
  }
}

/** What one request settled with: the wire answer, and the headers of an HTTP answer. */
type Answered = Readonly<{ wire: WireAnswer; headers?: Headers }>

const NOT_SENT: Answered = { wire: { kind: 'not-sent', failure: NOT_SENT_FAILURE } }

/**
 * The phase of a request in flight (T5), with what each phase holds: the stdio probe time once
 * sent, and the headers of the refusal with the abort of its discovery once discovering.
 */
type Phase =
  | Readonly<{ kind: 'authorizing' }>
  | Readonly<{ kind: 'sent'; cancelProbe(): void }>
  | Readonly<{
      kind: 'discovery'
      headers: Headers
      soFar(): AuthorizationDiscovery
      abort(): void
    }>

const AUTHORIZING: Phase = { kind: 'authorizing' }

/**
 * One request in flight: registered before anything is awaited, with its own settlement (what a
 * caller waits on) and its departure (when the peer took it: what `call` waits on, with the
 * settlement, whichever comes first). A defect of the script fails the settlement.
 */
type Pending = {
  readonly id: string
  readonly context: WireContext
  readonly answered: Promise<Answered>
  readonly resolve: (answered: Answered) => void
  readonly fail: (defect: unknown) => void
  readonly departed: Promise<void>
  readonly depart: () => void
  readonly observe?: (notification: PeerNotification) => void
  readonly progressToken: string
  phase: Phase
}

/** How one request is sent: the observer of a call, the `_meta` version, the probe time. */
type Dispatch = Readonly<{
  observe?: (notification: PeerNotification) => void
  version?: string
  request?: RequestClass
  probeTimeoutMs?: number
  /** Params the caller wrote as value trees, written as they are (RFC-0010). */
  values?: Readonly<{ [key: string]: JsonValue }>
}>

/** The headers of an HTTP reply by lower-case name. */
function lowerCased(headers: Headers | undefined): Headers {
  return Object.fromEntries(
    Object.entries(headers ?? {}).map(([name, value]) => [name.toLowerCase(), value]),
  )
}

/** The wire event a reply makes for the request `id` on the material (T8). */
function eventOf(reply: PeerReply, id: string, stdio: boolean): WireEvent | undefined {
  const message = (member: Readonly<{ [key: string]: PlainJson }>): WireEvent => {
    const text = JSON.stringify({ jsonrpc: '2.0', id, ...member })
    return stdio ? { kind: 'line', text } : { kind: 'http-stream', messages: [text], ended: true }
  }
  switch (reply.kind) {
    case 'result':
      return message({ result: reply.result })
    case 'error':
      return message({ error: reply.error })
    case 'stream-breaks':
      return stdio ? { kind: 'stdio-ended', stdoutEndedAt: 0 } : { kind: 'http-aborted' }
    case 'process-exits':
      return { kind: 'stdio-ended', stdoutEndedAt: 0, exitedAt: 0 }
    case 'http':
      return httpEventOf(reply)
    case 'silent':
    case 'unsent':
      return undefined
    default: {
      const exhaustive: never = reply
      return exhaustive
    }
  }
}

/** The wire event of an HTTP reply: a 2xx body stream, or an error status with its body. */
function httpEventOf(reply: Extract<PeerReply, { kind: 'http' }>): WireEvent {
  if (reply.status < 200)
    throw new TypeError(`script: an http ${reply.status} reply is not observable`)
  if (reply.status < 300)
    return {
      kind: 'http-stream',
      messages: reply.body === undefined ? [] : [reply.body],
      ended: true,
    }
  return {
    kind: 'http-status',
    status: reply.status,
    headers: lowerCased(reply.headers),
    body: reply.body ?? '',
  }
}

/**
 * Whether the peer may have received a request answered with `reply`: everything but a request
 * that fails before it leaves, and an HTTP error status, which settles the request before any
 * answer stream began (T5: the boundary of `sent`).
 */
function departs(reply: PeerReply): boolean {
  if (reply.kind === 'unsent') return false
  return reply.kind !== 'http' || reply.status < 300
}

/** One transport opened on one material, against the scripted peer. */
class ScriptedTransport implements McpTransport {
  readonly generation: Generation
  /** The requests in flight: an entry leaves the table when it settles, and only then. */
  private readonly pending = new Map<string, Pending>()
  /** The ids of the requests that the credential handle authorized. */
  private readonly authorized = new Set<string>()
  private nextId = 0
  private peerRequestCount = 0
  private version: string | undefined
  private closed = false
  private dead: UnusableCause | undefined
  /** The `Mcp-Session-Id` of a legacy Streamable HTTP connection. */
  private session: string | undefined
  private readonly peer: ScriptedPeer
  private readonly material: TransportMaterial
  private readonly options: ScriptedTransportOptions
  private readonly versions: ProtocolVersions

  constructor(
    peer: ScriptedPeer,
    material: TransportMaterial,
    options: ScriptedTransportOptions,
    versions: ProtocolVersions,
  ) {
    this.peer = peer
    this.material = material
    this.options = options
    this.versions = versions
    this.generation = material.generation
  }

  private get stdio(): boolean {
    return this.material.kind === 'stdio'
  }

  private get clientInfo(): ClientInfo {
    return this.options.clientInfo ?? DEFAULT_CLIENT_INFO
  }

  /** The `_meta` envelope (T3), by the contract's one implementation. */
  private envelope(version = this.version ?? this.versions[0]): PlainRecord {
    return clientEnvelopeOf(version, this.clientInfo)
  }

  /** The material facts that bind the peer instructions (T3, S3). */
  private get bound(): IdentityBound {
    return {
      generation: this.generation,
      instructionsByteLimit: this.material.instructionsByteLimit,
    }
  }

  private get usable(): boolean {
    return !this.closed && this.dead === undefined
  }

  private get credential(): HttpCredentialHandle | undefined {
    return this.material.kind === 'streamable-http' ? this.material.credential : undefined
  }

  /** The connection as the T2 and T5 rules see it. */
  private get connection(): ConnectionView {
    return this.material.kind === 'stdio'
      ? { kind: 'stdio', version: this.version }
      : { kind: 'streamable-http', version: this.version, mode: 'streamable' }
  }

  private reserveId(): string {
    this.nextId += 1
    return `r${this.nextId}`
  }

  private headersOf(method: string, params: PlainRecord, version: string) {
    return this.material.kind === 'streamable-http'
      ? { headers: mcpRequestHeadersOf(method, params, version, this.session) }
      : {}
  }

  // ---- The requests in flight: registration, the phases, and what settles them ----

  private settle(entry: Pending, answered: Answered): void {
    if (!this.pending.delete(entry.id)) return
    if (entry.phase.kind === 'sent') entry.phase.cancelProbe()
    entry.resolve(answered)
  }

  /** Stops a request where it stands (T5): the caller's signal fired, or `close()` ran. */
  private stop(entry: Pending): void {
    if (!this.pending.has(entry.id)) return
    const phase = entry.phase
    if (phase.kind === 'discovery') phase.abort()
    this.settle(
      entry,
      phase.kind === 'discovery'
        ? { wire: stopAnswerOf(phase), headers: phase.headers }
        : { wire: stopAnswerOf(phase) },
    )
  }

  /** The transport is unusable from now on; every request in flight settles by its phase (T8). */
  private unusable(cause: UnusableCause): void {
    this.dead ??= cause
    for (const entry of this.pending.values()) {
      const wire = lineGoneAnswerOf(entry.phase, cause)
      if (wire !== undefined) this.settle(entry, { wire })
    }
  }

  /**
   * Registers one request and starts its sending in the background; the caller waits on the
   * settlement. Undefined when the transport cannot be used: nothing is registered.
   */
  private begin(
    method: RequestMethod,
    params: PlainRecord,
    how: Dispatch,
    signal?: AbortSignal,
  ): Pending | undefined {
    if (!this.usable) return undefined
    const id = this.reserveId()
    const context: WireContext = {
      id,
      request: how.request ?? requestClassOf(method, false),
      session: this.session !== undefined && method !== 'initialize',
      versions: this.versions,
    }
    const answered = Promise.withResolvers<Answered>()
    const departed = Promise.withResolvers<void>()
    const entry: Pending = {
      id,
      context,
      answered: answered.promise,
      resolve: answered.resolve,
      fail: answered.reject,
      departed: departed.promise,
      depart: departed.resolve,
      ...(how.observe === undefined ? {} : { observe: how.observe }),
      progressToken: id,
      phase: AUTHORIZING,
    }
    this.pending.set(id, entry)
    if (signal !== undefined) this.wireSignal(entry, signal)
    void this.send(entry, method, params, how)
    return entry
  }

  /** Wires the call's signal to the entry: once it fires, the entry is stopped where it stands (T5). */
  private wireSignal(entry: Pending, signal: AbortSignal): void {
    const onAbort = () => this.stop(entry)
    if (signal.aborted) return onAbort()
    signal.addEventListener('abort', onAbort, { once: true })
    const unwire = () => signal.removeEventListener('abort', onAbort)
    void entry.answered.then(unwire, unwire)
  }

  /**
   * The sending of one request: authorizes it, then hands it to the peer. An entry stopped
   * meanwhile is left as it settled. A defect of the script fails the settlement.
   */
  private async send(
    entry: Pending,
    method: RequestMethod,
    params: PlainRecord,
    how: Dispatch,
  ): Promise<void> {
    try {
      if (!(await this.authorize(entry.id))) return this.settle(entry, NOT_SENT)
      if (!this.pending.has(entry.id)) return
      this.dispatch(entry, method, params, how)
    } catch (defect) {
      this.pending.delete(entry.id)
      entry.fail(defect)
    }
  }

  /** Composes the request, records it, and lets the peer answer after the pace hook. */
  private dispatch(
    entry: Pending,
    method: RequestMethod,
    params: PlainRecord,
    how: Dispatch,
  ): void {
    const id = entry.id
    const version = how.version ?? this.version ?? this.versions[0]
    const meta = requestMetaOf(method, id, version, this.clientInfo)
    const written = plainRecordOf(
      requestTextOf({ id, method, params: { ...params, _meta: meta }, values: how.values ?? {} }),
    )
    const sent = isPlainRecord(written['params']) ? written['params'] : {}
    const request: Request = {
      kind: 'request',
      id,
      method,
      params: sent,
      ...this.headersOf(method, params, version),
    }
    const reply = this.peer.reply(method, sent)
    this.validate(reply, method)
    entry.phase = { kind: 'sent', cancelProbe: () => undefined }
    if (reply.kind === 'unsent') {
      // The request fails before it leaves; the peer does not see it (T8 X01, X02).
      return this.apply(
        entry,
        concludeAnswer(
          classifyWireEvent({ kind: 'unsent' }, entry.context),
          entry.context,
          this.material.kind,
        ),
        {},
      )
    }
    this.peer.log.push(request)
    if (departs(reply)) entry.depart()
    void this.deliver(request, reply, entry, how.probeTimeoutMs)
  }

  /** A reply the material cannot carry is a defect of the script, reported at once. */
  private validate(reply: PeerReply, method: string): void {
    if (reply.kind === 'http' && this.stdio)
      throw new TypeError(`script: an http reply to ${method} on stdio material`)
    if (reply.kind === 'process-exits' && !this.stdio)
      throw new TypeError(`script: a process-exits reply to ${method} on streamable-http material`)
  }

  /** D13: starts the stdio probe time of `server/discover`; an answer before it ends clears it. */
  private startProbe(entry: Pending, milliseconds: number): void {
    const probe = setTimeout(() => {
      const conclusion = concludeAnswer(
        classifyWireEvent({ kind: 'nothing' }, entry.context),
        entry.context,
        this.material.kind,
      )
      this.apply(entry, conclusion, {})
    }, milliseconds)
    entry.phase = { kind: 'sent', cancelProbe: () => clearTimeout(probe) }
  }

  /**
   * Answers after the pace hook. The probe time starts only then, so a test that holds the answer
   * does not turn a modern peer into a legacy one. A defect of the script fails the settlement.
   */
  private async deliver(
    request: Request,
    reply: PeerReply,
    entry: Pending,
    probeTimeoutMs: number | undefined,
  ): Promise<void> {
    try {
      await this.options.pace?.(request)
      if (!this.pending.has(request.id)) return
      if (probeTimeoutMs !== undefined) this.startProbe(entry, probeTimeoutMs)
      if (reply.kind === 'result')
        for (const notification of reply.notifications ?? []) this.notify(notification, entry)
      const event = eventOf(reply, request.id, this.stdio)
      if (event === undefined) return
      const headers = lowerCased(
        reply.kind === 'http' || reply.kind === 'result' ? reply.headers : undefined,
      )
      const conclusion = concludeAnswer(
        classifyWireEvent(event, entry.context),
        entry.context,
        this.material.kind,
      )
      this.apply(entry, conclusion, headers)
    } catch (defect) {
      this.pending.delete(entry.id)
      entry.fail(defect)
    }
  }

  /** Settles the request as the T8 row says, and what the row says of the transport. */
  private apply(entry: Pending, conclusion: AnswerConclusion, headers: Headers): void {
    switch (conclusion.kind) {
      case 'wait':
        return
      case 'settle':
        this.settle(entry, { wire: conclusion.wire, headers })
        if (conclusion.unusable !== undefined) this.unusable(conclusion.unusable)
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
   * A notification of the peer during a request. The peer fills in the progress token of the
   * request when the script names none. A progress notification whose token is the token of the
   * call goes to `observe` with its `params` as written; any other notification is dropped.
   */
  private notify(notification: PeerNotificationScript, entry: Pending): void {
    const written = isPlainRecord(notification.params) ? notification.params : {}
    const params =
      written['progressToken'] === undefined
        ? { ...written, progressToken: entry.progressToken }
        : written
    const observe = entry.observe
    if (notification.method !== 'notifications/progress' || observe === undefined) return
    if (params['progressToken'] !== entry.progressToken) return
    try {
      observe({ kind: 'progress', notification: { untrusted: jsonOf(params) } })
    } catch {
      // S6: an observer that throws does not change the outcome.
    }
  }

  /**
   * T4: the request was refused. `reportRejection` once on the handle that authorized it, and the
   * discovery of R4, run in the background; the request settles when both ended, or by its phase
   * when it is stopped first (T5).
   */
  private enterDiscovery(entry: Pending, headers: Headers): void {
    const target = this.material.kind === 'streamable-http' ? this.material.target : undefined
    if (target === undefined)
      throw new TypeError('script: a refused authorization on stdio material')
    const credential = this.credential
    // A handle whose reportRejection rejects or throws is ignored (T9).
    const reported =
      credential !== undefined && this.authorized.has(entry.id)
        ? Promise.resolve()
            .then(() => credential.reportRejection())
            .catch(() => undefined)
        : Promise.resolve()
    const controller = new AbortController()
    const run = startAuthorizationDiscovery(
      target,
      authorizationChallengeOf(headers['www-authenticate']),
      async url => {
        const metadata = this.peer.wellKnown(url)
        return metadata === undefined ? undefined : jsonOf(metadata)
      },
      controller.signal,
    )
    entry.phase = { kind: 'discovery', headers, soFar: run.soFar, abort: () => controller.abort() }
    void Promise.all([reported, run.done]).then(([, discovery]) =>
      this.settle(entry, { wire: authorizationRequiredAnswerOf(discovery), headers }),
    )
  }

  /** Authorizes an outgoing request with the credential handle, when the material has one. */
  private async authorize(id: string): Promise<boolean> {
    const credential = this.credential
    if (credential === undefined) return true
    const headers = new Headers()
    // A handle whose authorize rejects or throws leaves the request not sent (T9).
    const answer = await Promise.resolve()
      .then(() => credential.authorize(headers))
      .catch(() => undefined)
    if (answer === undefined || 'failure' in answer) return false
    this.authorized.add(id)
    return true
  }

  /** Sends one non-call request; the row may send it once more after a broken stream (D15, O05). */
  private request(
    method: RequestMethod,
    params: PlainRecord,
    how: Dispatch = {},
  ): Promise<Answered> {
    return withOneResend(() => this.once(method, params, how))
  }

  /** Sends the request an operation composed and reads its answer the way the operation does. */
  private async perform<T>(composed: ComposedRequest<T>): Promise<Outcome<T, TransportFailure>> {
    const how: Dispatch = composed.values === undefined ? {} : { values: composed.values }
    return composed.read((await this.request(composed.method, composed.params, how)).wire)
  }

  /** Registers one request and waits on its settlement only: never on its sending. */
  private once(method: RequestMethod, params: PlainRecord, how: Dispatch): Promise<Answered> {
    const probe = method === 'server/discover' && this.stdio
    const entry = this.begin(method, params, {
      ...how,
      ...(probe ? { probeTimeoutMs: this.options.probeTimeoutMs ?? 0 } : {}),
    })
    return entry === undefined ? Promise.resolve(NOT_SENT) : entry.answered
  }

  /** Sends a notification. Whatever the peer answers to it does not change any outcome (T8 N01). */
  private sendNotification(method: NotificationMethod, params: PlainRecord): void {
    const version = this.version ?? this.versions[0]
    const written = plainRecordOf(
      notificationTextOf({ method, params: { ...params, _meta: this.envelope() } }),
    )
    this.peer.log.push({
      kind: 'notification',
      method,
      params: written['params'] ?? {},
      ...this.headersOf(method, params, version),
    })
    const reply = this.peer.notificationReply(method)
    if (reply === undefined || !this.stdio) return
    if (reply.kind === 'stream-breaks') this.unusable('stream-broken')
    if (reply.kind === 'process-exits') this.unusable('process-exited')
  }

  async discover(): Promise<Outcome<PeerIdentity, TransportFailure>> {
    const discovered = await discoverWith(
      {
        probe: async (version, request) =>
          (await this.request('server/discover', {}, { version, request })).wire,
        legacy: () => this.legacyPath(),
      },
      this.versions,
      this.bound,
    )
    if ('ok' in discovered) this.version = discovered.ok.protocolVersion
    return discovered
  }

  /**
   * The requests of the peer, at one point of the legacy path: `ping` answers an empty result,
   * every other request `-32601` (T3).
   */
  private answerPeerRequests(at: 'initialize' | 'initialized'): void {
    for (const request of this.peer.peerRequests(at)) {
      const id = `p${(this.peerRequestCount += 1)}`
      const answer = peerRequestAnswerOf({
        kind: 'request',
        id: jsonOf(id),
        method: request.method,
      })
      const written = plainRecordOf(responseTextOf({ id: jsonOf(id), ...answer }))
      this.peer.log.push({
        kind: 'response',
        id,
        ...(written['result'] === undefined ? {} : { result: written['result'] }),
        ...(written['error'] === undefined ? {} : { error: written['error'] }),
      })
    }
  }

  /** The legacy path: `initialize` with the highest legacy version, then `notifications/initialized`. */
  private async legacyPath(): Promise<Outcome<PeerIdentity, TransportFailure>> {
    const answered = await this.request('initialize', legacyInitializeParamsOf(this.clientInfo), {
      version: OFFERED_LEGACY_VERSION,
    })
    this.answerPeerRequests('initialize')
    const read = legacyIdentityOf(answered.wire, this.bound)
    if ('failure' in read) return read
    this.version = read.ok.protocolVersion
    if (this.material.kind === 'streamable-http')
      this.session = answered.headers?.['mcp-session-id']
    this.sendNotification('notifications/initialized', {})
    this.answerPeerRequests('initialized')
    return read
  }

  async listActions(cursor?: string): Promise<Outcome<ListingPage, TransportFailure>> {
    return this.perform(listActionsRequest(cursor, this.connection))
  }

  /**
   * `call` waits for the request to reach the peer or to settle, whichever comes first (T5): a
   * `SentCall` once the peer may have received it, `not-sent` as the call's own failure when it
   * settled so before.
   */
  async call(
    request: CallRequest,
    signal: AbortSignal,
    observe?: (notification: PeerNotification) => void,
  ): Promise<Outcome<SentCall, Extract<TransportFailure, { kind: 'not-sent' }>>> {
    if (signal.aborted) return { failure: NOT_SENT_FAILURE }
    const composed = callRequestOf(request)
    const entry = this.begin(
      composed.method,
      composed.params,
      { values: composed.values, ...(observe === undefined ? {} : { observe }) },
      signal,
    )
    if (entry === undefined) return { failure: NOT_SENT_FAILURE }
    const first = await Promise.race([entry.departed.then(() => undefined), entry.answered])
    if (first?.wire.kind === 'not-sent') return { failure: first.wire.failure }
    return {
      ok: {
        requestId: entry.id,
        answer: entry.answered.then(answered => callAnswerOf(answered.wire)),
      },
    }
  }

  /** T5, by the contract's `cancelsByNotification`: the notification, or the end of the answer stream. */
  async cancelRequest(requestId: string): Promise<void> {
    if (cancelsByNotification(this.connection)) {
      this.sendNotification('notifications/cancelled', { requestId })
      return
    }
    const entry = this.pending.get(requestId)
    if (entry === undefined || entry.phase.kind !== 'sent') return
    this.peer.log.push({ kind: 'stream-aborted', id: requestId })
    this.settle(entry, { wire: ABANDONED })
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

  /** Closes the transport (T5): every request in flight settles by its phase there and then. */
  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    for (const entry of this.pending.values()) this.stop(entry)
    if (this.material.kind !== 'stdio') return
    const { stdin, stdout } = this.material.process
    await stdin.close().catch(() => undefined)
    await stdout.cancel().catch(() => undefined)
  }
}

function isProtocolVersions(versions: readonly string[]): versions is ProtocolVersions {
  return versions.length > 0
}

/**
 * A transport factory whose peer answers from the script, in memory. It records what the peer
 * received, `_meta` and progress tokens included. Every transport it opens shares the one peer,
 * so the script is consumed in request order across transports.
 */
export function createScriptedTransportFactory(
  script: PeerScript,
  options: ScriptedTransportOptions = {},
): ScriptedTransportFactory {
  const versions = options.protocolVersions ?? ['2026-07-28']
  if (!isProtocolVersions(versions) || !versions.every(isModernProtocolVersion))
    throw new RangeError(
      'protocolVersions lists the modern versions only; the legacy ones are LEGACY_PROTOCOL_VERSIONS',
    )
  const peer = new ScriptedPeer(script, versions)
  return {
    received: () => [...peer.log],
    async open(material, signal) {
      if (signal.aborted) return { failure: NOT_SENT_FAILURE }
      return { ok: new ScriptedTransport(peer, material, options, versions) }
    },
  }
}
