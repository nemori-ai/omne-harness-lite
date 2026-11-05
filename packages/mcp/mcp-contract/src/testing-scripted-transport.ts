// An in-memory transport that answers from a `PeerScript`. It composes the JSON-RPC requests that
// SPEC T3 names (request ids, the `_meta` envelope, the progress token), applies the T1–T7 rules
// of the transport, and lets a scripted peer answer in memory instead of a wire. It records what
// the peer received. It does not speak a protocol and is not a product transport.
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import type { Outcome } from '@omne-harness/operation-result'
import type { Generation, TaskId } from './brands.ts'
import {
  authorizationChallengeOf,
  authorizationDiscoveryOf,
  metadataCandidatesOf,
} from './authorization.ts'
import { clientEnvelopeOf, mcpRequestHeadersOf, type ClientInfo } from './envelope.ts'
import { isObject, itemsOf, member } from './json.ts'
import type {
  AnswerMalformed,
  AuthorizationDiscovery,
  NoAnswerCause,
  PeerAnswer,
  TaskReport,
} from './outcomes.ts'
import { isPlainJson, isPlainRecord, type PlainJson, type PlainRecord } from './plain.ts'
import type { HttpCredentialHandle } from './ports.ts'
import {
  errorAnswerOf,
  peerIdentityOf,
  readDiscoverResult,
  readInitializeResult,
  readListingPage,
  readTaskAnswer,
  readTaskReport,
} from './readers.ts'
import { LEGACY_PROTOCOL_VERSIONS, isModernProtocolVersion } from './revisions.ts'
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

const [OFFERED_LEGACY_VERSION] = LEGACY_PROTOCOL_VERSIONS
const MODERN_ERROR_CODES: readonly number[] = [-32022, -32021, -32020]
const METHOD_NOT_FOUND = -32601
const READ_METHODS: readonly string[] = ['server/discover', 'tools/list', 'tasks/get']
const DEFAULT_CLIENT_INFO: ClientInfo = { name: 'scripted-transport', version: '0' }

type NotSent = Extract<TransportFailure, { kind: 'not-sent' }>
const notSent: NotSent = { kind: 'not-sent', cause: 'connection-unavailable' }
const malformed = (what: AnswerMalformed['what']): TransportFailure => ({
  kind: 'answer-malformed',
  what,
})

/** The plain form of a JSON tree. */
function plainOf(value: JsonValue): PlainJson {
  const parsed: unknown = JSON.parse(writeJsonText(value))
  if (!isPlainJson(parsed)) throw new TypeError('a JSON tree did not write as JSON')
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

/** What came back for one request, before the transport reads it. */
type Wire =
  | Readonly<{ kind: 'result'; result: JsonValue; session?: string }>
  | Readonly<{ kind: 'error'; error: JsonValue }>
  | Readonly<{ kind: 'no-answer'; cause: NoAnswerCause }>
  | Readonly<{ kind: 'not-sent'; failure: NotSent }>
  | Readonly<{ kind: 'legacy-signal' }>
  | Readonly<{ kind: 'probe-timeout' }>
  /** An HTTP 5xx without a JSON-RPC answer: `no-answer` (`stream-broken`), never re-sent. */
  | Readonly<{ kind: 'server-error' }>

type Pending = {
  settle(wire: Wire): void
  /** Starts the stdio probe time of `server/discover`; an answer before it ends clears it. */
  startProbe(milliseconds: number): void
  observe?: (notification: PeerNotification) => void
  progressToken: string
}

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

/** How one request is sent: the observer of a call, the `_meta` version, the probe time. */
type Dispatch = Readonly<{
  observe?: (notification: PeerNotification) => void
  version?: string
  probeTimeoutMs?: number
}>

class Deferred<T> {
  settled = false
  resolve: (value: T) => void = () => undefined
  readonly promise: Promise<T>
  constructor() {
    this.promise = new Promise<T>(resolve => {
      this.resolve = value => {
        if (this.settled) return
        this.settled = true
        resolve(value)
      }
    })
  }
}

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

/** `expired` for the `-32602` error of a task operation that reads a task. */
function expiredOf<T>(wire: Wire): Outcome<T | 'expired', TransportFailure> | undefined {
  if (wire.kind !== 'error') return undefined
  return errorAnswerOf(wire.error)?.code === -32602 ? { ok: 'expired' } : undefined
}

/** The error object of an HTTP body that is a JSON-RPC error response, or undefined. */
function jsonRpcErrorOf(body: string | undefined): JsonValue | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(body ?? '')
  } catch {
    return undefined
  }
  if (!isPlainJson(parsed) || !isPlainRecord(parsed)) return undefined
  // The envelope of T2: `jsonrpc` is "2.0" and exactly one of `result` and `error`, here `error`.
  const error = parsed['error']
  if (parsed['jsonrpc'] !== '2.0' || error === undefined || parsed['result'] !== undefined)
    return undefined
  return jsonOf(error)
}

/** HTTP 401, or 403 with `error="insufficient_scope"` (T4). */
function refusesAuthorization(status: number, challenge: ReadonlyMap<string, string>): boolean {
  return status === 401 || (status === 403 && challenge.get('error') === 'insufficient_scope')
}

/** The JSON-RPC error of a modern-revision code in an HTTP body, or undefined. */
function modernErrorOf(body: string | undefined): JsonValue | undefined {
  const error = jsonRpcErrorOf(body)
  const code = error === undefined ? undefined : errorAnswerOf(error)?.code
  return code !== undefined && MODERN_ERROR_CODES.includes(code) ? error : undefined
}

/**
 * An HTTP error status to `server/discover`, other than a refused authorization (T8 D04–D16):
 * 5xx is final; below 500 a JSON-RPC error of the modern revision in the body is the answer, and
 * anything else is a legacy signal. This is `classifyHttpError` of the official TypeScript SDK.
 */
function probeAnswerOf(reply: Extract<PeerReply, { kind: 'http' }>): Wire {
  if (reply.status >= 500) return { kind: 'server-error' }
  const error = modernErrorOf(reply.body)
  return error === undefined ? { kind: 'legacy-signal' } : { kind: 'error', error }
}

/**
 * An HTTP error status to any other request (T8): a JSON-RPC error in the body is the answer; a
 * 5xx without one is a server error; a 4xx without one did not take effect.
 */
function httpErrorAnswerOf(reply: Extract<PeerReply, { kind: 'http' }>): Wire {
  const error = jsonRpcErrorOf(reply.body)
  if (error !== undefined) return { kind: 'error', error }
  return reply.status >= 500 ? { kind: 'server-error' } : { kind: 'not-sent', failure: notSent }
}

/** `data.supported` of a `-32022` error: a non-empty list of texts, or undefined. */
function supportedOf(data: JsonValue | undefined): readonly string[] | undefined {
  const items = isObject(data) ? itemsOf(member(data, 'supported')) : undefined
  if (items === undefined || items.length === 0) return undefined
  const texts = items.flatMap(item => (item.kind === 'string' ? [item.value] : []))
  return texts.length === items.length ? texts : undefined
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
  private readonly versions: readonly string[]

  constructor(
    peer: ScriptedPeer,
    material: TransportMaterial,
    options: ScriptedTransportOptions,
    versions: readonly string[],
  ) {
    this.peer = peer
    this.material = material
    this.options = options
    this.versions = versions
    this.generation = material.generation
  }

  private get highest(): string {
    const highest = this.versions[0]
    if (highest === undefined) throw new TypeError('the scripted transport speaks no version')
    return highest
  }

  private get clientInfo(): ClientInfo {
    return this.options.clientInfo ?? DEFAULT_CLIENT_INFO
  }

  /** The `_meta` envelope (T3), by the contract's one implementation. */
  private envelope(version = this.version ?? this.highest): PlainRecord {
    return clientEnvelopeOf(version, this.clientInfo)
  }

  /** The material facts that bind the peer instructions (T3, S3). */
  private get bound(): Readonly<{ generation: Generation; instructionsByteLimit: number }> {
    return {
      generation: this.generation,
      instructionsByteLimit: this.material.instructionsByteLimit,
    }
  }

  private get usable(): boolean {
    return !this.closed && this.dead === undefined
  }

  /** The stream or the process is gone: every pending request answers with the cause. */
  private die(cause: NoAnswerCause): void {
    this.dead = cause
    for (const entry of this.pending.values()) entry.settle({ kind: 'no-answer', cause })
  }

  /** True when the connection speaks a legacy revision. */
  private get legacy(): boolean {
    return this.version !== undefined && !isModernProtocolVersion(this.version)
  }

  private reserveId(): string {
    this.nextId += 1
    return `r${this.nextId}`
  }

  /** Composes the request, records it, and lets the peer answer after the pace hook. */
  private dispatch(
    id: string,
    method: string,
    params: PlainRecord,
    how: Dispatch = {},
  ): Readonly<{ reply: PeerReply | undefined; wire: Promise<Wire> }> {
    const version = how.version ?? this.version ?? this.highest
    const meta: PlainRecord =
      method === 'tools/call'
        ? { ...this.envelope(version), progressToken: id }
        : this.envelope(version)
    const request: Request = {
      kind: 'request',
      id,
      method,
      params: { ...params, _meta: meta },
      ...(this.material.kind === 'streamable-http'
        ? { headers: mcpRequestHeadersOf(method, params, version, this.session) }
        : {}),
    }
    const deferred = new Deferred<Wire>()
    let probe: ReturnType<typeof setTimeout> | undefined
    const entry: Pending = {
      settle: wire => {
        clearTimeout(probe)
        this.pending.delete(id)
        deferred.resolve(wire)
      },
      startProbe: milliseconds => {
        probe = setTimeout(() => entry.settle({ kind: 'probe-timeout' }), milliseconds)
      },
      ...(how.observe === undefined ? {} : { observe: how.observe }),
      progressToken: id,
    }
    if (!this.usable) {
      entry.settle({ kind: 'not-sent', failure: notSent })
      return { reply: undefined, wire: deferred.promise }
    }
    const reply = this.peer.reply(method, params)
    this.validate(reply, method)
    if (reply.kind === 'unsent') {
      // The request fails before it leaves; a broken stdio pipe ends the transport (T8 X01, X02).
      entry.settle({ kind: 'not-sent', failure: notSent })
      if (this.material.kind === 'stdio') this.die('stream-broken')
      return { reply, wire: deferred.promise }
    }
    this.pending.set(id, entry)
    this.peer.log.push(request)
    void this.deliver(request, reply, entry, how.probeTimeoutMs)
    return { reply, wire: deferred.promise }
  }

  /** A reply the material cannot carry is a defect of the script, reported at once. */
  private validate(reply: PeerReply, method: string): void {
    const stdio = this.material.kind === 'stdio'
    if (reply.kind === 'http' && stdio)
      throw new TypeError(`script: an http reply to ${method} on stdio material`)
    if (reply.kind === 'process-exits' && !stdio)
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
    switch (reply.kind) {
      case 'result': {
        for (const notification of reply.notifications ?? []) this.notify(notification, entry)
        const session =
          this.material.kind === 'streamable-http' ? reply.headers?.['mcp-session-id'] : undefined
        return entry.settle({
          kind: 'result',
          result: jsonOf(reply.result),
          ...(session === undefined ? {} : { session }),
        })
      }
      case 'error':
        return entry.settle({ kind: 'error', error: jsonOf(reply.error) })
      case 'silent':
        return undefined
      case 'stream-breaks':
        if (this.material.kind === 'stdio') return this.die('stream-broken')
        return entry.settle({ kind: 'no-answer', cause: 'stream-broken' })
      case 'process-exits':
        return this.die('process-exited')
      case 'http':
        return entry.settle(await this.httpAnswer(request, reply))
      case 'unsent':
        return undefined
      default: {
        const exhaustive: never = reply
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
   * An HTTP-level answer (T8). A 2xx without a JSON-RPC answer is a broken answer stream. A refused
   * authorization is read by T4; another 403 is not sent. A 404 to the legacy session ends it.
   * The other error statuses are read by `probeAnswerOf` on `server/discover` and by
   * `errorAnswerOf` elsewhere.
   */
  private async httpAnswer(
    request: Request,
    reply: Extract<PeerReply, { kind: 'http' }>,
  ): Promise<Wire> {
    if (reply.status < 200)
      throw new TypeError(`script: an http ${reply.status} reply is not observable`)
    if (reply.status < 300) return { kind: 'no-answer', cause: 'stream-broken' }
    const challenge = authorizationChallengeOf(
      new Headers(reply.headers ?? {}).get('www-authenticate') ?? undefined,
    )
    if (refusesAuthorization(reply.status, challenge))
      return this.authorizationRequired(request, challenge)
    if (reply.status === 403) return { kind: 'not-sent', failure: notSent }
    if (reply.status === 404 && request.headers?.['mcp-session-id'] !== undefined) {
      this.dead = 'session-ended'
      return { kind: 'not-sent', failure: { kind: 'not-sent', cause: 'session-ended' } }
    }
    return request.method === 'server/discover' ? probeAnswerOf(reply) : httpErrorAnswerOf(reply)
  }

  /** T4: reports the rejection to the handle that authorized the request, then discovers. */
  private async authorizationRequired(
    request: Request,
    challenge: ReadonlyMap<string, string>,
  ): Promise<Wire> {
    if (this.credential !== undefined && this.authorized.has(request.id))
      // A handle whose reportRejection rejects or throws is ignored (T9).
      await Promise.resolve()
        .then(() => this.credential?.reportRejection())
        .catch(() => undefined)
    const discovery = await this.discoverAuthorization(challenge)
    return {
      kind: 'not-sent',
      failure: { kind: 'not-sent', cause: 'authorization-required', discovery },
    }
  }

  private get credential(): HttpCredentialHandle | undefined {
    return this.material.kind === 'streamable-http' ? this.material.credential : undefined
  }

  private async discoverAuthorization(
    challenge: ReadonlyMap<string, string>,
  ): Promise<AuthorizationDiscovery> {
    const target =
      this.material.kind === 'streamable-http' ? this.material.target : 'https://invalid.test/'
    const candidates = metadataCandidatesOf(target, challenge)
    const fetched: (JsonValue | undefined)[] = []
    for (const url of candidates) {
      const metadata = this.peer.wellKnown(url)
      fetched.push(metadata === undefined ? undefined : jsonOf(metadata))
      // A document that is not a JSON object counts as not fetched (R4): the next address is tried.
      if (isPlainRecord(metadata)) break
    }
    return authorizationDiscoveryOf(challenge, candidates, fetched)
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

  /** Sends one non-call request. On Streamable HTTP a read request is re-sent once after a broken stream. */
  private async request(method: string, params: PlainRecord, version?: string): Promise<Wire> {
    const first = await this.once(method, params, version)
    const readClass = this.material.kind === 'streamable-http' && READ_METHODS.includes(method)
    if (first.kind === 'no-answer' && first.cause === 'stream-broken' && readClass)
      return this.once(method, params, version)
    return first
  }

  private async once(method: string, params: PlainRecord, version?: string): Promise<Wire> {
    if (!this.usable) return { kind: 'not-sent', failure: notSent }
    const id = this.reserveId()
    if (!(await this.authorize(id))) return { kind: 'not-sent', failure: notSent }
    const probe = method === 'server/discover' && this.material.kind === 'stdio'
    const sent = this.dispatch(id, method, params, {
      ...(version === undefined ? {} : { version }),
      ...(probe ? { probeTimeoutMs: this.options.probeTimeoutMs ?? 0 } : {}),
    })
    return sent.wire
  }

  /** Sends a notification. Whatever the peer answers to it does not change any outcome (T8 N01). */
  private sendNotification(method: string, params: PlainRecord): void {
    const version = this.version ?? this.highest
    this.peer.log.push({
      kind: 'notification',
      method,
      params: { ...params, _meta: this.envelope() },
      ...(this.material.kind === 'streamable-http'
        ? { headers: mcpRequestHeadersOf(method, params, version, this.session) }
        : {}),
    })
    const reply = this.peer.notificationReply(method)
    if (reply === undefined || this.material.kind !== 'stdio') return
    if (reply.kind === 'stream-breaks') this.die('stream-broken')
    if (reply.kind === 'process-exits') this.die('process-exited')
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
      const probe = this.probeOf(await this.request('server/discover', {}, version), retried)
      if (probe.kind !== 'retry') return probe
      retried = true
      version = probe.version
    }
  }

  /** What one answer to `server/discover` means (T3). */
  private probeOf(wire: Wire, retried: boolean): Probe {
    switch (wire.kind) {
      case 'result': {
        const read = readDiscoverResult(wire.result, this.versions)
        if ('ok' in read) {
          this.version = read.ok.protocolVersion
          return { kind: 'identity', identity: peerIdentityOf(read.ok, this.bound) }
        }
        // A result without a version in common is a legacy peer, as in the SDK's classifyResult.
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

  /**
   * The first `-32022`, as the SDK's classifyRpcError reads it: without a list of supported
   * versions, or with no modern version in it, the peer is a legacy peer; with modern versions but
   * none in common there is nothing to retry.
   */
  private versionRetryOf(data: JsonValue | undefined): Probe {
    const modern = (supportedOf(data) ?? []).filter(isModernProtocolVersion)
    if (modern.length === 0) return { kind: 'legacy-peer' }
    const common = this.commonVersion(modern)
    return common === undefined
      ? { kind: 'final', failure: malformed('discover-shape') }
      : { kind: 'retry', version: common }
  }

  private commonVersion(offered: readonly string[]): string | undefined {
    return this.versions.find(version => offered.includes(version))
  }

  /**
   * The requests of the peer, at one point of the legacy path: `ping` answers an empty result,
   * every other request `-32601` (T3).
   */
  private answerPeerRequests(at: 'initialize' | 'initialized'): void {
    for (const request of this.peer.peerRequests(at)) {
      const id = `p${(this.peerRequestCount += 1)}`
      this.peer.log.push(
        request.method === 'ping'
          ? { kind: 'response', id, result: {} }
          : { kind: 'response', id, error: { code: -32601, message: 'Method not found' } },
      )
    }
  }

  /** The legacy path: `initialize` with the highest legacy version, then `notifications/initialized`. */
  private async legacyPath(): Promise<Outcome<PeerIdentity, TransportFailure>> {
    const wire = await this.request(
      'initialize',
      {
        protocolVersion: OFFERED_LEGACY_VERSION,
        capabilities: {},
        clientInfo: { name: this.clientInfo.name, version: this.clientInfo.version },
      },
      OFFERED_LEGACY_VERSION,
    )
    this.answerPeerRequests('initialize')
    const read = interpret(wire, (result): Outcome<PeerIdentity, TransportFailure> => {
      const legacy = readInitializeResult(result)
      if ('failure' in legacy) return { failure: malformed('discover-shape') }
      this.version = legacy.ok.protocolVersion
      return { ok: peerIdentityOf(legacy.ok, this.bound) }
    })
    if ('failure' in read) return read
    if (wire.kind === 'result') this.session = wire.session
    this.sendNotification('notifications/initialized', {})
    this.answerPeerRequests('initialized')
    return read
  }

  async listActions(cursor?: string): Promise<Outcome<ListingPage, TransportFailure>> {
    const wire = await this.request('tools/list', cursor === undefined ? {} : { cursor })
    // SEP-2243 belongs to the modern revision: a legacy connection sends no `Mcp-Param` header.
    const checked = this.material.kind === 'streamable-http' && !this.legacy
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
    const id = this.reserveId()
    if (!(await this.authorize(id))) return { failure: notSent }
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
    const sent = this.dispatch(id, 'tools/call', params, observe === undefined ? {} : { observe })
    // An HTTP-level answer settles before the call returns: a refusal is a failure of the call
    // itself (T4), a 400 with a JSON-RPC error is the answer of the peer.
    if (sent.reply === undefined || sent.reply.kind === 'http' || sent.reply.kind === 'unsent') {
      const wire = await sent.wire
      if (wire.kind === 'not-sent') return { failure: wire.failure }
      return { ok: { requestId: id, answer: Promise.resolve(answerOf(wire)) } }
    }
    const entry = this.pending.get(id)
    signal.addEventListener(
      'abort',
      () => entry?.settle({ kind: 'no-answer', cause: 'abandoned' }),
      { once: true },
    )
    return { ok: { requestId: id, answer: sent.wire.then(answerOf) } }
  }

  /**
   * stdio, and Streamable HTTP on a legacy revision, send `notifications/cancelled`; Streamable
   * HTTP on a modern revision ends the answer stream (T5).
   */
  async cancelRequest(requestId: string): Promise<void> {
    if (this.material.kind === 'stdio' || this.legacy) {
      this.sendNotification('notifications/cancelled', { requestId })
      return
    }
    const entry = this.pending.get(requestId)
    if (entry === undefined) return
    this.peer.log.push({ kind: 'stream-aborted', id: requestId })
    entry.settle({ kind: 'no-answer', cause: 'abandoned' })
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

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    for (const entry of this.pending.values())
      entry.settle({ kind: 'no-answer', cause: 'abandoned' })
    if (this.material.kind !== 'stdio') return
    const { stdin, stdout } = this.material.process
    await stdin.close().catch(() => undefined)
    await stdout.cancel().catch(() => undefined)
  }
}

/** The answer of a sent call. */
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
  if (versions.length === 0 || !versions.every(isModernProtocolVersion))
    throw new RangeError(
      'protocolVersions lists the modern versions only; the legacy ones are LEGACY_PROTOCOL_VERSIONS',
    )
  const peer = new ScriptedPeer(script, versions)
  return {
    received: () => [...peer.log],
    async open(material, signal) {
      if (signal.aborted) return { failure: notSent }
      return { ok: new ScriptedTransport(peer, material, options, versions) }
    },
  }
}
