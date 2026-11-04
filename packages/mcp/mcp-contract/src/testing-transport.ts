// The conformance suite of `McpTransport` and `McpTransportFactory` (SPEC T1–T7), and the fixture
// it drives. A fixture gives the suite a peer that answers as a `PeerScript` says, at the JSON-RPC
// level, and a transport factory with the material to reach it. The script describes the peer,
// never an SDK: the in-memory scripted transport and a real server fixture read the same script.
import assert from 'node:assert/strict'
import type { Outcome } from '@omne-harness/operation-result'
import { isTaskId, type TaskId } from './brands.ts'
import { boundInstructions } from './instructions.ts'
import type { HttpCredentialHandle, ProcessHandle } from './ports.ts'
import { LEGACY_PROTOCOL_VERSIONS, isModernProtocolVersion } from './revisions.ts'
import {
  ERROR_CLASSES,
  TRANSPORT_TABLE,
  cellsOf,
  type ErrorClass,
  type ExpectedFailure,
  type RequestClass,
  type TableCell,
  type TableConclusion,
} from './testing-transport-table.ts'
import { NotApplicable, conformanceCase, type ConformanceCase } from './testing-case.ts'
import { actionNameOf, jsonOf } from './testing-values.ts'
import type {
  CallRequest,
  McpTransport,
  McpTransportFactory,
  PeerNotification,
  TransportFailure,
  TransportMaterial,
} from './transport.ts'

/** JSON as plain data, so that a script can travel to a fixture in another process. */
export type PlainJson =
  | string
  | number
  | boolean
  | null
  | readonly PlainJson[]
  | Readonly<{ [key: string]: PlainJson }>

/**
 * A notification the peer sends before it answers a request. When `params` has no
 * `progressToken`, the peer fills in the progress token of that request.
 */
export type PeerNotificationScript = Readonly<{ method: string; params?: PlainJson }>

/**
 * How the peer answers one request. `result` and `error` are JSON-RPC answers as written; on
 * Streamable HTTP a result may carry response headers, for example `mcp-session-id` on a legacy
 * `initialize`. `silent` never answers. `stream-breaks` breaks the answer stream (on stdio: the
 * pipe) before an answer. `process-exits` ends the stdio process before an answer. `http` answers
 * at the HTTP level, on Streamable HTTP only: a 2xx without a JSON-RPC answer, or an error status
 * with its headers and body.
 */
export type PeerReply =
  | Readonly<{
      kind: 'result'
      result: PlainJson
      notifications?: readonly PeerNotificationScript[]
      headers?: Readonly<{ [name: string]: string }>
    }>
  | Readonly<{ kind: 'error'; error: PlainJson }>
  | Readonly<{ kind: 'silent' }>
  | Readonly<{ kind: 'stream-breaks' }>
  | Readonly<{ kind: 'process-exits' }>
  | Readonly<{
      kind: 'http'
      status: number
      headers?: Readonly<{ [name: string]: string }>
      body?: string
    }>

/** One reply, or the replies in order; the last one repeats. */
export type Replies = PeerReply | readonly PeerReply[]

export type TaskScript = Readonly<{ get?: Replies; update?: Replies; cancel?: Replies }>

/**
 * The peer at the JSON-RPC level. Every member is optional. Absent: `discover` answers a modern
 * discover result with the peer's own versions and `capabilities: { tools: {} }`; `initialize`
 * answers `-32601`; an unlisted cursor, tool or task answers `-32602`; `update` and `cancel` of a
 * listed task answer an empty result; a well-known path not listed answers 404.
 */
export type PeerScript = Readonly<{
  discover?: Replies
  initialize?: Replies
  /** `tools/list` by cursor; the empty text is the first page. */
  listing?: Readonly<{ [cursor: string]: Replies }>
  /** `tools/call` by tool name. */
  calls?: Readonly<{ [tool: string]: Replies }>
  /** The task operations by task id. */
  tasks?: Readonly<{ [taskId: string]: TaskScript }>
  /**
   * Requests the peer sends to the client on the legacy path: before it answers `initialize`
   * (`at: 'initialize'`) or after it receives `notifications/initialized` (the default).
   */
  peerRequests?: readonly Readonly<{
    method: string
    params?: PlainJson
    at?: 'initialize' | 'initialized'
  }>[]
  /** How the peer answers the notifications of the client. Absent: as the protocol says. */
  notifications?: Replies
  /** Protected resource metadata by well-known path, for example `/.well-known/oauth-protected-resource`. */
  wellKnown?: Readonly<{ [path: string]: PlainJson }>
}>

/**
 * The MCP request headers of one Streamable HTTP request, by lower-case name, as the peer read
 * them. A header that the request did not carry is absent.
 */
export type PeerRequestHeaders = Readonly<{
  'mcp-protocol-version'?: string
  'mcp-method'?: string
  'mcp-name'?: string
  'mcp-session-id'?: string
}>

/**
 * What the peer saw: each request and notification as sent, and what the client did to it. A
 * request on Streamable HTTP carries `headers`; a request on stdio does not.
 */
export type PeerReceived =
  | Readonly<{
      kind: 'request'
      id: string
      method: string
      params?: PlainJson
      headers?: PeerRequestHeaders
    }>
  | Readonly<{ kind: 'notification'; method: string; params?: PlainJson }>
  /** The client's answer to a request the peer sent. */
  | Readonly<{ kind: 'response'; id: string; result?: PlainJson; error?: PlainJson }>
  /** Streamable HTTP: the client ended the answer stream of request `id`. */
  | Readonly<{ kind: 'stream-aborted'; id: string }>
  /** A GET of a well-known URL. */
  | Readonly<{ kind: 'fetch'; url: string }>

export type TransportKind = TransportMaterial['kind']

/** What a case needs from the peer: the material kind, and the credential to put on HTTP material. */
export type PeerNeeds = Readonly<{
  kind: TransportKind
  credential?: HttpCredentialHandle
  instructionsByteLimit?: number
}>

/**
 * A peer the fixture prepared, with the factory and the material to reach it. `received` resolves
 * to what the peer saw so far, in order, once everything that the client sent before the call is
 * recorded. A fixture whose peer records late, for example an aborted HTTP answer stream or the
 * answer to a request of the peer, waits for it before it resolves.
 */
export type ScriptedPeer = Readonly<{
  factory: McpTransportFactory
  material: TransportMaterial
  received(): Promise<readonly PeerReceived[]>
  close(): Promise<void>
}>

/**
 * A script, or a function that writes the script from the target of the Streamable HTTP material.
 * The fixture calls the function once, after it knows the target and before the peer answers. The
 * suite passes a function only with `streamable-http` needs.
 */
export type ScriptSource = PeerScript | ((target: string) => PeerScript)

/**
 * The fixture of the transport suite. `kinds` lists the material kinds it can open; a case that
 * needs another kind is not applicable. `protocolVersions` lists the modern versions the transport
 * speaks on `server/discover`, highest first; the legacy versions are `LEGACY_PROTOCOL_VERSIONS`. `peer` prepares a peer that answers as the script says; it throws
 * `NotApplicable` for a script it cannot realize, for example one with `peerRequests`.
 */
export type TransportFixture = Readonly<{
  kinds: readonly TransportKind[]
  protocolVersions: readonly string[]
  peer(script: ScriptSource, needs: PeerNeeds): Promise<ScriptedPeer>
}>

export const PROTOCOL_VERSION_KEY = 'io.modelcontextprotocol/protocolVersion'
export const CLIENT_CAPABILITIES_KEY = 'io.modelcontextprotocol/clientCapabilities'
export const CLIENT_INFO_KEY = 'io.modelcontextprotocol/clientInfo'
export const SERVER_INFO_KEY = 'io.modelcontextprotocol/serverInfo'
export const LOG_LEVEL_KEY = 'io.modelcontextprotocol/logLevel'
export const TASKS_EXTENSION = 'io.modelcontextprotocol/tasks'

type Case = ConformanceCase<TransportFixture>
type Body<T> = (peer: ScriptedPeer, transport: McpTransport) => Promise<T>
type Request = Extract<PeerReceived, { kind: 'request' }>

function isRecord(value: PlainJson | undefined): value is Readonly<{ [key: string]: PlainJson }> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A member of a plain object, or undefined. */
function at(value: PlainJson | undefined, ...path: readonly string[]): PlainJson | undefined {
  let current = value
  for (const key of path) {
    if (!isRecord(current)) return undefined
    current = current[key]
  }
  return current
}

function result(value: PlainJson, notifications?: readonly PeerNotificationScript[]): PeerReply {
  return notifications === undefined
    ? { kind: 'result', result: value }
    : { kind: 'result', result: value, notifications }
}

function error(code: number, message: string, data?: PlainJson): PeerReply {
  return { kind: 'error', error: data === undefined ? { code, message } : { code, message, data } }
}

/** An HTTP answer of `status` whose body is a JSON-RPC error. */
function httpError(status: number, code: number, message: string, data?: PlainJson): PeerReply {
  const answer = data === undefined ? { code, message } : { code, message, data }
  return { kind: 'http', status, body: JSON.stringify({ jsonrpc: '2.0', id: null, error: answer }) }
}

const SILENT: PeerReply = { kind: 'silent' }
const STREAM_BREAKS: PeerReply = { kind: 'stream-breaks' }
const PROCESS_EXITS: PeerReply = { kind: 'process-exits' }
const METHOD_NOT_FOUND = error(-32601, 'Method not found')

const TOOL = { name: 'echo', inputSchema: { type: 'object' } }
const DONE = { content: [{ type: 'text', text: 'done' }] }
const [OFFERED_LEGACY_VERSION] = LEGACY_PROTOCOL_VERSIONS
/** An `initialize` answer that the legacy path reads. */
const LEGACY = result({ protocolVersion: OFFERED_LEGACY_VERSION, capabilities: {} })

/** A modern discover result that names the highest version the transport speaks. */
function modern(
  fixture: TransportFixture,
  extra: Readonly<{ [key: string]: PlainJson }> = {},
): PeerReply {
  const highest = fixture.protocolVersions[0]
  assert.ok(highest !== undefined, 'the fixture names no protocol version')
  return result({ supportedVersions: [highest], capabilities: { tools: {} }, ...extra })
}

const taskId = (text: string): TaskId => {
  assert.ok(isTaskId(text))
  return text
}

const echo: CallRequest = { action: actionNameOf('echo'), args: jsonOf({}) }

const never = new AbortController().signal

/** The script with a modern discover answer unless the script names its own. */
function withModernDiscover(fixture: TransportFixture, script: ScriptSource): ScriptSource {
  if (typeof script === 'function')
    return target => ({ discover: modern(fixture), ...script(target) })
  return { discover: modern(fixture), ...script }
}

/** Opens a transport to a scripted peer, runs the body, and closes both. */
async function withPeer<T>(
  fixture: TransportFixture,
  script: ScriptSource,
  needs: Partial<PeerNeeds>,
  body: Body<T>,
): Promise<T> {
  const kind = needs.kind ?? fixture.kinds[0]
  assert.ok(kind !== undefined, 'the fixture names no material kind')
  if (!fixture.kinds.includes(kind)) throw new NotApplicable(`${kind} material`)
  assert.ok(
    fixture.protocolVersions.every(isModernProtocolVersion),
    'the fixture lists a legacy version; legacy versions are LEGACY_PROTOCOL_VERSIONS',
  )
  const peer = await fixture.peer(withModernDiscover(fixture, script), {
    ...needs,
    kind,
    instructionsByteLimit: needs.instructionsByteLimit ?? 4096,
  })
  try {
    const opened = await peer.factory.open(peer.material, never)
    assert.ok('ok' in opened, `the transport did not open: ${JSON.stringify(opened)}`)
    try {
      return await body(peer, opened.ok)
    } finally {
      await opened.ok.close()
    }
  } finally {
    await peer.close()
  }
}

function requests(received: readonly PeerReceived[], method: string): readonly Request[] {
  return received.flatMap(entry =>
    entry.kind === 'request' && entry.method === method ? [entry] : [],
  )
}

function notifications(received: readonly PeerReceived[], method: string) {
  return received.flatMap(entry =>
    entry.kind === 'notification' && entry.method === method ? [entry] : [],
  )
}

/** The methods of the requests and notifications, in the order the peer saw them. */
function methods(received: readonly PeerReceived[]): readonly string[] {
  return received.flatMap(entry =>
    entry.kind === 'request' || entry.kind === 'notification' ? [entry.method] : [],
  )
}

function ok<T>(outcome: Outcome<T, TransportFailure>, what: string): T {
  assert.ok('ok' in outcome, `${what} failed: ${JSON.stringify(outcome)}`)
  return outcome.ok
}

function failure<T>(outcome: Outcome<T, TransportFailure>, what: string): TransportFailure {
  assert.ok('failure' in outcome, `${what} did not fail: ${JSON.stringify(outcome)}`)
  return outcome.failure
}

function versionOf(entry: Request): PlainJson | undefined {
  return at(entry.params, '_meta', PROTOCOL_VERSION_KEY)
}

/** Each request and notification from `start` on, with the `_meta` version it carries. */
function versionsFrom(
  received: readonly PeerReceived[],
  start: number,
): readonly (readonly [string, PlainJson | undefined])[] {
  return received
    .slice(start)
    .flatMap(entry =>
      entry.kind === 'request' || entry.kind === 'notification'
        ? [[entry.method, at(entry.params, '_meta', PROTOCOL_VERSION_KEY)] as const]
        : [],
    )
}

/** The index of the last request of `method`. */
function lastIndexOf(received: readonly PeerReceived[], method: string): number {
  return received.findLastIndex(entry => entry.kind === 'request' && entry.method === method)
}

/** The `Mcp-Name` that a request carries on Streamable HTTP: the tool name or the task id. */
function mcpNameOf(entry: Request): PlainJson | undefined {
  if (entry.method === 'tools/call') return at(entry.params, 'name')
  if (['tasks/get', 'tasks/update', 'tasks/cancel'].includes(entry.method))
    return at(entry.params, 'taskId')
  return undefined
}

/**
 * Every request and notification carries the envelope, and the capabilities say what T3 says: on
 * a modern revision the tasks extension and `elicitation.form` and nothing of `elicitation.url`,
 * `sampling` or `roots`; on a legacy revision no capability. On Streamable HTTP every request also
 * carries the MCP request headers of T3.
 */
function assertEnvelopes(peer: ScriptedPeer, received: readonly PeerReceived[]): void {
  const sent = received.filter(entry => entry.kind === 'request' || entry.kind === 'notification')
  assert.ok(sent.length > 0, 'the peer received nothing')
  for (const entry of sent) {
    const meta = at(entry.params, '_meta')
    assert.ok(isRecord(meta), `${entry.method} carries no _meta`)
    const version = meta[PROTOCOL_VERSION_KEY]
    assert.strictEqual(typeof version, 'string', `${entry.method}: no protocol version`)
    assert.ok(isRecord(meta[CLIENT_INFO_KEY]), `${entry.method}: no clientInfo`)
    const capabilities = meta[CLIENT_CAPABILITIES_KEY]
    assert.ok(isRecord(capabilities), `${entry.method}: no clientCapabilities`)
    if (typeof version === 'string' && isModernProtocolVersion(version)) {
      assert.ok(
        isRecord(at(capabilities, 'extensions', TASKS_EXTENSION)),
        `${entry.method}: tasks not declared`,
      )
      assert.ok(
        isRecord(at(capabilities, 'elicitation', 'form')),
        `${entry.method}: elicitation.form not declared`,
      )
      assert.strictEqual(
        at(capabilities, 'elicitation', 'url'),
        undefined,
        `${entry.method}: elicitation.url declared`,
      )
      assert.strictEqual(capabilities['sampling'], undefined, `${entry.method}: sampling declared`)
      assert.strictEqual(capabilities['roots'], undefined, `${entry.method}: roots declared`)
    } else
      assert.deepStrictEqual(
        capabilities,
        {},
        `${entry.method}: a capability is declared on a legacy revision`,
      )
    assert.strictEqual(meta[LOG_LEVEL_KEY], undefined, `${entry.method}: logLevel set`)
    if (entry.kind === 'request' && peer.material.kind === 'streamable-http')
      assert.deepStrictEqual(
        {
          'mcp-protocol-version': entry.headers?.['mcp-protocol-version'],
          'mcp-method': entry.headers?.['mcp-method'],
          'mcp-name': entry.headers?.['mcp-name'],
        },
        {
          'mcp-protocol-version': version,
          'mcp-method': entry.method,
          'mcp-name': mcpNameOf(entry),
        },
        `${entry.method}: the MCP request headers`,
      )
  }
  assert.deepStrictEqual(requests(received, 'logging/setLevel'), [], 'logging/setLevel was sent')
  assert.deepStrictEqual(
    requests(received, 'subscriptions/listen'),
    [],
    'subscriptions/listen was sent',
  )
}

/** A credential handle that counts rejections and authorizes with a fixed header. */
function countingCredential(
  gate: Promise<void> = Promise.resolve(),
): HttpCredentialHandle & Readonly<{ rejections(): number }> {
  let rejections = 0
  return {
    purpose: 'http-authorization',
    async authorize(headers) {
      await gate
      headers.set('authorization', 'Bearer suite-token')
      return { ok: true }
    },
    async reportRejection() {
      rejections += 1
    },
    async release() {},
    rejections: () => rejections,
  }
}

const bearer = (parameters: string) => `Bearer ${parameters}`
const METADATA_PATH = '/.well-known/oauth-protected-resource'

/** The path of the target without a trailing slash, as RFC 9728 inserts it after the well-known path. */
function pathOf(target: string): string {
  return new URL(target).pathname.replace(/\/$/u, '')
}

/** The protected resource metadata URL with the path of the target (RFC 9728, section 3.1). */
function metadataUrlOf(target: string): string {
  return new URL(`${METADATA_PATH}${pathOf(target)}`, target).href
}

function targetOf(peer: ScriptedPeer): string {
  assert.ok(peer.material.kind === 'streamable-http', 'the case needs streamable-http material')
  return peer.material.target
}

/**
 * A process handle that hands every byte to and from the process unchanged and records when the
 * transport closes stdin, cancels stdout or stops the process. When the process ends its stdout
 * by itself, for example at the end of stdin, the wrapped stdout stays open until the transport
 * cancels it, so that the cancel is still observed.
 */
function observedProcess(process: ProcessHandle, events: string[]): ProcessHandle {
  const writer = process.stdin.getWriter()
  const reader = process.stdout.getReader()
  let cancelled = false
  return {
    stdin: new WritableStream<Uint8Array>({
      write: chunk => writer.write(chunk),
      async close() {
        events.push('stdin-closed')
        await writer.close()
      },
      abort: reason => writer.abort(reason),
    }),
    stdout: new ReadableStream<Uint8Array>({
      async pull(controller) {
        const next = await reader.read()
        if (cancelled || next.done) return
        controller.enqueue(next.value)
      },
      async cancel(reason) {
        cancelled = true
        events.push('stdout-cancelled')
        await reader.cancel(reason)
      },
    }),
    stderr: process.stderr,
    exited: process.exited,
    stop: async () => {
      events.push('stop')
      return process.stop()
    },
  }
}

// ---- The cases of the decision table (T8), one per row, generated from `TRANSPORT_TABLE` ----

/** The JSON-RPC error objects of an error class: the samples a peer answers with. */
function errorObjects(code: ErrorClass, fixture: TransportFixture): readonly PlainJson[] {
  const lowest = fixture.protocolVersions.at(-1) ?? ''
  const unsupported = (data?: PlainJson): PlainJson =>
    data === undefined
      ? { code: -32022, message: 'Unsupported protocol version' }
      : { code: -32022, message: 'Unsupported protocol version', data }
  switch (code) {
    case '-32020':
      return [{ code: -32020, message: 'Header mismatch' }]
    case '-32021':
      return [
        {
          code: -32021,
          message: 'Missing required client capability',
          data: { requiredCapabilities: { extensions: { [TASKS_EXTENSION]: {} } } },
        },
      ]
    case '-32022+common':
      return [unsupported({ supported: ['2000-01-01', lowest] })]
    case '-32022+modern':
      return [unsupported({ supported: ['2099-01-01'] })]
    case '-32022+legacy':
      return [
        unsupported(),
        unsupported({ supported: [LEGACY_PROTOCOL_VERSIONS[1]] }),
        unsupported({ supported: [] }),
      ]
    case '-32601':
      return [{ code: -32601, message: 'Method not found' }]
    case '-32602':
      return [{ code: -32602, message: 'Invalid params', data: { field: 'city' } }]
    case 'other':
      return [
        { code: -32603, message: 'Internal error', data: { retry: false } },
        { code: -32001, message: 'Session not found' },
      ]
    case 'unreadable':
      return [{ message: 'no code' }, { code: 1.5, message: 'fraction' }, { code: -32603 }]
    default: {
      const exhaustive: never = code
      return exhaustive
    }
  }
}

/** The results a peer answers with, for a request class and a result class. */
function resultValues(
  request: RequestClass,
  answer: string,
  fixture: TransportFixture,
): readonly PlainJson[] {
  const versions = [...fixture.protocolVersions]
  switch (`${request}|${answer}`) {
    case 'discover|result':
    case 'discover-retry|result':
      return [{ supportedVersions: versions, capabilities: { tools: {} } }]
    case 'discover|result:no-common':
    case 'discover-retry|result:no-common':
      return [{ supportedVersions: ['2099-01-01'], capabilities: {} }]
    case 'discover|result:unreadable':
    case 'discover-retry|result:unreadable':
      return [{ hello: 1 }, { supportedVersions: versions[0] ?? '', capabilities: {} }, [1]]
    case 'initialize|result':
      return [{ protocolVersion: OFFERED_LEGACY_VERSION, capabilities: {} }]
    case 'initialize|result:unreadable':
      return [
        [1],
        { capabilities: {} },
        { protocolVersion: '2024-01-01', capabilities: {} },
        { protocolVersion: '2025-01-01', capabilities: {} },
        { protocolVersion: versions[0] ?? '', capabilities: {} },
        { protocolVersion: OFFERED_LEGACY_VERSION, capabilities: 'none' },
      ]
    case 'tools/list|result':
      return [{ tools: [TOOL], nextCursor: 'p2', ttlMs: 30 }, { tools: [] }]
    case 'tools/list|result:tools-missing':
      return [{}, { tools: 'none' }, [1]]
    case 'tools/list|result:cursor-invalid':
      return [
        { tools: [], nextCursor: 7 },
        { tools: [], nextCursor: null },
      ]
    case 'tools/call|result':
      return [
        DONE,
        { resultType: 'input_required', requestState: 's1' },
        { resultType: 'task', taskId: 'task-1', status: 'working' },
        { resultType: 'stream', content: [] },
      ]
    case 'tasks/get|result':
      return [
        { status: 'working' },
        { status: 'input_required', inputRequests: {} },
        { status: 'completed', result: DONE },
        { status: 'failed', error: { code: -32603, message: 'failed' } },
        { status: 'cancelled' },
      ]
    case 'tasks/get|result:status-unknown':
      return [{ status: 'paused' }, {}, [1]]
    case 'tasks/get|result:input-requests-missing':
      return [{ status: 'input_required' }, { status: 'input_required', inputRequests: 'x' }]
    case 'tasks/get|result:result-missing':
      return [{ status: 'completed' }]
    case 'tasks/get|result:error-missing':
      return [{ status: 'failed' }, { status: 'failed', error: 'not an object' }]
    case 'tasks/update|result':
    case 'tasks/cancel|result':
      return [{}, { resultType: 'complete' }]
    default:
      throw new TypeError(`no result sample for ${request} and ${answer}`)
  }
}

const HTTP_ANSWER = /^http:(\d+)\+(.+)$/u

function isErrorClass(text: string): text is ErrorClass {
  return ERROR_CLASSES.some(code => code === text)
}

/** The replies of a peer for one cell of the table. */
function repliesOf(cell: TableCell, fixture: TransportFixture): readonly PeerReply[] {
  const { request, answer } = cell
  if (answer === 'stream-broken') return [STREAM_BREAKS]
  if (answer === 'silent') return [SILENT]
  if (answer === 'process-exited') return [PROCESS_EXITS]
  if (answer === 'http:401')
    return [{ kind: 'http', status: 401, headers: { 'www-authenticate': bearer('scope="a"') } }]
  if (answer === 'http:403+scope') {
    const challenge = bearer('error="insufficient_scope", scope="files:write"')
    return [{ kind: 'http', status: 403, headers: { 'www-authenticate': challenge } }]
  }
  if (answer === 'http:403')
    return [
      { kind: 'http', status: 403, body: 'origin not allowed' },
      {
        kind: 'http',
        status: 403,
        headers: { 'www-authenticate': bearer('error="invalid_token"') },
      },
    ]
  if (answer === 'http:2xx')
    return [
      { kind: 'http', status: 202 },
      { kind: 'http', status: 200, body: 'not a JSON-RPC answer' },
    ]
  if (answer === 'http:404+session')
    return [httpError(404, -32001, 'Session not found'), { kind: 'http', status: 404 }]
  const http = HTTP_ANSWER.exec(answer)
  if (http !== null) {
    const status = Number(http[1])
    const body = http[2] ?? ''
    if (body === 'plain') return [{ kind: 'http', status, body: `HTTP ${status}` }]
    assert.ok(isErrorClass(body), `unknown body class ${body}`)
    return errorObjects(body, fixture).map(object => ({
      kind: 'http',
      status,
      body: JSON.stringify({ jsonrpc: '2.0', id: null, error: object }),
    }))
  }
  if (answer.startsWith('error:')) {
    const code = answer.slice('error:'.length)
    assert.ok(isErrorClass(code), `unknown error class ${code}`)
    return errorObjects(code, fixture).map(object => ({ kind: 'error', error: object }))
  }
  return resultValues(request, answer, fixture).map(value => result(value))
}

/** The JSON-RPC error a reply carries, directly or as the body of an HTTP answer. */
function errorObjectOf(reply: PeerReply): PlainJson | undefined {
  if (reply.kind === 'error') return reply.error
  if (reply.kind !== 'http' || reply.body === undefined) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(reply.body)
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null || !('error' in parsed)) return undefined
  const error: unknown = parsed.error
  return isPlainValue(error) ? error : undefined
}

function isPlainValue(value: unknown): value is PlainJson {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return true
  if (Array.isArray(value)) return value.every(isPlainValue)
  return typeof value === 'object' && Object.values(value).every(isPlainValue)
}

/**
 * Holds a failure to the row. `error-answer` is filled in from the reply; a refused authorization
 * is held to its kind and cause, its discovery is T4's.
 */
function assertFailure(
  actual: TransportFailure,
  expected: ExpectedFailure,
  reply: PeerReply,
): void {
  if (expected.kind === 'not-sent' && expected.cause === 'authorization-required')
    assert.ok(
      actual.kind === 'not-sent' && actual.cause === 'authorization-required',
      `not authorization-required: ${JSON.stringify(actual)}`,
    )
  else assert.deepStrictEqual(actual, failureOf(expected, reply))
}

/** The failure an operation must answer, filled in from the reply where the row says so. */
function failureOf(
  expected: Exclude<ExpectedFailure, Readonly<{ cause: 'authorization-required' }>>,
  reply: PeerReply,
): TransportFailure {
  if (expected.kind !== 'error-answer') return expected
  const object = errorObjectOf(reply)
  const code = at(object, 'code')
  const message = at(object, 'message')
  assert.ok(typeof code === 'number' && typeof message === 'string', 'the sample is no error')
  const data = at(object, 'data')
  return {
    kind: 'error-answer',
    code,
    message,
    ...(data === undefined ? {} : { data: jsonOf(data) }),
  }
}

const LEGACY_BROKE = error(-32603, 'legacy broke')
const LEGACY_FAILURE: TransportFailure = {
  kind: 'error-answer',
  code: -32603,
  message: 'legacy broke',
}
const NOT_SENT_FAILURE: TransportFailure = { kind: 'not-sent', cause: 'connection-unavailable' }
const SESSION = 'session-1'

/** Polls what the peer received until a request of `method` is there. */
async function untilSent(peer: ScriptedPeer, method: string): Promise<void> {
  for (let round = 0; round < 500; round += 1) {
    if (requests(await peer.received(), method).length > 0) return
    await new Promise(resolve => setTimeout(resolve, 2))
  }
  assert.fail(`${method} was never sent`)
}

/** How one cell is run: the method on the wire, the script, and the operation. */
type Drive = Readonly<{
  method: string
  script: (replies: readonly PeerReply[]) => PeerScript
  run: (transport: McpTransport) => Promise<Outcome<unknown, TransportFailure>>
  ok: PeerReply
}>

function driveOf(request: RequestClass, fixture: TransportFixture): Drive {
  const okDiscover = result({ supportedVersions: [...fixture.protocolVersions], capabilities: {} })
  switch (request) {
    case 'tools/list':
      return {
        method: 'tools/list',
        script: replies => ({ listing: { '': replies } }),
        run: transport => transport.listActions(),
        ok: result({ tools: [] }),
      }
    case 'tasks/get':
      return {
        method: 'tasks/get',
        script: replies => ({ tasks: { t1: { get: replies } } }),
        run: transport => transport.getTask(taskId('t1')),
        ok: result({ status: 'working' }),
      }
    case 'tasks/update':
      return {
        method: 'tasks/update',
        script: replies => ({ tasks: { t1: { update: replies } } }),
        run: transport => transport.updateTask(taskId('t1'), jsonOf({})),
        ok: result({}),
      }
    case 'tasks/cancel':
      return {
        method: 'tasks/cancel',
        script: replies => ({ tasks: { t1: { cancel: replies } } }),
        run: transport => transport.cancelTask(taskId('t1')),
        ok: result({}),
      }
    case 'discover':
    case 'discover-retry':
    case 'initialize':
    case 'tools/call':
    case 'notification':
      return {
        method: 'server/discover',
        script: replies => ({ discover: replies }),
        run: transport => transport.discover(),
        ok: okDiscover,
      }
    default: {
      const exhaustive: never = request
      return exhaustive
    }
  }
}

/** The script that opens a legacy Streamable HTTP session before the cell's request. */
const SESSION_SCRIPT: PeerScript = {
  discover: METHOD_NOT_FOUND,
  initialize: {
    kind: 'result',
    result: { protocolVersion: OFFERED_LEGACY_VERSION, capabilities: {} },
    headers: { 'mcp-session-id': SESSION },
  },
}

/** Runs one cell: opens a peer for each part of the check and holds the transport to the row. */
async function checkCell(
  fixture: TransportFixture,
  cell: TableCell,
  reply: PeerReply,
  conclusion: TableConclusion,
): Promise<void> {
  const http = cell.kind === 'streamable-http'
  const run = async (
    script: PeerScript,
    body: (peer: ScriptedPeer, transport: McpTransport) => Promise<void>,
  ) => {
    const credential = countingCredential()
    await withPeer(
      fixture,
      script,
      http ? { kind: cell.kind, credential } : { kind: cell.kind },
      body,
    )
    if (http)
      assert.strictEqual(
        credential.rejections(),
        conclusion.rejection === true ? 1 : 0,
        'reportRejection was not called as the row says',
      )
  }
  const afterwards = async (transport: McpTransport) => {
    if (conclusion.unusable === true)
      assert.deepStrictEqual(await transport.listActions(), { failure: NOT_SENT_FAILURE })
  }
  switch (cell.request) {
    case 'discover':
    case 'discover-retry':
      return checkProbe(fixture, cell, reply, conclusion, run, afterwards)
    case 'initialize':
      return checkInitialize(cell, reply, conclusion, run, afterwards)
    case 'tools/call':
      return checkCall(cell, reply, conclusion, run, afterwards)
    case 'notification':
      return run(
        {
          ...SESSION_SCRIPT,
          ...(cell.answer === 'http:404+session' ? {} : { initialize: LEGACY }),
          notifications: reply,
          listing: { '': result({ tools: [] }) },
        },
        async (peer, transport) => {
          assert.strictEqual(conclusion.kind, 'ignored')
          ok(await transport.discover(), 'discover')
          assert.strictEqual(
            notifications(await peer.received(), 'notifications/initialized').length,
            1,
          )
          // On Streamable HTTP an answer to a notification leaves the transport as it was.
          if (http) ok(await transport.listActions(), 'listActions')
        },
      )
    default:
      return checkOperation(fixture, cell, reply, conclusion, run, afterwards)
  }
}

type Run = (
  script: PeerScript,
  body: (peer: ScriptedPeer, transport: McpTransport) => Promise<void>,
) => Promise<void>

async function checkProbe(
  fixture: TransportFixture,
  cell: TableCell,
  reply: PeerReply,
  conclusion: TableConclusion,
  run: Run,
  afterwards: (transport: McpTransport) => Promise<void>,
): Promise<void> {
  const lowest = fixture.protocolVersions.at(-1)
  assert.ok(lowest !== undefined)
  const [common] = errorObjects('-32022+common', fixture)
  const before: readonly PeerReply[] =
    cell.request === 'discover-retry' ? [{ kind: 'error', error: common ?? null }] : []
  const sent = before.length + 1
  const discovers = async (peer: ScriptedPeer) => requests(await peer.received(), 'server/discover')
  const initializes = async (peer: ScriptedPeer) => requests(await peer.received(), 'initialize')
  switch (conclusion.kind) {
    case 'read':
      return run({ discover: [...before, reply], initialize: LEGACY }, async (peer, transport) => {
        const identity = ok(await transport.discover(), 'discover')
        assert.strictEqual(identity.protocolVersion, fixture.protocolVersions[0])
        assert.strictEqual((await discovers(peer)).length, sent)
        assert.deepStrictEqual(await initializes(peer), [])
      })
    case 'retry':
      return run(
        {
          discover: [reply, result({ supportedVersions: [lowest], capabilities: {} })],
          initialize: LEGACY,
        },
        async (peer, transport) => {
          assert.strictEqual(ok(await transport.discover(), 'discover').protocolVersion, lowest)
          assert.strictEqual((await discovers(peer)).length, 2)
          assert.deepStrictEqual(await initializes(peer), [])
        },
      )
    case 'fallback': {
      const report = conclusion.report
      await run({ discover: [...before, reply], initialize: LEGACY }, async (peer, transport) => {
        const identity = ok(await transport.discover(), 'discover')
        assert.strictEqual(identity.protocolVersion, OFFERED_LEGACY_VERSION)
        assert.strictEqual((await initializes(peer)).length, 1)
      })
      return run(
        { discover: [...before, reply], initialize: LEGACY_BROKE },
        async (_peer, transport) => {
          const failed = failure(await transport.discover(), 'discover')
          if (report === 'legacy') assert.deepStrictEqual(failed, LEGACY_FAILURE)
          else assertFailure(failed, report, reply)
        },
      )
    }
    case 'resend':
      await run({ discover: [...before, reply, fixtureOk(fixture)] }, async (peer, transport) => {
        ok(await transport.discover(), 'discover')
        const probes = await discovers(peer)
        assert.strictEqual(probes.length, sent + 1, 'the probe was not sent once more')
        assert.notStrictEqual(probes.at(-1)?.id, probes.at(-2)?.id, 'sent again with the same id')
      })
      return run({ discover: [...before, reply, reply] }, async (peer, transport) => {
        assert.deepStrictEqual(failure(await transport.discover(), 'discover'), {
          kind: 'no-answer',
          cause: 'stream-broken',
        })
        assert.strictEqual((await discovers(peer)).length, sent + 1)
      })
    case 'failure':
      return run({ discover: [...before, reply], initialize: LEGACY }, async (peer, transport) => {
        const pending = transport.discover()
        if (reply.kind === 'silent') {
          await untilSent(peer, 'server/discover')
          await transport.close()
        }
        assertFailure(failure(await pending, 'discover'), conclusion.failure, reply)
        assert.strictEqual((await discovers(peer)).length, sent)
        assert.deepStrictEqual(await initializes(peer), [])
        await afterwards(transport)
      })
    default:
      assert.fail(`row conclusion ${conclusion.kind} on server/discover`)
  }
}

function fixtureOk(fixture: TransportFixture): PeerReply {
  return result({ supportedVersions: [...fixture.protocolVersions], capabilities: {} })
}

async function checkInitialize(
  cell: TableCell,
  reply: PeerReply,
  conclusion: TableConclusion,
  run: Run,
  afterwards: (transport: McpTransport) => Promise<void>,
): Promise<void> {
  await run({ discover: METHOD_NOT_FOUND, initialize: reply }, async (peer, transport) => {
    const pending = transport.discover()
    if (reply.kind === 'silent') {
      await untilSent(peer, 'initialize')
      await transport.close()
    }
    const outcome = await pending
    const initialized = notifications(await peer.received(), 'notifications/initialized')
    if (conclusion.kind === 'read') {
      assert.strictEqual(ok(outcome, 'discover').protocolVersion, OFFERED_LEGACY_VERSION)
      assert.strictEqual(initialized.length, 1)
      return
    }
    assert.ok(conclusion.kind === 'failure', `row conclusion ${conclusion.kind} on initialize`)
    assertFailure(failure(outcome, 'discover'), conclusion.failure, reply)
    assert.deepStrictEqual(initialized, [])
    assert.ok(cell.kind === 'stdio' || conclusion.unusable !== true)
    await afterwards(transport)
  })
}

async function checkCall(
  cell: TableCell,
  reply: PeerReply,
  conclusion: TableConclusion,
  run: Run,
  afterwards: (transport: McpTransport) => Promise<void>,
): Promise<void> {
  const session = cell.answer === 'http:404+session'
  await run(
    { ...(session ? SESSION_SCRIPT : {}), calls: { echo: reply } },
    async (peer, transport) => {
      if (session) ok(await transport.discover(), 'discover')
      const outcome = await transport.call(echo, never)
      if (conclusion.kind === 'failure') {
        assertFailure(failure(outcome, 'call'), conclusion.failure, reply)
      } else {
        assert.ok(conclusion.kind === 'answer', `row conclusion ${conclusion.kind} on tools/call`)
        const sent = ok(outcome, 'call')
        if (reply.kind === 'silent') {
          await untilSent(peer, 'tools/call')
          await transport.close()
        }
        const answer = await sent.answer
        if (conclusion.answer === 'result') {
          assert.ok(reply.kind === 'result')
          assert.deepStrictEqual(answer, { kind: 'result', result: jsonOf(reply.result) })
        } else if (conclusion.answer === 'error')
          assert.deepStrictEqual(answer, { kind: 'error', error: jsonOf(errorObjectOf(reply)) })
        else assert.deepStrictEqual(answer, { kind: 'no-answer', cause: conclusion.answer })
      }
      const received = await peer.received()
      assert.strictEqual(requests(received, 'tools/call').length, 1, 'tools/call was sent again')
      if (session) assertSession(received, 'tools/call')
      await afterwards(transport)
    },
  )
}

/** The request of `method` carried the legacy session. */
function assertSession(received: readonly PeerReceived[], method: string): void {
  const [request] = requests(received, method)
  assert.strictEqual(request?.headers?.['mcp-session-id'], SESSION, `${method}: no session id`)
}

async function checkOperation(
  fixture: TransportFixture,
  cell: TableCell,
  reply: PeerReply,
  conclusion: TableConclusion,
  run: Run,
  afterwards: (transport: McpTransport) => Promise<void>,
): Promise<void> {
  const drive = driveOf(cell.request, fixture)
  const session = cell.answer === 'http:404+session'
  const scriptOf = (replies: readonly PeerReply[]): PeerScript => ({
    ...(session ? SESSION_SCRIPT : {}),
    ...drive.script(replies),
  })
  const opened = async (transport: McpTransport) => {
    if (session) ok(await transport.discover(), 'discover')
  }
  const count = async (peer: ScriptedPeer) => requests(await peer.received(), drive.method).length
  switch (conclusion.kind) {
    case 'read':
      return run(scriptOf([reply]), async (_peer, transport) => {
        await opened(transport)
        ok(await drive.run(transport), drive.method)
      })
    case 'expired':
      return run(scriptOf([reply, reply]), async (_peer, transport) => {
        assert.deepStrictEqual(await transport.getTask(taskId('t1')), { ok: 'expired' })
        assert.deepStrictEqual(await transport.getTaskResult(taskId('t1')), {
          ok: { kind: 'expired' },
        })
      })
    case 'resend':
      await run(scriptOf([reply, drive.ok]), async (peer, transport) => {
        await opened(transport)
        ok(await drive.run(transport), drive.method)
        assert.strictEqual(await count(peer), 2, `${drive.method} was not sent once more`)
        const [first, second] = requests(await peer.received(), drive.method)
        assert.notStrictEqual(first?.id, second?.id, 'sent again with the same id')
      })
      return run(scriptOf([reply, reply]), async (peer, transport) => {
        await opened(transport)
        assert.deepStrictEqual(await drive.run(transport), {
          failure: { kind: 'no-answer', cause: 'stream-broken' },
        })
        assert.strictEqual(await count(peer), 2)
      })
    case 'failure':
      return run(scriptOf([reply, reply]), async (peer, transport) => {
        await opened(transport)
        const pending = drive.run(transport)
        if (reply.kind === 'silent') {
          await untilSent(peer, drive.method)
          await transport.close()
        }
        assertFailure(failure(await pending, drive.method), conclusion.failure, reply)
        assert.strictEqual(await count(peer), 1, `${drive.method} was sent again`)
        const again =
          reply.kind !== 'silent' && conclusion.unusable !== true && conclusion.rejection !== true
        if (cell.request === 'tasks/get' && again)
          assertFailure(
            failure(await transport.getTaskResult(taskId('t1')), 'getTaskResult'),
            conclusion.failure,
            reply,
          )
        if (session) assertSession(await peer.received(), drive.method)
        await afterwards(transport)
      })
    default:
      assert.fail(`row conclusion ${conclusion.kind} on ${cell.request}`)
  }
}

/** A short text of a list for a case name. */
function listed(items: readonly string[]): string {
  return items.length <= 3
    ? items.join(', ')
    : `${items.slice(0, 3).join(', ')} … (${items.length})`
}

function conclusionText(conclusion: TableConclusion): string {
  const flags = `${conclusion.unusable === true ? ', unusable' : ''}${conclusion.rejection === true ? ', reportRejection once' : ''}`
  switch (conclusion.kind) {
    case 'failure': {
      const failure = conclusion.failure
      const detail =
        failure.kind === 'answer-malformed'
          ? failure.what
          : failure.kind === 'error-answer'
            ? 'as written'
            : failure.cause
      return `${failure.kind} (${detail})${flags}`
    }
    case 'answer':
      return `sent, answer ${conclusion.answer}${flags}`
    case 'fallback':
      return `legacy path, reports ${typeof conclusion.report === 'string' ? 'its failure' : conclusion.report.kind}${flags}`
    default:
      return `${conclusion.kind}${flags}`
  }
}

/** One case per row of the decision table; it runs every cell of the row on the fixture's kinds. */
function tableCases(): readonly Case[] {
  return TRANSPORT_TABLE.map(row =>
    conformanceCase(
      'T8',
      `[${row.id}] ${listed(row.requests)} × ${listed(row.answers)} → ${conclusionText(row.conclusion)}`,
      async fixture => {
        const cells = cellsOf(row).filter(cell => fixture.kinds.includes(cell.kind))
        if (cells.length === 0) throw new NotApplicable(`${row.kinds.join(' or ')} material`)
        for (const cell of cells)
          for (const reply of repliesOf(cell, fixture))
            try {
              await checkCell(fixture, cell, reply, row.conclusion)
            } catch (error) {
              if (error instanceof assert.AssertionError)
                error.message = `${cell.kind} ${cell.request} ${cell.answer}: ${error.message}`
              throw error
            }
      },
    ),
  )
}

const t1Cases = (): readonly Case[] => [
  conformanceCase(
    'T1',
    'call: a sent call hands over the request id and the raw result',
    async fixture =>
      withPeer(fixture, { calls: { echo: result(DONE) } }, {}, async (peer, transport) => {
        const sent = ok(await transport.call(echo, never), 'call')
        assert.strictEqual(typeof sent.requestId, 'string')
        assert.notStrictEqual(sent.requestId, '')
        assert.deepStrictEqual(await sent.answer, { kind: 'result', result: jsonOf(DONE) })
        const [request] = requests(await peer.received(), 'tools/call')
        assert.ok(request !== undefined, 'tools/call was not sent')
        assert.strictEqual(request.id, sent.requestId)
        assert.strictEqual(at(request.params, 'name'), 'echo')
        assert.deepStrictEqual(at(request.params, 'arguments'), {})
      }),
  ),
  conformanceCase(
    'T1',
    'call: after close() a call is not-sent and has no peer effect',
    async fixture =>
      withPeer(fixture, { calls: { echo: result(DONE) } }, {}, async (peer, transport) => {
        await transport.close()
        assert.deepStrictEqual(await transport.call(echo, never), {
          failure: { kind: 'not-sent', cause: 'connection-unavailable' },
        })
        assert.deepStrictEqual(requests(await peer.received(), 'tools/call'), [])
      }),
  ),
]

const t2Cases = (): readonly Case[] => [
  conformanceCase(
    'T2',
    'discover: the modern answer is read to the peer identity',
    async fixture => {
      const highest = fixture.protocolVersions[0]
      assert.ok(highest !== undefined)
      const capabilities = { tools: { listChanged: false }, extensions: { [TASKS_EXTENSION]: {} } }
      const serverInfo = { name: 'peer', version: '2' }
      await withPeer(
        fixture,
        {
          discover: result({
            supportedVersions: ['1999-01-01', highest],
            capabilities,
            _meta: { [SERVER_INFO_KEY]: serverInfo },
          }),
        },
        {},
        async (_peer, transport) => {
          const identity = ok(await transport.discover(), 'discover')
          assert.strictEqual(identity.protocolVersion, highest)
          assert.deepStrictEqual(identity.capabilities, jsonOf(capabilities))
          assert.deepStrictEqual(identity.serverInfo, { untrusted: jsonOf(serverInfo) })
          assert.strictEqual(identity.instructions, undefined)
        },
      )
    },
  ),
  conformanceCase(
    'T2',
    'listActions: the page carries the tools, the next cursor and the ttl as written',
    async fixture =>
      withPeer(
        fixture,
        {
          listing: {
            '': result({ tools: [TOOL], nextCursor: 'p2', ttlMs: 30 }),
            p2: result({ tools: [{ name: 'other', inputSchema: { type: 'object' } }] }),
          },
        },
        {},
        async (peer, transport) => {
          const first = ok(await transport.listActions(), 'listActions')
          assert.deepStrictEqual(first.tools, [jsonOf(TOOL)])
          assert.strictEqual(first.nextCursor, 'p2')
          assert.strictEqual(first.ttlMs, 30)
          const second = ok(await transport.listActions('p2'), 'listActions')
          assert.strictEqual(second.nextCursor, undefined)
          assert.strictEqual(second.ttlMs, undefined)
          const [, next] = requests(await peer.received(), 'tools/list')
          assert.strictEqual(at(next?.params, 'cursor'), 'p2')
        },
      ),
  ),
  conformanceCase(
    'T2',
    'streamable-http: a tool with an invalid x-mcp-header declaration is withheld (item 8)',
    async fixture => {
      const bad = {
        name: 'bad',
        inputSchema: {
          type: 'object',
          properties: { q: { type: 'string', 'x-mcp-header': 'not a token' } },
        },
      }
      const good = {
        name: 'good',
        inputSchema: {
          type: 'object',
          properties: { q: { type: 'string', 'x-mcp-header': 'X-Q' } },
        },
      }
      await withPeer(
        fixture,
        { listing: { '': result({ tools: [bad, good] }) } },
        { kind: 'streamable-http' },
        async (_peer, transport) => {
          const page = ok(await transport.listActions(), 'listActions')
          assert.deepStrictEqual(page.tools, [jsonOf(good)])
          assert.deepStrictEqual(page.withheld, [
            { name: { untrusted: 'bad' }, reason: 'header-invalid' },
          ])
        },
      )
    },
  ),
  conformanceCase(
    'T2',
    'stdio: x-mcp-header is not checked and the page is handed over as written (item 8)',
    async fixture => {
      const bad = { name: 'bad', inputSchema: { type: 'object', 'x-mcp-header': 'root' } }
      await withPeer(
        fixture,
        { listing: { '': result({ tools: [bad] }) } },
        { kind: 'stdio' },
        async (_peer, transport) => {
          const page = ok(await transport.listActions(), 'listActions')
          assert.deepStrictEqual(page.tools, [jsonOf(bad)])
          assert.strictEqual(page.withheld, undefined)
        },
      )
    },
  ),
]

const t3Cases = (): readonly Case[] => [
  conformanceCase(
    'T3',
    'every request and notification carries the three _meta keys and the fixed capabilities (item 7)',
    async fixture =>
      withPeer(
        fixture,
        {
          calls: { echo: result(DONE) },
          listing: { '': result({ tools: [] }) },
          tasks: { t1: { get: result({ status: 'working' }) } },
        },
        {},
        async (peer, transport) => {
          ok(await transport.discover(), 'discover')
          ok(await transport.listActions(), 'listActions')
          const sent = ok(await transport.call(echo, never), 'call')
          await sent.answer
          ok(await transport.getTask(taskId('t1')), 'getTask')
          const received = await peer.received()
          assertEnvelopes(peer, received)
          const [discover] = requests(received, 'server/discover')
          assert.strictEqual(
            discover === undefined ? undefined : versionOf(discover),
            fixture.protocolVersions[0],
          )
        },
      ),
  ),
  conformanceCase(
    'T3',
    'streamable-http: each request carries MCP-Protocol-Version, Mcp-Method, and Mcp-Name for tools/call and tasks/* (item 7)',
    async fixture =>
      withPeer(
        fixture,
        {
          calls: { echo: result(DONE) },
          listing: { '': result({ tools: [] }) },
          tasks: { t1: { get: result({ status: 'working' }) } },
        },
        { kind: 'streamable-http' },
        async (peer, transport) => {
          ok(await transport.discover(), 'discover')
          ok(await transport.listActions(), 'listActions')
          await ok(await transport.call(echo, never), 'call').answer
          ok(await transport.getTask(taskId('t1')), 'getTask')
          ok(await transport.updateTask(taskId('t1'), jsonOf({})), 'updateTask')
          ok(await transport.cancelTask(taskId('t1')), 'cancelTask')
          const received = await peer.received()
          assertEnvelopes(peer, received)
          const names = received.flatMap(entry =>
            entry.kind === 'request' ? [[entry.method, entry.headers?.['mcp-name']]] : [],
          )
          assert.deepStrictEqual(names, [
            ['server/discover', undefined],
            ['tools/list', undefined],
            ['tools/call', 'echo'],
            ['tasks/get', 't1'],
            ['tasks/update', 't1'],
            ['tasks/cancel', 't1'],
          ])
        },
      ),
  ),
  conformanceCase(
    'T3',
    'a legacy peer: discover falls back to initialize and initialized (item 7)',
    async fixture => {
      const initialized = {
        protocolVersion: OFFERED_LEGACY_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'old', version: '1' },
        instructions: 'hello',
      }
      await withPeer(
        fixture,
        { discover: METHOD_NOT_FOUND, initialize: result(initialized) },
        {},
        async (peer, transport) => {
          const identity = ok(await transport.discover(), 'discover')
          assert.strictEqual(identity.protocolVersion, OFFERED_LEGACY_VERSION)
          assert.deepStrictEqual(identity.capabilities, jsonOf({ tools: {} }))
          assert.deepStrictEqual(identity.serverInfo, { untrusted: jsonOf(initialized.serverInfo) })
          assert.strictEqual(identity.instructions?.untrusted.text, 'hello')
          const received = await peer.received()
          assert.deepStrictEqual(methods(received), [
            'server/discover',
            'initialize',
            'notifications/initialized',
          ])
          assertEnvelopes(peer, received)
        },
      )
    },
  ),
  conformanceCase(
    'T3',
    'legacy: initialize offers the highest legacy version and declares no capability (item 7)',
    async fixture =>
      withPeer(
        fixture,
        { discover: METHOD_NOT_FOUND, initialize: LEGACY },
        {},
        async (peer, transport) => {
          ok(await transport.discover(), 'discover')
          const [initialize] = requests(await peer.received(), 'initialize')
          assert.ok(initialize !== undefined, 'initialize was not sent')
          assert.strictEqual(at(initialize.params, 'protocolVersion'), OFFERED_LEGACY_VERSION)
          assert.strictEqual(versionOf(initialize), OFFERED_LEGACY_VERSION)
          assert.ok(isRecord(at(initialize.params, 'clientInfo')), 'initialize: no clientInfo')
          assert.deepStrictEqual(
            at(initialize.params, 'capabilities'),
            {},
            'initialize declares a capability',
          )
        },
      ),
  ),
  conformanceCase(
    'T3',
    'after negotiation every request carries the negotiated version, on the legacy path too (item 7)',
    async fixture => {
      const negotiated = LEGACY_PROTOCOL_VERSIONS[1]
      await withPeer(
        fixture,
        {
          discover: METHOD_NOT_FOUND,
          initialize: result({ protocolVersion: negotiated, capabilities: {} }),
          calls: { echo: result(DONE) },
          listing: { '': result({ tools: [] }) },
        },
        {},
        async (peer, transport) => {
          assert.strictEqual(ok(await transport.discover(), 'discover').protocolVersion, negotiated)
          ok(await transport.listActions(), 'listActions')
          await ok(await transport.call(echo, never), 'call').answer
          const received = await peer.received()
          assertEnvelopes(peer, received)
          const after = received.slice(
            received.findIndex(
              entry =>
                entry.kind === 'notification' && entry.method === 'notifications/initialized',
            ),
          )
          const versions = after.flatMap(entry =>
            entry.kind === 'request' || entry.kind === 'notification'
              ? [[entry.method, at(entry.params, '_meta', PROTOCOL_VERSION_KEY)]]
              : [],
          )
          assert.deepStrictEqual(versions, [
            ['notifications/initialized', negotiated],
            ['tools/list', negotiated],
            ['tools/call', negotiated],
          ])
        },
      )
    },
  ),
  conformanceCase(
    'T3',
    'streamable-http: on the legacy path each later request carries the negotiated version in _meta and MCP-Protocol-Version, and the session id (item 7)',
    async fixture => {
      const negotiated = LEGACY_PROTOCOL_VERSIONS[1]
      await withPeer(
        fixture,
        {
          discover: METHOD_NOT_FOUND,
          initialize: {
            kind: 'result',
            result: { protocolVersion: negotiated, capabilities: {} },
            headers: { 'mcp-session-id': 'session-1' },
          },
          calls: { echo: result(DONE) },
          listing: { '': result({ tools: [] }) },
        },
        { kind: 'streamable-http' },
        async (peer, transport) => {
          ok(await transport.discover(), 'discover')
          ok(await transport.listActions(), 'listActions')
          await ok(await transport.call(echo, never), 'call').answer
          const received = await peer.received()
          assertEnvelopes(peer, received)
          const headers = received
            .slice(lastIndexOf(received, 'initialize') + 1)
            .flatMap(entry =>
              entry.kind === 'request'
                ? [[entry.headers?.['mcp-protocol-version'], entry.headers?.['mcp-session-id']]]
                : [],
            )
          assert.deepStrictEqual(headers, [
            [negotiated, 'session-1'],
            [negotiated, 'session-1'],
          ])
          const [initialize] = requests(received, 'initialize')
          assert.strictEqual(initialize?.headers?.['mcp-session-id'], undefined)
        },
      )
    },
  ),
  conformanceCase(
    'T3',
    '-32022 with supported versions: one retry with the highest version in common, kept by every later request (item 7)',
    async fixture => {
      const lowest = fixture.protocolVersions.at(-1)
      assert.ok(lowest !== undefined)
      await withPeer(
        fixture,
        {
          discover: [
            error(-32022, 'unsupported', { supported: ['2000-01-01', lowest] }),
            result({ supportedVersions: [lowest], capabilities: {} }),
          ],
          initialize: LEGACY,
          listing: { '': result({ tools: [] }) },
          calls: { echo: result(DONE) },
          tasks: { t1: { get: result({ status: 'working' }) } },
        },
        {},
        async (peer, transport) => {
          assert.strictEqual(ok(await transport.discover(), 'discover').protocolVersion, lowest)
          ok(await transport.listActions(), 'listActions')
          await ok(await transport.call(echo, never), 'call').answer
          ok(await transport.getTask(taskId('t1')), 'getTask')
          const received = await peer.received()
          assert.strictEqual(requests(received, 'server/discover').length, 2)
          assert.deepStrictEqual(requests(received, 'initialize'), [])
          assert.deepStrictEqual(versionsFrom(received, lastIndexOf(received, 'server/discover')), [
            ['server/discover', lowest],
            ['tools/list', lowest],
            ['tools/call', lowest],
            ['tasks/get', lowest],
          ])
          assertEnvelopes(peer, received)
        },
      )
    },
  ),
  conformanceCase(
    'T3, T5',
    'stdio: after a -32022 retry the cancel notification carries the negotiated version (item 7)',
    async fixture => {
      const lowest = fixture.protocolVersions.at(-1)
      assert.ok(lowest !== undefined)
      await withPeer(
        fixture,
        {
          discover: [
            error(-32022, 'unsupported', { supported: [lowest] }),
            result({ supportedVersions: [lowest], capabilities: {} }),
          ],
          calls: { echo: SILENT },
        },
        { kind: 'stdio' },
        async (peer, transport) => {
          ok(await transport.discover(), 'discover')
          const sent = ok(await transport.call(echo, never), 'call')
          await transport.cancelRequest(sent.requestId)
          const [cancelled] = notifications(await peer.received(), 'notifications/cancelled')
          assert.ok(cancelled !== undefined, 'notifications/cancelled was not sent')
          assert.strictEqual(at(cancelled.params, '_meta', PROTOCOL_VERSION_KEY), lowest)
        },
      )
    },
  ),
  conformanceCase(
    'T3',
    'legacy: a ping of the peer gets an empty result and any other request -32601, before initialize is answered and after initialized (item 7)',
    async fixture =>
      withPeer(
        fixture,
        {
          discover: METHOD_NOT_FOUND,
          initialize: LEGACY,
          listing: { '': result({ tools: [] }) },
          peerRequests: [
            { method: 'ping', at: 'initialize' },
            { method: 'sampling/createMessage', at: 'initialize' },
            { method: 'ping' },
            { method: 'roots/list' },
          ],
        },
        {},
        async (peer, transport) => {
          ok(await transport.discover(), 'discover')
          ok(await transport.listActions(), 'listActions')
          const answers = (await peer.received()).flatMap(entry =>
            entry.kind === 'response'
              ? [entry.result === undefined ? at(entry.error, 'code') : entry.result]
              : [],
          )
          assert.deepStrictEqual(answers, [{}, -32601, {}, -32601])
        },
      ),
  ),
  conformanceCase(
    'T3',
    'instructions are cut to the byte limit of the material, the digest over the whole text',
    async fixture => {
      const whole = 'abcdefghijklmnop'
      await withPeer(
        fixture,
        { discover: modern(fixture, { instructions: whole }) },
        { instructionsByteLimit: 8 },
        async (peer, transport) => {
          const identity = ok(await transport.discover(), 'discover')
          assert.deepStrictEqual(identity.instructions, {
            untrusted: { ...boundInstructions(whole, 8), generation: peer.material.generation },
          })
        },
      )
    },
  ),
  conformanceCase(
    'T3',
    'legacy: the instructions of initialize are cut to the byte limit of the material too',
    async fixture => {
      const whole = 'abcdefghijklmnop'
      await withPeer(
        fixture,
        {
          discover: METHOD_NOT_FOUND,
          initialize: result({
            protocolVersion: OFFERED_LEGACY_VERSION,
            capabilities: {},
            instructions: whole,
          }),
        },
        { instructionsByteLimit: 8 },
        async (peer, transport) => {
          const identity = ok(await transport.discover(), 'discover')
          assert.deepStrictEqual(identity.instructions, {
            untrusted: { ...boundInstructions(whole, 8), generation: peer.material.generation },
          })
        },
      )
    },
  ),
  conformanceCase(
    'T3',
    'a call carries a progress token unique per request; its progress params reach observe untrusted as written, other tokens are dropped (item 14)',
    async fixture => {
      const progress: PeerNotificationScript = {
        method: 'notifications/progress',
        params: { progress: 1, total: 2, message: 'half' },
      }
      const stray: PeerNotificationScript = {
        method: 'notifications/progress',
        params: { progress: 9, progressToken: 'not-this-call' },
      }
      const log: PeerNotificationScript = {
        method: 'notifications/message',
        params: { level: 'info', data: 'x' },
      }
      await withPeer(
        fixture,
        { calls: { echo: result(DONE, [stray, log, progress]) } },
        {},
        async (peer, transport) => {
          const seen: PeerNotification[] = []
          const first = ok(
            await transport.call(echo, never, notification => seen.push(notification)),
            'call',
          )
          await first.answer
          const second = ok(await transport.call(echo, never), 'call')
          await second.answer
          const tokens = requests(await peer.received(), 'tools/call').map(request =>
            at(request.params, '_meta', 'progressToken'),
          )
          assert.strictEqual(tokens.length, 2)
          assert.ok(
            tokens.every(token => typeof token === 'string' || typeof token === 'number'),
            'a call has no progressToken',
          )
          assert.notDeepStrictEqual(tokens[0], tokens[1])
          assert.deepStrictEqual(seen, [
            {
              kind: 'progress',
              notification: {
                untrusted: jsonOf({
                  progress: 1,
                  total: 2,
                  message: 'half',
                  progressToken: tokens[0] ?? null,
                }),
              },
            },
          ])
        },
      )
    },
  ),
]

const t4Cases = (): readonly Case[] => {
  /** Protected resource metadata whose `resource` is the target (RFC 9728, section 3.3). */
  const metadata = (target: string, issuer: string) => ({
    resource: target,
    authorization_servers: [issuer],
    scopes_supported: ['files:read', 'files:write'],
  })
  const unauthorized = (challenge: string): PeerReply => ({
    kind: 'http',
    status: 401,
    headers: { 'www-authenticate': bearer(challenge) },
  })
  const forbidden = (challenge: string): PeerReply => ({
    kind: 'http',
    status: 403,
    headers: { 'www-authenticate': bearer(challenge) },
  })
  const authorizationRequired = (refused: TransportFailure) => {
    assert.ok(
      refused.kind === 'not-sent' && refused.cause === 'authorization-required',
      JSON.stringify(refused),
    )
    return refused.discovery
  }
  return [
    conformanceCase(
      'T4',
      '401: not-sent authorization-required from WWW-Authenticate and the named metadata; reportRejection once (item 11)',
      async fixture => {
        const credential = countingCredential()
        await withPeer(
          fixture,
          target => ({
            calls: {
              echo: unauthorized(
                `resource_metadata="${metadataUrlOf(target)}", scope="files:read"`,
              ),
            },
            wellKnown: {
              [`${METADATA_PATH}${pathOf(target)}`]: metadata(target, 'https://issuer.test'),
            },
          }),
          { kind: 'streamable-http', credential },
          async (peer, transport) => {
            const target = targetOf(peer)
            const discovery = authorizationRequired(
              failure(await transport.call(echo, never), 'call'),
            )
            assert.strictEqual(discovery.resourceMetadataUrl, metadataUrlOf(target))
            assert.strictEqual(discovery.metadata, 'fetched')
            assert.deepStrictEqual(discovery.resourceMetadata, {
              untrusted: jsonOf(metadata(target, 'https://issuer.test')),
            })
            assert.deepStrictEqual(discovery.issuers, ['https://issuer.test'])
            assert.deepStrictEqual(discovery.scopes, ['files:read'])
            assert.strictEqual(credential.rejections(), 1)
          },
        )
      },
    ),
    conformanceCase(
      'T4',
      '401 on listActions without resource_metadata: the well-known URL with the path is tried before the root; reportRejection once (item 11)',
      async fixture => {
        const credential = countingCredential()
        await withPeer(
          fixture,
          target => ({
            listing: { '': unauthorized('realm="mcp"') },
            wellKnown: { [METADATA_PATH]: metadata(target, 'https://root.test') },
          }),
          { kind: 'streamable-http', credential },
          async (peer, transport) => {
            const discovery = authorizationRequired(
              failure(await transport.listActions(), 'listActions'),
            )
            const fetched = (await peer.received()).flatMap(entry =>
              entry.kind === 'fetch' ? [new URL(entry.url).pathname] : [],
            )
            assert.deepStrictEqual(fetched, [
              `${METADATA_PATH}${pathOf(targetOf(peer))}`,
              METADATA_PATH,
            ])
            assert.strictEqual(new URL(discovery.resourceMetadataUrl).pathname, METADATA_PATH)
            assert.strictEqual(discovery.metadata, 'fetched')
            assert.deepStrictEqual(discovery.issuers, ['https://root.test'])
            assert.deepStrictEqual(discovery.scopes, ['files:read', 'files:write'])
            assert.strictEqual(credential.rejections(), 1)
          },
        )
      },
    ),
    conformanceCase(
      'T4',
      '401 with no metadata anywhere: metadata unavailable, issuers empty, scopes from the header; reportRejection once (item 11)',
      async fixture => {
        const credential = countingCredential()
        await withPeer(
          fixture,
          { calls: { echo: unauthorized('scope="a b"') } },
          { kind: 'streamable-http', credential },
          async (_peer, transport) => {
            const discovery = authorizationRequired(
              failure(await transport.call(echo, never), 'call'),
            )
            assert.strictEqual(discovery.metadata, 'unavailable')
            assert.strictEqual(discovery.resourceMetadata, undefined)
            assert.strictEqual(new URL(discovery.resourceMetadataUrl).pathname, METADATA_PATH)
            assert.deepStrictEqual(discovery.issuers, [])
            assert.deepStrictEqual(discovery.scopes, ['a', 'b'])
            assert.strictEqual(credential.rejections(), 1)
          },
        )
      },
    ),
    conformanceCase(
      'T4',
      '401: a named resource_metadata that is not a JSON object counts as unavailable and is still reported (item 11)',
      async fixture =>
        withPeer(
          fixture,
          target => ({
            calls: { echo: unauthorized(`resource_metadata="${metadataUrlOf(target)}"`) },
            wellKnown: {
              [`${METADATA_PATH}${pathOf(target)}`]: ['not', 'an', 'object'],
              [METADATA_PATH]: metadata(target, 'https://root.test'),
            },
          }),
          { kind: 'streamable-http', credential: countingCredential() },
          async (peer, transport) => {
            const discovery = authorizationRequired(
              failure(await transport.call(echo, never), 'call'),
            )
            assert.strictEqual(discovery.resourceMetadataUrl, metadataUrlOf(targetOf(peer)))
            assert.strictEqual(discovery.metadata, 'unavailable')
            assert.strictEqual(discovery.resourceMetadata, undefined)
            assert.deepStrictEqual(discovery.issuers, [])
            assert.deepStrictEqual(discovery.scopes, [])
          },
        ),
    ),
    conformanceCase(
      'T4',
      '401 on discover: authorization-required with no legacy fallback; reportRejection once (item 11)',
      async fixture => {
        const credential = countingCredential()
        await withPeer(
          fixture,
          { discover: unauthorized('scope="files:read"'), initialize: LEGACY },
          { kind: 'streamable-http', credential },
          async (peer, transport) => {
            const discovery = authorizationRequired(failure(await transport.discover(), 'discover'))
            assert.deepStrictEqual(discovery.scopes, ['files:read'])
            assert.strictEqual(credential.rejections(), 1)
            assert.deepStrictEqual(requests(await peer.received(), 'initialize'), [])
          },
        )
      },
    ),
    conformanceCase(
      'T4',
      '403 insufficient_scope: authorization-required with the scope of the header; reportRejection once (item 11)',
      async fixture => {
        const credential = countingCredential()
        await withPeer(
          fixture,
          { calls: { echo: forbidden('error="insufficient_scope", scope="files:write"') } },
          { kind: 'streamable-http', credential },
          async (_peer, transport) => {
            const discovery = authorizationRequired(
              failure(await transport.call(echo, never), 'call'),
            )
            assert.deepStrictEqual(discovery.scopes, ['files:write'])
            assert.strictEqual(credential.rejections(), 1)
          },
        )
      },
    ),
    conformanceCase(
      'T4',
      '401 on a request that no handle authorized is still authorization-required',
      async fixture =>
        withPeer(
          fixture,
          { discover: unauthorized('realm="mcp"') },
          { kind: 'streamable-http' },
          async (_peer, transport) => {
            authorizationRequired(failure(await transport.discover(), 'discover'))
          },
        ),
    ),
  ]
}

/** A credential handle whose `authorize` or `reportRejection` fails as the case says. */
function failingCredential(
  fails: 'authorize-rejects' | 'authorize-throws' | 'report-rejects',
): HttpCredentialHandle {
  return {
    purpose: 'http-authorization',
    authorize(headers) {
      if (fails === 'authorize-throws') throw new Error('the handle broke')
      if (fails === 'authorize-rejects') return Promise.reject(new Error('the handle broke'))
      headers.set('authorization', 'Bearer suite-token')
      return Promise.resolve({ ok: true })
    },
    reportRejection() {
      return fails === 'report-rejects'
        ? Promise.reject(new Error('the handle broke'))
        : Promise.resolve()
    },
    async release() {},
  }
}

const t9Cases = (): readonly Case[] => [
  conformanceCase(
    'T9',
    'a credential handle whose authorize rejects or throws: not-sent (connection-unavailable), nothing reaches the peer',
    async fixture => {
      for (const fails of ['authorize-rejects', 'authorize-throws'] as const)
        await withPeer(
          fixture,
          { calls: { echo: result(DONE) }, listing: { '': result({ tools: [] }) } },
          { kind: 'streamable-http', credential: failingCredential(fails) },
          async (peer, transport) => {
            assert.deepStrictEqual(await transport.call(echo, never), {
              failure: { kind: 'not-sent', cause: 'connection-unavailable' },
            })
            assert.deepStrictEqual(await transport.listActions(), {
              failure: { kind: 'not-sent', cause: 'connection-unavailable' },
            })
            const received = await peer.received()
            assert.deepStrictEqual(requests(received, 'tools/call'), [], fails)
            assert.deepStrictEqual(requests(received, 'tools/list'), [], fails)
          },
        )
    },
  ),
  conformanceCase(
    'T9',
    'a credential handle whose reportRejection rejects: the refusal is still authorization-required',
    async fixture =>
      withPeer(
        fixture,
        {
          calls: {
            echo: {
              kind: 'http',
              status: 401,
              headers: { 'www-authenticate': bearer('scope="a"') },
            },
          },
        },
        { kind: 'streamable-http', credential: failingCredential('report-rejects') },
        async (_peer, transport) => {
          const refused = failure(await transport.call(echo, never), 'call')
          assert.ok(
            refused.kind === 'not-sent' && refused.cause === 'authorization-required',
            JSON.stringify(refused),
          )
        },
      ),
  ),
]

const t5Cases = (): readonly Case[] => [
  conformanceCase(
    'T5',
    'stdio: cancelRequest sends notifications/cancelled with the request id and the envelope (item 9)',
    async fixture =>
      withPeer(fixture, { calls: { echo: SILENT } }, { kind: 'stdio' }, async (peer, transport) => {
        const sent = ok(await transport.call(echo, never), 'call')
        await transport.cancelRequest(sent.requestId)
        const received = await peer.received()
        const [cancelled] = notifications(received, 'notifications/cancelled')
        assert.ok(cancelled !== undefined, 'notifications/cancelled was not sent')
        assert.strictEqual(at(cancelled.params, 'requestId'), sent.requestId)
        assertEnvelopes(peer, received)
        assert.deepStrictEqual(
          received.filter(entry => entry.kind === 'stream-aborted'),
          [],
        )
      }),
  ),
  conformanceCase(
    'T5',
    'streamable-http: cancelRequest ends the answer stream and sends no notification (item 9)',
    async fixture =>
      withPeer(
        fixture,
        { calls: { echo: SILENT } },
        { kind: 'streamable-http' },
        async (peer, transport) => {
          const sent = ok(await transport.call(echo, never), 'call')
          await transport.cancelRequest(sent.requestId)
          const received = await peer.received()
          assert.deepStrictEqual(
            received.filter(entry => entry.kind === 'stream-aborted'),
            [{ kind: 'stream-aborted', id: sent.requestId }],
          )
          assert.deepStrictEqual(notifications(received, 'notifications/cancelled'), [])
        },
      ),
  ),
  conformanceCase(
    'T5',
    'streamable-http on a legacy revision: cancelRequest sends notifications/cancelled and does not end the answer stream (item 9)',
    async fixture =>
      withPeer(
        fixture,
        { discover: METHOD_NOT_FOUND, initialize: LEGACY, calls: { echo: SILENT } },
        { kind: 'streamable-http' },
        async (peer, transport) => {
          ok(await transport.discover(), 'discover')
          const sent = ok(await transport.call(echo, never), 'call')
          await transport.cancelRequest(sent.requestId)
          const received = await peer.received()
          const [cancelled] = notifications(received, 'notifications/cancelled')
          assert.ok(cancelled !== undefined, 'notifications/cancelled was not sent')
          assert.strictEqual(at(cancelled.params, 'requestId'), sent.requestId)
          assert.deepStrictEqual(
            received.filter(entry => entry.kind === 'stream-aborted'),
            [],
          )
          assertEnvelopes(peer, received)
        },
      ),
  ),
  conformanceCase(
    'T5',
    'stdio: close() closes stdin, then cancels stdout, and does not stop the process (item 9)',
    async fixture => {
      const kind = 'stdio'
      if (!fixture.kinds.includes(kind)) throw new NotApplicable('stdio material')
      const events: string[] = []
      const peer = await fixture.peer(
        { discover: modern(fixture) },
        { kind, instructionsByteLimit: 4096 },
      )
      try {
        assert.strictEqual(peer.material.kind, kind)
        const material: TransportMaterial =
          peer.material.kind === kind
            ? { ...peer.material, process: observedProcess(peer.material.process, events) }
            : peer.material
        const transport = ok(await peer.factory.open(material, never), 'open')
        ok(await transport.discover(), 'discover')
        await transport.close()
        assert.deepStrictEqual(events, ['stdin-closed', 'stdout-cancelled'])
        await transport.close()
      } finally {
        await peer.close()
      }
    },
  ),
  conformanceCase(
    'T5',
    'a call whose signal fires after it was sent answers no-answer (abandoned)',
    async fixture =>
      withPeer(fixture, { calls: { echo: SILENT } }, {}, async (_peer, transport) => {
        const controller = new AbortController()
        const sent = ok(await transport.call(echo, controller.signal), 'call')
        controller.abort()
        assert.deepStrictEqual(await sent.answer, { kind: 'no-answer', cause: 'abandoned' })
      }),
  ),
  conformanceCase(
    'T5',
    'close() with a call in flight answers it no-answer (abandoned); later requests are not-sent',
    async fixture =>
      withPeer(fixture, { calls: { echo: SILENT } }, {}, async (_peer, transport) => {
        const sent = ok(await transport.call(echo, never), 'call')
        await transport.close()
        assert.deepStrictEqual(await sent.answer, { kind: 'no-answer', cause: 'abandoned' })
        assert.deepStrictEqual(await transport.getTask(taskId('t')), {
          failure: { kind: 'not-sent', cause: 'connection-unavailable' },
        })
      }),
  ),
  conformanceCase(
    'T5',
    'a call still being authorized when close() ran is not-sent and never reaches the peer',
    async fixture => {
      let open = (): void => undefined
      const credential = countingCredential(
        new Promise<void>(resolve => {
          open = resolve
        }),
      )
      await withPeer(
        fixture,
        { calls: { echo: result(DONE) } },
        { kind: 'streamable-http', credential },
        async (peer, transport) => {
          const pending = transport.call(echo, never)
          await transport.close()
          open()
          assert.deepStrictEqual(await pending, {
            failure: { kind: 'not-sent', cause: 'connection-unavailable' },
          })
          assert.deepStrictEqual(requests(await peer.received(), 'tools/call'), [])
        },
      )
    },
  ),
]

const t6Cases = (): readonly Case[] => {
  const hints = { pollIntervalMs: 500, ttlMs: 60000, statusMessage: 'queued' }
  const inputRequests = {
    name: { method: 'elicitation/create', params: { mode: 'form', message: 'name?' } },
  }
  const task = (status: string, extra: Readonly<{ [key: string]: PlainJson }> = {}): PeerReply =>
    result({
      resultType: 'complete',
      taskId: 't1',
      status,
      createdAt: 'c',
      lastUpdatedAt: 'u',
      ...extra,
    })
  return [
    conformanceCase(
      'T6',
      'getTask reads the status, the input requests as untrusted and the hints (item 12)',
      async fixture =>
        withPeer(
          fixture,
          {
            tasks: {
              t1: { get: [task('working', hints), task('input_required', { inputRequests })] },
            },
          },
          {},
          async (_peer, transport) => {
            assert.deepStrictEqual(ok(await transport.getTask(taskId('t1')), 'getTask'), {
              status: 'working',
              pollIntervalMs: 500,
              ttlMs: 60000,
              statusMessage: { untrusted: 'queued' },
            })
            assert.deepStrictEqual(ok(await transport.getTask(taskId('t1')), 'getTask'), {
              status: 'input_required',
              inputRequests: { untrusted: jsonOf(inputRequests) },
            })
          },
        ),
    ),
    conformanceCase(
      'T6',
      'getTask on a completed task reports the status without the result',
      async fixture =>
        withPeer(
          fixture,
          { tasks: { t1: { get: task('completed', { result: DONE }) } } },
          {},
          async (_peer, transport) => {
            assert.deepStrictEqual(ok(await transport.getTask(taskId('t1')), 'getTask'), {
              status: 'completed',
            })
          },
        ),
    ),
    conformanceCase(
      'T6',
      'getTaskResult: completed is the result, failed is the error, cancelled is cancelled, working is not-finished',
      async fixture => {
        const failed = { code: -32603, message: 'rate limited' }
        await withPeer(
          fixture,
          {
            tasks: {
              t1: {
                get: [
                  task('completed', { result: DONE }),
                  task('failed', { error: failed }),
                  task('cancelled'),
                  task('working'),
                  task('input_required', { inputRequests }),
                ],
              },
            },
          },
          {},
          async (_peer, transport) => {
            const id = taskId('t1')
            assert.deepStrictEqual(ok(await transport.getTaskResult(id), 'getTaskResult'), {
              kind: 'finished',
              answer: { kind: 'result', result: jsonOf(DONE) },
            })
            assert.deepStrictEqual(ok(await transport.getTaskResult(id), 'getTaskResult'), {
              kind: 'finished',
              answer: { kind: 'error', error: jsonOf(failed) },
            })
            assert.deepStrictEqual(ok(await transport.getTaskResult(id), 'getTaskResult'), {
              kind: 'cancelled',
            })
            assert.deepStrictEqual(ok(await transport.getTaskResult(id), 'getTaskResult'), {
              kind: 'not-finished',
            })
            assert.deepStrictEqual(ok(await transport.getTaskResult(id), 'getTaskResult'), {
              kind: 'not-finished',
            })
          },
        )
      },
    ),
    conformanceCase(
      'T6',
      'updateTask sends tasks/update with the task id, the input responses and the envelope; the ack is accepted',
      async fixture => {
        const responses = { name: { action: 'accept', content: { input: 'Luca' } } }
        await withPeer(
          fixture,
          { tasks: { t1: { update: result({ resultType: 'complete' }) } } },
          {},
          async (peer, transport) => {
            assert.deepStrictEqual(await transport.updateTask(taskId('t1'), jsonOf(responses)), {
              ok: 'accepted',
            })
            const received = await peer.received()
            const [update] = requests(received, 'tasks/update')
            assert.strictEqual(at(update?.params, 'taskId'), 't1')
            assert.deepStrictEqual(at(update?.params, 'inputResponses'), responses)
            assertEnvelopes(peer, received)
          },
        )
      },
    ),
    conformanceCase(
      'T6',
      'cancelTask sends tasks/cancel with the envelope; the ack is requested; no notifications/cancelled',
      async fixture =>
        withPeer(
          fixture,
          { tasks: { t1: { cancel: result({}) } } },
          {},
          async (peer, transport) => {
            assert.deepStrictEqual(await transport.cancelTask(taskId('t1')), { ok: 'requested' })
            const received = await peer.received()
            assert.strictEqual(at(requests(received, 'tasks/cancel')[0]?.params, 'taskId'), 't1')
            assert.deepStrictEqual(notifications(received, 'notifications/cancelled'), [])
            assertEnvelopes(peer, received)
          },
        ),
    ),
    conformanceCase(
      'T6',
      'a ttl of null is unlimited and left out; a hint of another type is left out (item 12)',
      async fixture =>
        withPeer(
          fixture,
          {
            tasks: {
              t1: {
                get: task('working', { ttlMs: null, pollIntervalMs: 'soon', statusMessage: 7 }),
              },
            },
          },
          {},
          async (_peer, transport) => {
            assert.deepStrictEqual(ok(await transport.getTask(taskId('t1')), 'getTask'), {
              status: 'working',
            })
          },
        ),
    ),
    conformanceCase(
      'T6',
      'a poll interval or ttl that is not a non-negative safe integer is left out (item 12)',
      async fixture =>
        withPeer(
          fixture,
          {
            tasks: {
              t1: {
                get: [
                  task('working', { pollIntervalMs: -5, ttlMs: 1.5 }),
                  task('working', { pollIntervalMs: 2 ** 53, ttlMs: -1 }),
                  task('working', { pollIntervalMs: 0, ttlMs: 2 ** 53 - 1 }),
                ],
              },
            },
          },
          {},
          async (_peer, transport) => {
            assert.deepStrictEqual(ok(await transport.getTask(taskId('t1')), 'getTask'), {
              status: 'working',
            })
            assert.deepStrictEqual(ok(await transport.getTask(taskId('t1')), 'getTask'), {
              status: 'working',
            })
            assert.deepStrictEqual(ok(await transport.getTask(taskId('t1')), 'getTask'), {
              status: 'working',
              pollIntervalMs: 0,
              ttlMs: 2 ** 53 - 1,
            })
          },
        ),
    ),
  ]
}

/**
 * The conformance suite of `McpTransport` and `McpTransportFactory`. Each case names the SPEC
 * clause it checks. The fixture prepares a scripted peer per case; cases that need a material
 * kind the fixture cannot open are not applicable.
 */
export function mcpTransportConformance(): readonly ConformanceCase<TransportFixture>[] {
  return [
    ...tableCases(),
    ...t1Cases(),
    ...t2Cases(),
    ...t3Cases(),
    ...t4Cases(),
    ...t5Cases(),
    ...t6Cases(),
    ...t9Cases(),
  ]
}
