// An in-memory transport that answers from a `PeerScript`. It composes the JSON-RPC requests that
// SPEC T3 names (request ids, the `_meta` envelope, the progress token), applies the T1–T7 rules
// of the transport, and lets a scripted peer answer in memory instead of a wire. It records what
// the peer received. It does not speak a protocol and is not a product transport.
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import type { Outcome } from '@omne-harness/operation-result'
import { isProtocolVersion, type Generation, type TaskId } from './brands.ts'
import { taskHintsOf } from './classify.ts'
import { boundInstructions } from './instructions.ts'
import { isObject, itemsOf, member, textOf } from './json.ts'
import type {
  AnswerMalformed,
  AuthorizationDiscovery,
  NoAnswerCause,
  PeerAnswer,
  TaskReport,
  TaskStatus,
} from './outcomes.ts'
import type { HttpCredentialHandle } from './ports.ts'
import { LEGACY_PROTOCOL_VERSIONS, isLegacyProtocolVersion } from './revisions.ts'
import {
  CLIENT_CAPABILITIES_KEY,
  CLIENT_INFO_KEY,
  PROTOCOL_VERSION_KEY,
  SERVER_INFO_KEY,
  TASKS_EXTENSION,
  type PeerNotificationScript,
  type PeerReceived,
  type PeerReply,
  type PeerRequestHeaders,
  type PeerScript,
  type PlainJson,
  type Replies,
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
import type { PeerIdentity, Untrusted } from './values.ts'

export type ScriptedTransportOptions = Readonly<{
  /** The versions the transport speaks, highest first. Default: `['2026-07-28']`. */
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

type PlainRecord = Readonly<{ [key: string]: PlainJson }>
type Request = Extract<PeerReceived, { kind: 'request' }>

const [OFFERED_LEGACY_VERSION] = LEGACY_PROTOCOL_VERSIONS
const MODERN_ERROR_CODES: readonly number[] = [-32022, -32021, -32020]
const METHOD_NOT_FOUND = -32601
const READ_METHODS: readonly string[] = ['server/discover', 'tools/list', 'tasks/get']
const TASK_STATUSES: readonly TaskStatus[] = [
  'working',
  'input_required',
  'completed',
  'failed',
  'cancelled',
]
const CLIENT_CAPABILITIES: PlainJson = {
  elicitation: { form: {} },
  extensions: { [TASKS_EXTENSION]: {} },
}
/** The capabilities of a legacy `initialize`: the tasks extension exists on modern revisions only. */
const LEGACY_CAPABILITIES: PlainJson = { elicitation: { form: {} } }
/** The requests whose `Mcp-Name` header carries a parameter, and that parameter. */
const MCP_NAME_SOURCES: Readonly<{ [method: string]: string }> = {
  'tools/call': 'name',
  'tasks/get': 'taskId',
  'tasks/update': 'taskId',
  'tasks/cancel': 'taskId',
}
const METADATA_PATH = '/.well-known/oauth-protected-resource'
const INTEGER = /^-?\d+$/u

type NotSent = Extract<TransportFailure, { kind: 'not-sent' }>
const notSent: NotSent = { kind: 'not-sent', cause: 'connection-unavailable' }
const malformed = (what: AnswerMalformed['what']): TransportFailure => ({
  kind: 'answer-malformed',
  what,
})

function isPlainJson(value: unknown): value is PlainJson {
  if (value === null || typeof value === 'string' || typeof value === 'number') return true
  if (typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.every(isPlainJson)
  if (typeof value !== 'object') return false
  return Object.values(value).every(isPlainJson)
}

function isPlainRecord(value: PlainJson | undefined): value is PlainRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The plain form of a JSON tree. */
function plainOf(value: JsonValue): PlainJson {
  const parsed: unknown = JSON.parse(writeJsonText(value))
  if (!isPlainJson(parsed)) throw new TypeError('a JSON tree did not write as JSON')
  return parsed
}

function isList(value: Replies): value is readonly PeerReply[] {
  return Array.isArray(value)
}

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

  peerRequests(): readonly Readonly<{ method: string; params?: PlainJson }>[] {
    return this.script.peerRequests ?? []
  }
}

/** What came back for one request, before the transport reads it. */
type Wire =
  | Readonly<{ kind: 'result'; result: JsonValue }>
  | Readonly<{ kind: 'error'; error: JsonValue }>
  | Readonly<{ kind: 'no-answer'; cause: NoAnswerCause }>
  | Readonly<{ kind: 'not-sent'; failure: NotSent }>
  | Readonly<{ kind: 'legacy-signal' }>
  | Readonly<{ kind: 'probe-timeout' }>

type Pending = {
  settle(wire: Wire): void
  /** Starts the stdio probe time of `server/discover`; an answer before it ends clears it. */
  startProbe(milliseconds: number): void
  observe?: (notification: PeerNotification) => void
  progressToken: string
}

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

function errorOf(
  error: JsonValue,
): Extract<TransportFailure, { kind: 'error-answer' }> | undefined {
  if (!isObject(error)) return undefined
  const code = member(error, 'code')
  const message = textOf(member(error, 'message'))
  if (code?.kind !== 'number' || !INTEGER.test(code.lexeme) || message === undefined)
    return undefined
  const data = member(error, 'data')
  return {
    kind: 'error-answer',
    code: Number(code.lexeme),
    message,
    ...(data === undefined ? {} : { data }),
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
      const answer = errorOf(wire.error)
      return answer === undefined ? { failure: malformed('error-shape') } : { failure: answer }
    }
    case 'no-answer':
      return { failure: { kind: 'no-answer', cause: wire.cause } }
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

function readTask(result: JsonValue): Outcome<TaskReport | 'expired', TransportFailure> {
  if (!isObject(result)) return { failure: malformed('status-unknown') }
  const written = textOf(member(result, 'status'))
  const status = TASK_STATUSES.find(known => known === written)
  if (status === undefined) return { failure: malformed('status-unknown') }
  const inputRequests = member(result, 'inputRequests')
  if (status === 'input_required' && !isObject(inputRequests))
    return { failure: malformed('input-requests-missing') }
  if (status === 'completed' && member(result, 'result') === undefined)
    return { failure: malformed('result-missing') }
  if (status === 'failed' && !isObject(member(result, 'error')))
    return { failure: malformed('error-missing') }
  const report: TaskReport = {
    status,
    ...(status === 'input_required' && inputRequests !== undefined
      ? { inputRequests: { untrusted: inputRequests } }
      : {}),
    ...taskHintsOf(result),
  }
  return { ok: report }
}

function readTaskAnswer(result: JsonValue): Outcome<TaskAnswer, TransportFailure> {
  const report = readTask(result)
  if ('failure' in report) return report
  if (report.ok === 'expired' || !isObject(result)) return { ok: { kind: 'expired' } }
  switch (report.ok.status) {
    case 'completed': {
      const value = member(result, 'result')
      return value === undefined
        ? { failure: malformed('result-missing') }
        : { ok: { kind: 'finished', answer: { kind: 'result', result: value } } }
    }
    case 'failed': {
      const error = member(result, 'error')
      return error === undefined
        ? { failure: malformed('error-missing') }
        : { ok: { kind: 'finished', answer: { kind: 'error', error } } }
    }
    case 'cancelled':
      return { ok: { kind: 'cancelled' } }
    case 'working':
    case 'input_required':
      return { ok: { kind: 'not-finished' } }
    default: {
      const exhaustive: never = report.ok.status
      return exhaustive
    }
  }
}

/** `expired` for the `-32602` error of a task operation that reads a task. */
function expiredOf<T>(wire: Wire): Outcome<T | 'expired', TransportFailure> | undefined {
  if (wire.kind !== 'error') return undefined
  return errorOf(wire.error)?.code === -32602 ? { ok: 'expired' } : undefined
}

const RFC9110_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/u
const HEADER_TYPES: readonly string[] = ['string', 'integer', 'boolean', 'number']
const NON_REACHABLE: readonly string[] = [
  'items',
  'prefixItems',
  'contains',
  'additionalProperties',
  'unevaluatedProperties',
  'unevaluatedItems',
  'propertyNames',
  'patternProperties',
  'dependentSchemas',
  'oneOf',
  'anyOf',
  'allOf',
  'not',
  'if',
  'then',
  'else',
  '$defs',
  'definitions',
]
const NAMED_SUBSCHEMAS: readonly string[] = [
  'patternProperties',
  'dependentSchemas',
  '$defs',
  'definitions',
]

/** True when a schema breaks an `x-mcp-header` constraint of SEP-2243. */
function headerDeclarationInvalid(
  node: JsonValue | undefined,
  reachable: boolean,
  depth: number,
  seen: Set<string>,
): boolean {
  if (!isObject(node)) return false
  const raw = member(node, 'x-mcp-header')
  if (raw !== undefined) {
    const name = textOf(raw)
    const type = textOf(member(node, 'type'))
    if (!reachable || depth === 0 || name === undefined || !RFC9110_TOKEN.test(name)) return true
    if (type === undefined || !HEADER_TYPES.includes(type)) return true
    const lower = name.toLowerCase()
    if (seen.has(lower)) return true
    seen.add(lower)
  }
  const properties = member(node, 'properties')
  if (isObject(properties))
    for (const entry of properties.entries)
      if (headerDeclarationInvalid(entry.value, reachable, depth + 1, seen)) return true
  for (const keyword of NON_REACHABLE) {
    const sub = member(node, keyword)
    if (sub === undefined) continue
    const branches =
      itemsOf(sub) ??
      (isObject(sub) && NAMED_SUBSCHEMAS.includes(keyword)
        ? sub.entries.map(entry => entry.value)
        : [sub])
    for (const branch of branches)
      if (headerDeclarationInvalid(branch, false, depth + 1, seen)) return true
  }
  return false
}

function withheldOf(tools: readonly JsonValue[]): ListingPage {
  const kept: JsonValue[] = []
  const withheld: Readonly<{ name: Untrusted<string>; reason: 'header-invalid' }>[] = []
  for (const tool of tools) {
    const schema = isObject(tool) ? member(tool, 'inputSchema') : undefined
    if (headerDeclarationInvalid(schema, true, 0, new Set()))
      withheld.push({
        name: { untrusted: (isObject(tool) ? textOf(member(tool, 'name')) : undefined) ?? '' },
        reason: 'header-invalid',
      })
    else kept.push(tool)
  }
  return withheld.length === 0 ? { tools: kept } : { tools: kept, withheld }
}

/** The `WWW-Authenticate` parameters of a Bearer challenge, by name. */
function challengeOf(header: string | null): ReadonlyMap<string, string> {
  const parameters = new Map<string, string>()
  if (header === null) return parameters
  for (const match of header.matchAll(/([A-Za-z_]+)="([^"]*)"/gu)) {
    if (match[1] !== undefined && match[2] !== undefined)
      parameters.set(match[1].toLowerCase(), match[2])
  }
  return parameters
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
  const error = parsed['error']
  return isPlainRecord(error) ? jsonOf(error) : undefined
}

/** The MCP request headers of a Streamable HTTP request (T3). */
function headersOf(method: string, params: PlainRecord, version: string): PeerRequestHeaders {
  const source = MCP_NAME_SOURCES[method]
  const name = source === undefined ? undefined : params[source]
  return {
    'mcp-protocol-version': version,
    'mcp-method': method,
    ...(typeof name === 'string' ? { 'mcp-name': name } : {}),
  }
}

function stringsOf(value: PlainJson | undefined): readonly string[] {
  return Array.isArray(value) ? value.flatMap(item => (typeof item === 'string' ? [item] : [])) : []
}

/** One transport opened on one material, against the scripted peer. */
class ScriptedTransport implements McpTransport {
  readonly generation: Generation
  private readonly pending = new Map<string, Pending>()
  /** The ids of the requests that the credential handle authorized. */
  private readonly authorized = new Set<string>()
  private nextId = 0
  private version: string | undefined
  private closed = false
  private dead: NoAnswerCause | undefined
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

  private envelope(version = this.version ?? this.highest): PlainRecord {
    return {
      [PROTOCOL_VERSION_KEY]: version,
      [CLIENT_CAPABILITIES_KEY]: CLIENT_CAPABILITIES,
      [CLIENT_INFO_KEY]: this.options.clientInfo ?? { name: 'scripted-transport', version: '0' },
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
        ? { headers: headersOf(method, params, version) }
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
    this.pending.set(id, entry)
    this.peer.log.push(request)
    const reply = this.peer.reply(method, params)
    this.validate(reply, method)
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
      case 'result':
        for (const notification of reply.notifications ?? []) this.notify(notification, entry)
        return entry.settle({ kind: 'result', result: jsonOf(reply.result) })
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
      default: {
        const exhaustive: never = reply
        return exhaustive
      }
    }
  }

  private notify(notification: PeerNotificationScript, entry: Pending): void {
    const params = isPlainRecord(notification.params) ? notification.params : {}
    const observe = entry.observe
    if (notification.method !== 'notifications/progress' || observe === undefined) return
    try {
      observe({
        kind: 'progress',
        notification: { untrusted: jsonOf({ ...params, progressToken: entry.progressToken }) },
      })
    } catch {
      // S6: an observer that throws does not change the outcome.
    }
  }

  /**
   * An HTTP-level answer: 401 and 403 are read by T4. A 400 whose body is a JSON-RPC error is the
   * error answer of the request, except that on `server/discover` only an error of the modern
   * revision is; any other 400 to `server/discover` is a legacy signal (T3).
   */
  private async httpAnswer(
    request: Request,
    reply: Extract<PeerReply, { kind: 'http' }>,
  ): Promise<Wire> {
    const headers = new Headers(reply.headers ?? {})
    const challenge = challengeOf(headers.get('www-authenticate'))
    const insufficientScope =
      reply.status === 403 && challenge.get('error') === 'insufficient_scope'
    if (reply.status === 401 || insufficientScope) {
      if (this.credential !== undefined && this.authorized.has(request.id))
        await this.credential.reportRejection()
      const discovery = await this.discoverAuthorization(challenge)
      return {
        kind: 'not-sent',
        failure: { kind: 'not-sent', cause: 'authorization-required', discovery },
      }
    }
    if (reply.status === 403) return { kind: 'not-sent', failure: notSent }
    if (reply.status === 400) {
      const error = jsonRpcErrorOf(reply.body)
      const discover = request.method === 'server/discover'
      const code = error === undefined ? undefined : errorOf(error)?.code
      if (
        error !== undefined &&
        (!discover || (code !== undefined && MODERN_ERROR_CODES.includes(code)))
      )
        return { kind: 'error', error }
      if (discover) return { kind: 'legacy-signal' }
    }
    throw new TypeError(
      `script: an http ${reply.status} reply to ${request.method} is not supported`,
    )
  }

  private get credential(): HttpCredentialHandle | undefined {
    return this.material.kind === 'streamable-http' ? this.material.credential : undefined
  }

  private async discoverAuthorization(
    challenge: ReadonlyMap<string, string>,
  ): Promise<AuthorizationDiscovery> {
    const target =
      this.material.kind === 'streamable-http' ? this.material.target : 'https://invalid.test/'
    const origin = new URL(target)
    const path = origin.pathname.replace(/\/$/u, '')
    const named = challenge.get('resource_metadata')
    const candidates =
      named === undefined
        ? [new URL(`${METADATA_PATH}${path}`, origin).href, new URL(METADATA_PATH, origin).href]
        : [named]
    let found: Readonly<{ url: string; metadata: PlainJson }> | undefined
    for (const url of candidates) {
      const metadata = this.peer.wellKnown(url)
      if (metadata !== undefined) {
        found = { url, metadata }
        break
      }
    }
    const scope = challenge.get('scope')
    const headerScopes = scope === undefined ? [] : scope.split(/\s+/u).filter(item => item !== '')
    const metadata =
      found === undefined || !isPlainRecord(found.metadata) ? undefined : found.metadata
    const fallbackUrl = candidates.at(-1) ?? new URL(METADATA_PATH, origin).href
    return {
      resourceMetadataUrl: found?.url ?? fallbackUrl,
      metadata: found === undefined ? 'unavailable' : 'fetched',
      ...(found === undefined ? {} : { resourceMetadata: { untrusted: jsonOf(found.metadata) } }),
      issuers: stringsOf(metadata?.['authorization_servers']),
      scopes: headerScopes.length > 0 ? headerScopes : stringsOf(metadata?.['scopes_supported']),
    }
  }

  /** Authorizes an outgoing request with the credential handle, when the material has one. */
  private async authorize(id: string): Promise<boolean> {
    const credential = this.credential
    if (credential === undefined) return true
    const headers = new Headers()
    const answer = await credential.authorize(headers)
    if ('failure' in answer) return false
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

  private sendNotification(method: string, params: PlainRecord): void {
    this.peer.log.push({
      kind: 'notification',
      method,
      params: { ...params, _meta: this.envelope() },
    })
  }

  async discover(): Promise<Outcome<PeerIdentity, TransportFailure>> {
    const modern = await this.modernPath()
    if ('ok' in modern) return modern
    if (modern.failure.kind === 'final') return { failure: modern.failure.failure }
    const legacy = await this.legacyPath()
    if ('ok' in legacy) return legacy
    return { failure: modern.failure.kind === 'fallback' ? modern.failure.failure : legacy.failure }
  }

  /**
   * The modern path, once with a retry on `-32022`. `fallback` carries the failure to report if
   * the legacy path fails too. `legacy-peer` says the peer does not speak the modern revision, so
   * a failure of the legacy path is the one to report.
   */
  private async modernPath(): Promise<
    Outcome<
      PeerIdentity,
      | Readonly<{ kind: 'final'; failure: TransportFailure }>
      | Readonly<{ kind: 'fallback'; failure: TransportFailure }>
      | Readonly<{ kind: 'legacy-peer' }>
    >
  > {
    let retried = false
    let version = this.highest
    for (;;) {
      const wire = await this.request('server/discover', {}, version)
      switch (wire.kind) {
        case 'result': {
          const read = this.readDiscover(wire.result)
          if ('ok' in read) return read
          return {
            failure: {
              kind: read.failure === 'no-common-version' ? 'final' : 'fallback',
              failure: malformed('discover-shape'),
            },
          }
        }
        case 'error': {
          const answer = errorOf(wire.error)
          if (answer === undefined)
            return { failure: { kind: 'fallback', failure: malformed('error-shape') } }
          if (answer.code === -32022 && !retried) {
            const supported = isObject(answer.data)
              ? itemsOf(member(answer.data, 'supported'))
              : undefined
            const offered = (supported ?? []).flatMap(item =>
              item.kind === 'string' ? [item.value] : [],
            )
            const common = this.commonVersion(offered)
            if (common === undefined)
              return { failure: { kind: 'final', failure: malformed('discover-shape') } }
            retried = true
            version = common
            continue
          }
          if (MODERN_ERROR_CODES.includes(answer.code))
            return { failure: { kind: 'final', failure: answer } }
          if (answer.code === METHOD_NOT_FOUND) return { failure: { kind: 'legacy-peer' } }
          return { failure: { kind: 'fallback', failure: answer } }
        }
        case 'no-answer':
        case 'not-sent':
          return { failure: { kind: 'final', failure: interpretFailure(wire) } }
        case 'legacy-signal':
        case 'probe-timeout':
          return { failure: { kind: 'legacy-peer' } }
        default: {
          const exhaustive: never = wire
          return exhaustive
        }
      }
    }
  }

  private commonVersion(offered: readonly string[]): string | undefined {
    return this.versions.find(version => offered.includes(version))
  }

  private readDiscover(result: JsonValue): Outcome<PeerIdentity, 'shape' | 'no-common-version'> {
    if (!isObject(result)) return { failure: 'shape' }
    const versions = itemsOf(member(result, 'supportedVersions'))
    const capabilities = member(result, 'capabilities')
    if (versions === undefined || !isObject(capabilities)) return { failure: 'shape' }
    const offered = versions.flatMap(item => (item.kind === 'string' ? [item.value] : []))
    const version = this.commonVersion(offered)
    if (version === undefined || !isProtocolVersion(version))
      return { failure: 'no-common-version' }
    this.version = version
    const meta = member(result, '_meta')
    const serverInfo = isObject(meta) ? member(meta, SERVER_INFO_KEY) : undefined
    return {
      ok: this.identity(version, capabilities, serverInfo, textOf(member(result, 'instructions'))),
    }
  }

  private identity(
    version: PeerIdentity['protocolVersion'],
    capabilities: JsonValue,
    serverInfo: JsonValue | undefined,
    instructions: string | undefined,
  ): PeerIdentity {
    return {
      protocolVersion: version,
      capabilities,
      ...(serverInfo === undefined ? {} : { serverInfo: { untrusted: serverInfo } }),
      ...(instructions === undefined
        ? {}
        : {
            instructions: {
              untrusted: {
                ...boundInstructions(instructions, this.material.instructionsByteLimit),
                generation: this.generation,
              },
            },
          }),
    }
  }

  /** The legacy path: `initialize` with the highest legacy version, then `notifications/initialized`. */
  private async legacyPath(): Promise<Outcome<PeerIdentity, TransportFailure>> {
    const wire = await this.request(
      'initialize',
      {
        protocolVersion: OFFERED_LEGACY_VERSION,
        capabilities: LEGACY_CAPABILITIES,
        clientInfo: this.options.clientInfo ?? { name: 'scripted-transport', version: '0' },
      },
      OFFERED_LEGACY_VERSION,
    )
    const read = interpret(wire, (result): Outcome<PeerIdentity, TransportFailure> => {
      const version = isObject(result) ? textOf(member(result, 'protocolVersion')) : undefined
      const capabilities = isObject(result) ? member(result, 'capabilities') : undefined
      if (
        !isObject(result) ||
        !isProtocolVersion(version) ||
        !isLegacyProtocolVersion(version) ||
        !isObject(capabilities)
      )
        return { failure: malformed('discover-shape') }
      this.version = version
      return {
        ok: this.identity(
          version,
          capabilities,
          member(result, 'serverInfo'),
          textOf(member(result, 'instructions')),
        ),
      }
    })
    if ('failure' in read) return read
    this.sendNotification('notifications/initialized', {})
    for (const [index] of this.peer.peerRequests().entries())
      this.peer.log.push({
        kind: 'response',
        id: `p${index + 1}`,
        error: { code: -32601, message: 'Method not found' },
      })
    return read
  }

  async listActions(cursor?: string): Promise<Outcome<ListingPage, TransportFailure>> {
    const wire = await this.request('tools/list', cursor === undefined ? {} : { cursor })
    return interpret(wire, result => {
      const tools = isObject(result) ? itemsOf(member(result, 'tools')) : undefined
      if (!isObject(result) || tools === undefined) return { failure: malformed('tools-missing') }
      const nextCursor = textOf(member(result, 'nextCursor'))
      const ttl = member(result, 'ttlMs')
      const page = this.material.kind === 'streamable-http' ? withheldOf(tools) : { tools }
      return {
        ok: {
          ...page,
          ...(nextCursor === undefined ? {} : { nextCursor }),
          ...(ttl?.kind === 'number' ? { ttlMs: Number(ttl.lexeme) } : {}),
        },
      }
    })
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
    if (sent.reply === undefined || sent.reply.kind === 'http') {
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

  async cancelRequest(requestId: string): Promise<void> {
    if (this.material.kind === 'stdio') {
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
    return interpret(wire, readTaskAnswer)
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
  wire: Extract<Wire, { kind: 'no-answer' | 'not-sent' }>,
): TransportFailure {
  return wire.kind === 'no-answer' ? { kind: 'no-answer', cause: wire.cause } : wire.failure
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
  const peer = new ScriptedPeer(script, versions)
  return {
    received: () => [...peer.log],
    async open(material, signal) {
      if (signal.aborted) return { failure: notSent }
      return { ok: new ScriptedTransport(peer, material, options, versions) }
    },
  }
}
