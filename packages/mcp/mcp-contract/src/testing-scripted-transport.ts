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
  NOT_SENT_FAILURE,
  authorizationRequiredAnswerOf,
  concludeAnswer,
  lineGoneAnswerOf,
  notSentFailureOf,
  requestClassOf,
  stopAnswerOf,
  unusableAnswerOf,
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
  protocolVersions?: readonly string[]
  clientInfo?: Readonly<{ name: string; version: string }>
  probeTimeoutMs?: number
  pace?: (received: PeerReceived) => Promise<void> | void
}>

export type ScriptedTransportFactory = McpTransportFactory &
  Readonly<{
    received(): readonly PeerReceived[]
  }>

type Request = Extract<PeerReceived, { kind: 'request' }>
type Headers = Readonly<{ [name: string]: string }>

const DEFAULT_CLIENT_INFO: ClientInfo = { name: 'scripted-transport', version: '0' }

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

  peerRequests(at: 'initialize' | 'initialized'): readonly Readonly<{ method: string }>[] {
    return (this.script.peerRequests ?? []).filter(request => (request.at ?? 'initialized') === at)
  }

  notificationReply(method: string): PeerReply | undefined {
    const replies = this.script.notifications
    return replies === undefined ? undefined : this.pick(`notification:${method}`, replies, SILENT)
  }
}

type Answered = Readonly<{ wire: WireAnswer; headers?: Headers }>

const NOT_SENT: Answered = { wire: { kind: 'not-sent', failure: NOT_SENT_FAILURE } }

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

type Dispatch = Readonly<{
  observe?: (notification: PeerNotification) => void
  version?: string
  request?: RequestClass
  probeTimeoutMs?: number
  values?: Readonly<{ [key: string]: JsonValue }>
}>

function lowerCased(headers: Headers | undefined): Headers {
  return Object.fromEntries(
    Object.entries(headers ?? {}).map(([name, value]) => [name.toLowerCase(), value]),
  )
}

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

function departs(reply: PeerReply): boolean {
  if (reply.kind === 'unsent') return false
  return reply.kind !== 'http' || reply.status < 300
}

class ScriptedTransport implements McpTransport {
  readonly generation: Generation
  private readonly pending = new Map<string, Pending>()
  private readonly authorized = new Set<string>()
  private nextId = 0
  private peerRequestCount = 0
  private version: string | undefined
  private closed = false
  private dead: UnusableCause | undefined
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

  private envelope(version = this.version ?? this.versions[0]): PlainRecord {
    return clientEnvelopeOf(version, this.clientInfo)
  }

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

  private handedOver(answered: Answered): Answered {
    if (this.closed || this.dead === undefined) return answered
    return { ...answered, wire: unusableAnswerOf(answered.wire, this.dead) }
  }

  private get refused(): Extract<TransportFailure, { kind: 'not-sent' }> {
    return notSentFailureOf(this.closed ? undefined : this.dead)
  }

  private settle(entry: Pending, answered: Answered): void {
    if (!this.pending.delete(entry.id)) return
    if (entry.phase.kind === 'sent') entry.phase.cancelProbe()
    entry.resolve(this.handedOver(answered))
  }

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

  private unusable(cause: UnusableCause): void {
    this.dead ??= cause
    for (const entry of this.pending.values()) {
      const wire = lineGoneAnswerOf(entry.phase, cause)
      if (wire !== undefined) this.settle(entry, { wire })
    }
  }

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

  private wireSignal(entry: Pending, signal: AbortSignal): void {
    const onAbort = () => this.stop(entry)
    if (signal.aborted) return onAbort()
    signal.addEventListener('abort', onAbort, { once: true })
    const unwire = () => signal.removeEventListener('abort', onAbort)
    void entry.answered.then(unwire, unwire)
  }

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

  private validate(reply: PeerReply, method: string): void {
    if (reply.kind === 'http' && this.stdio)
      throw new TypeError(`script: an http reply to ${method} on stdio material`)
    if (reply.kind === 'process-exits' && !this.stdio)
      throw new TypeError(`script: a process-exits reply to ${method} on streamable-http material`)
  }

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
    } catch {}
  }

  private enterDiscovery(entry: Pending, headers: Headers): void {
    const target = this.material.kind === 'streamable-http' ? this.material.target : undefined
    if (target === undefined)
      throw new TypeError('script: a refused authorization on stdio material')
    const credential = this.credential
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

  private async authorize(id: string): Promise<boolean> {
    const credential = this.credential
    if (credential === undefined) return true
    const headers = new Headers()
    const answer = await Promise.resolve()
      .then(() => credential.authorize(headers))
      .catch(() => undefined)
    if (answer === undefined || 'failure' in answer) return false
    this.authorized.add(id)
    return true
  }

  private request(
    method: RequestMethod,
    params: PlainRecord,
    how: Dispatch = {},
  ): Promise<Answered> {
    return withOneResend(() => this.once(method, params, how))
  }

  private async perform<T>(composed: ComposedRequest<T>): Promise<Outcome<T, TransportFailure>> {
    const how: Dispatch = composed.values === undefined ? {} : { values: composed.values }
    return composed.read((await this.request(composed.method, composed.params, how)).wire)
  }

  private once(method: RequestMethod, params: PlainRecord, how: Dispatch): Promise<Answered> {
    const probe = method === 'server/discover' && this.stdio
    const entry = this.begin(method, params, {
      ...how,
      ...(probe ? { probeTimeoutMs: this.options.probeTimeoutMs ?? 0 } : {}),
    })
    return entry === undefined
      ? Promise.resolve({ wire: { kind: 'not-sent', failure: this.refused } })
      : entry.answered
  }

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

  async call(
    request: CallRequest,
    signal: AbortSignal,
    observe?: (notification: PeerNotification) => void,
  ): Promise<Outcome<SentCall, Extract<TransportFailure, { kind: 'not-sent' }>>> {
    if (signal.aborted) return { failure: this.refused }
    const composed = callRequestOf(request)
    const entry = this.begin(
      composed.method,
      composed.params,
      { values: composed.values, ...(observe === undefined ? {} : { observe }) },
      signal,
    )
    if (entry === undefined) return { failure: this.refused }
    const first = await Promise.race([entry.departed.then(() => undefined), entry.answered])
    if (first?.wire.kind === 'not-sent') return { failure: first.wire.failure }
    return {
      ok: {
        requestId: entry.id,
        answer: entry.answered.then(answered => callAnswerOf(answered.wire)),
      },
    }
  }

  async cancelRequest(requestId: string): Promise<void> {
    if (cancelsByNotification(this.connection)) {
      this.sendNotification('notifications/cancelled', { requestId })
      return
    }
    const entry = this.pending.get(requestId)
    if (entry === undefined) return
    if (entry.phase.kind === 'sent') this.peer.log.push({ kind: 'stream-aborted', id: requestId })
    this.stop(entry)
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
