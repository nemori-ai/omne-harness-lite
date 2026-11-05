// An in-memory transport that answers from a `PeerScript`. It composes the JSON-RPC requests that
// SPEC T3 names (request ids, the `_meta` envelope, the progress token) with the contract's one
// implementation, turns each scripted reply into the wire event a real line would report,
// classifies it with `classifyWireEvent` and takes the conclusion of the decision layer. It keeps
// only the in-memory wire and its in-flight table, and records what the peer received. It does
// not speak a protocol and is not a product transport.
import type { JsonValue } from '@omne-harness/json-text'
import type { Outcome } from '@omne-harness/operation-result'
import { authorizationChallengeOf } from './authorization.ts'
import type { Generation, TaskId } from './brands.ts'
import {
  ABANDONED,
  NOT_SENT_FAILURE,
  OFFERED_LEGACY_VERSION,
  callAnswerOf,
  concludeAnswer,
  discoverAuthorization,
  discoverWith,
  interpretAnswer,
  legacyIdentityOf,
  legacyInitializeParamsOf,
  listingPageOf,
  notificationTextOf,
  peerRequestAnswerOf,
  requestClassOf,
  requestTextOf,
  responseTextOf,
  taskAnswerOf,
  taskReportOf,
  type AnswerConclusion,
  type NotificationMethod,
  type ProtocolVersions,
  type RequestMethod,
  type WireAnswer,
} from './decisions.ts'
import { clientEnvelopeOf, mcpRequestHeadersOf, type ClientInfo } from './envelope.ts'
import type { AuthorizationDiscovery, NoAnswerCause, TaskReport } from './outcomes.ts'
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

type Pending = {
  readonly context: WireContext
  settle(answered: Answered): void
  /** Starts the stdio probe time of `server/discover`; an answer before it ends clears it. */
  startProbe(milliseconds: number): void
  observe?: (notification: PeerNotification) => void
  progressToken: string
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
    case 'http': {
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
    case 'silent':
    case 'unsent':
      return undefined
    default: {
      const exhaustive: never = reply
      return exhaustive
    }
  }
}

/** One transport opened on one material, against the scripted peer. */
class ScriptedTransport implements McpTransport {
  readonly generation: Generation
  private readonly pending = new Map<string, Pending>()
  /** The ids of the requests that the credential handle authorized. */
  private readonly authorized = new Set<string>()
  private nextId = 0
  private peerRequestCount = 0
  private version: string | undefined
  private closed = false
  private dead: NoAnswerCause | 'session-ended' | undefined
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

  /** The transport is unusable from now on; a gone stdio stream settles every request in flight. */
  private unusable(cause: NoAnswerCause | 'session-ended'): void {
    this.dead = cause
    if (cause === 'session-ended') return
    for (const entry of this.pending.values())
      entry.settle({ wire: { kind: 'no-answer', cause, resend: false } })
  }

  /** True when the connection speaks a legacy revision. */
  private get legacy(): boolean {
    return this.version !== undefined && !isModernProtocolVersion(this.version)
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

  /** Composes the request, records it, and lets the peer answer after the pace hook. */
  private dispatch(
    id: string,
    method: RequestMethod,
    params: PlainRecord,
    how: Dispatch = {},
  ): Readonly<{ reply: PeerReply | undefined; answered: Promise<Answered> }> {
    const version = how.version ?? this.version ?? this.versions[0]
    const meta: PlainRecord =
      method === 'tools/call'
        ? { ...this.envelope(version), progressToken: id }
        : this.envelope(version)
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
    const context: WireContext = {
      id,
      request: how.request ?? requestClassOf(method, false),
      session: this.session !== undefined && method !== 'initialize',
      versions: this.versions,
    }
    const { promise, resolve } = Promise.withResolvers<Answered>()
    let probe: ReturnType<typeof setTimeout> | undefined
    const entry: Pending = {
      context,
      settle: answered => {
        clearTimeout(probe)
        this.pending.delete(id)
        resolve(answered)
      },
      startProbe: milliseconds => {
        // D13: nothing came by the time the probe stopped waiting.
        probe = setTimeout(() => {
          const conclusion = concludeAnswer(
            classifyWireEvent({ kind: 'nothing' }, context),
            context,
            this.material.kind,
          )
          void this.apply(entry, conclusion, {})
        }, milliseconds)
      },
      ...(how.observe === undefined ? {} : { observe: how.observe }),
      progressToken: id,
    }
    if (!this.usable) {
      entry.settle({ wire: { kind: 'not-sent', failure: NOT_SENT_FAILURE } })
      return { reply: undefined, answered: promise }
    }
    const reply = this.peer.reply(method, sent)
    this.validate(reply, method)
    this.pending.set(id, entry)
    if (reply.kind === 'unsent') {
      // The request fails before it leaves; the peer does not see it (T8 X01, X02).
      this.apply(
        entry,
        concludeAnswer(classifyWireEvent({ kind: 'unsent' }, context), context, this.material.kind),
        {},
      )
      return { reply, answered: promise }
    }
    this.peer.log.push(request)
    void this.deliver(request, reply, entry, how.probeTimeoutMs)
    return { reply, answered: promise }
  }

  /** A reply the material cannot carry is a defect of the script, reported at once. */
  private validate(reply: PeerReply, method: string): void {
    if (reply.kind === 'http' && this.stdio)
      throw new TypeError(`script: an http reply to ${method} on stdio material`)
    if (reply.kind === 'process-exits' && !this.stdio)
      throw new TypeError(`script: a process-exits reply to ${method} on streamable-http material`)
  }

  /**
   * Answers after the pace hook. The probe time starts only then, so a test that holds the answer
   * does not turn a modern peer into a legacy one.
   */
  private async deliver(
    request: Request,
    reply: PeerReply,
    entry: Pending,
    probeTimeoutMs: number | undefined,
  ): Promise<void> {
    await this.options.pace?.(request)
    if (!this.pending.has(request.id)) return
    if (probeTimeoutMs !== undefined) entry.startProbe(probeTimeoutMs)
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
    await this.apply(entry, conclusion, headers)
  }

  /** Settles the request as the T8 row says, and what the row says of the transport. */
  private async apply(
    entry: Pending,
    conclusion: AnswerConclusion,
    headers: Headers,
  ): Promise<void> {
    switch (conclusion.kind) {
      case 'wait':
        return
      case 'settle':
        entry.settle({ wire: conclusion.wire, headers })
        if (conclusion.unusable !== undefined) this.unusable(conclusion.unusable)
        return
      case 'authorization-required':
        return entry.settle({
          wire: await this.authorizationRequired(entry.context.id, headers),
          headers,
        })
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

  /** T4: reports the rejection to the handle that authorized the request, then discovers. */
  private async authorizationRequired(id: string | number, headers: Headers): Promise<WireAnswer> {
    if (this.credential !== undefined && this.authorized.has(String(id)))
      // A handle whose reportRejection rejects or throws is ignored (T9).
      await Promise.resolve()
        .then(() => this.credential?.reportRejection())
        .catch(() => undefined)
    const challenge = authorizationChallengeOf(headers['www-authenticate'])
    const discovery = await this.discoverAuthorization(challenge)
    return {
      kind: 'not-sent',
      failure: { kind: 'not-sent', cause: 'authorization-required', discovery },
    }
  }

  private get credential(): HttpCredentialHandle | undefined {
    return this.material.kind === 'streamable-http' ? this.material.credential : undefined
  }

  private discoverAuthorization(
    challenge: ReadonlyMap<string, string>,
  ): Promise<AuthorizationDiscovery> {
    const target = this.material.kind === 'streamable-http' ? this.material.target : undefined
    if (target === undefined)
      throw new TypeError('script: a refused authorization on stdio material')
    return discoverAuthorization(
      target,
      challenge,
      async url => {
        const metadata = this.peer.wellKnown(url)
        return metadata === undefined ? undefined : jsonOf(metadata)
      },
      new AbortController().signal,
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
    if (!this.usable) return { wire: { kind: 'not-sent', failure: NOT_SENT_FAILURE } }
    const id = this.reserveId()
    if (!(await this.authorize(id)))
      return { wire: { kind: 'not-sent', failure: NOT_SENT_FAILURE } }
    const probe = method === 'server/discover' && this.stdio
    return this.dispatch(id, method, params, {
      ...how,
      ...(probe ? { probeTimeoutMs: this.options.probeTimeoutMs ?? 0 } : {}),
    }).answered
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
    const answered = await this.request('tools/list', cursor === undefined ? {} : { cursor })
    // SEP-2243 belongs to the modern revision: a legacy connection sends no `Mcp-Param` header.
    return listingPageOf(answered.wire, this.material.kind === 'streamable-http' && !this.legacy)
  }

  async call(
    request: CallRequest,
    signal: AbortSignal,
    observe?: (notification: PeerNotification) => void,
  ): Promise<Outcome<SentCall, Extract<TransportFailure, { kind: 'not-sent' }>>> {
    if (!this.usable || signal.aborted) return { failure: NOT_SENT_FAILURE }
    const id = this.reserveId()
    if (!(await this.authorize(id))) return { failure: NOT_SENT_FAILURE }
    const continuation = request.continuation
    const params: PlainRecord = {
      name: request.action,
      ...(continuation?.requestState === undefined
        ? {}
        : { requestState: continuation.requestState }),
    }
    const values = {
      arguments: request.args,
      ...(continuation?.inputResponses === undefined
        ? {}
        : { inputResponses: continuation.inputResponses }),
    }
    const sent = this.dispatch(id, 'tools/call', params, {
      values,
      ...(observe === undefined ? {} : { observe }),
    })
    // An HTTP-level answer settles before the call returns: a refusal is a failure of the call
    // itself (T4), a 400 with a JSON-RPC error is the answer of the peer.
    if (sent.reply === undefined || sent.reply.kind === 'http' || sent.reply.kind === 'unsent') {
      const { wire } = await sent.answered
      if (wire.kind === 'not-sent') return { failure: wire.failure }
      return { ok: { requestId: id, answer: Promise.resolve(callAnswerOf(wire)) } }
    }
    const entry = this.pending.get(id)
    const abandon = () => entry?.settle({ wire: ABANDONED })
    if (signal.aborted) abandon()
    else signal.addEventListener('abort', abandon, { once: true })
    return {
      ok: { requestId: id, answer: sent.answered.then(answered => callAnswerOf(answered.wire)) },
    }
  }

  /**
   * stdio, and Streamable HTTP on a legacy revision, send `notifications/cancelled`; Streamable
   * HTTP on a modern revision ends the answer stream (T5).
   */
  async cancelRequest(requestId: string): Promise<void> {
    if (this.stdio || this.legacy) {
      this.sendNotification('notifications/cancelled', { requestId })
      return
    }
    const entry = this.pending.get(requestId)
    if (entry === undefined) return
    this.peer.log.push({ kind: 'stream-aborted', id: requestId })
    entry.settle({ wire: ABANDONED })
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

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    for (const entry of this.pending.values()) entry.settle({ wire: ABANDONED })
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
