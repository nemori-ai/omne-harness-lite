import assert from 'node:assert/strict'
import type { Outcome } from '@omne-harness/operation-result'
import { isTaskId, type TaskId } from './brands.ts'
import {
  CLIENT_CAPABILITIES_KEY,
  CLIENT_INFO_KEY,
  LOG_LEVEL_KEY,
  PROTOCOL_VERSION_KEY,
  SERVER_INFO_KEY,
  TASKS_EXTENSION,
} from './envelope.ts'
import { boundInstructions } from './instructions.ts'
import type { UnusableCause } from './outcomes.ts'
import type { PlainJson } from './plain.ts'
import type { HttpCredentialHandle } from './ports.ts'
import { LEGACY_PROTOCOL_VERSIONS, isModernProtocolVersion } from './revisions.ts'
import {
  TRANSPORT_TABLE,
  cellsOf,
  type ExpectedFailure,
  type TableCell,
  type TableConclusion,
} from './testing-transport-table.ts'
import {
  ERROR_CLASSES,
  classifyWireEvent,
  type ErrorClass,
  type RequestClass,
  type WireEvent,
} from './wire.ts'
import { conformanceCase, type ConformanceCase } from './testing-case.ts'
import { actionNameOf, jsonOf } from './testing-values.ts'
import type {
  CallRequest,
  McpTransport,
  McpTransportFactory,
  PeerNotification,
  TransportFailure,
  TransportMaterial,
} from './transport.ts'

export type { PlainJson } from './plain.ts'

export type PeerNotificationScript = Readonly<{ method: string; params?: PlainJson }>

export type PeerReply =
  | Readonly<{
      kind: 'result'
      result: PlainJson
      notifications?: readonly PeerNotificationScript[]
      headers?: Readonly<{ [name: string]: string }>
    }>
  | Readonly<{ kind: 'error'; error: PlainJson }>
  | Readonly<{ kind: 'unsent' }>
  | Readonly<{ kind: 'silent' }>
  | Readonly<{ kind: 'stream-breaks' }>
  | Readonly<{
      kind: 'http'
      status: number
      headers?: Readonly<{ [name: string]: string }>
      body?: string
    }>

export type Replies = PeerReply | readonly PeerReply[]

export type TaskScript = Readonly<{ get?: Replies; update?: Replies; cancel?: Replies }>

export type PeerScript = Readonly<{
  discover?: Replies
  initialize?: Replies
  listing?: Readonly<{ [cursor: string]: Replies }>
  calls?: Readonly<{ [tool: string]: Replies }>
  tasks?: Readonly<{ [taskId: string]: TaskScript }>
  peerRequests?: readonly Readonly<{
    method: string
    params?: PlainJson
    at?: 'initialize' | 'initialized'
  }>[]
  notifications?: Replies
  wellKnown?: Readonly<{ [path: string]: PlainJson }>
  /** What `subscriptions/listen` gets; a result ends it after its notifications. */
  listen?: Replies
}>

export type PeerRequestHeaders = Readonly<{
  'mcp-protocol-version'?: string
  'mcp-method'?: string
  'mcp-name'?: string
  'mcp-session-id'?: string
}>

export type PeerReceived =
  | Readonly<{
      kind: 'request'
      id: string
      method: string
      params?: PlainJson
      headers?: PeerRequestHeaders
    }>
  | Readonly<{
      kind: 'notification'
      method: string
      params?: PlainJson
      headers?: PeerRequestHeaders
    }>
  | Readonly<{ kind: 'response'; id: string; result?: PlainJson; error?: PlainJson }>
  | Readonly<{ kind: 'stream-aborted'; id: string }>
  | Readonly<{ kind: 'fetch'; url: string }>

export type PeerNeeds = Readonly<{
  credential?: HttpCredentialHandle
  instructionsByteLimit?: number
}>

export type ScriptedPeer = Readonly<{
  factory: McpTransportFactory
  material: TransportMaterial
  received(): Promise<readonly PeerReceived[]>
  close(): Promise<void>
}>

export type ScriptSource = PeerScript | ((target: string) => PeerScript)

export type TransportFixture = Readonly<{
  protocolVersions: readonly string[]
  peer(script: ScriptSource, needs: PeerNeeds): Promise<ScriptedPeer>
}>

export {
  CLIENT_CAPABILITIES_KEY,
  CLIENT_INFO_KEY,
  LOG_LEVEL_KEY,
  PROTOCOL_VERSION_KEY,
  SERVER_INFO_KEY,
  TASKS_EXTENSION,
} from './envelope.ts'

type Case = ConformanceCase<TransportFixture>
type Body<T> = (peer: ScriptedPeer, transport: McpTransport) => Promise<T>
type Request = Extract<PeerReceived, { kind: 'request' }>

function isRecord(value: PlainJson | undefined): value is Readonly<{ [key: string]: PlainJson }> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function at(
  value: PlainJson | undefined,
  ...path: readonly string[]
): PlainJson | undefined {
  let current = value
  for (const key of path) {
    if (!isRecord(current)) return undefined
    current = current[key]
  }
  return current
}

export function result(
  value: PlainJson,
  notifications?: readonly PeerNotificationScript[],
): PeerReply {
  return notifications === undefined
    ? { kind: 'result', result: value }
    : { kind: 'result', result: value, notifications }
}

function error(code: number, message: string, data?: PlainJson): PeerReply {
  return { kind: 'error', error: data === undefined ? { code, message } : { code, message, data } }
}

function httpError(status: number, code: number, message: string, data?: PlainJson): PeerReply {
  const answer = data === undefined ? { code, message } : { code, message, data }
  return { kind: 'http', status, body: JSON.stringify({ jsonrpc: '2.0', id: null, error: answer }) }
}

export const SILENT: PeerReply = { kind: 'silent' }
export const STREAM_BREAKS: PeerReply = { kind: 'stream-breaks' }
const METHOD_NOT_FOUND = error(-32601, 'Method not found')

export const TOOL = { name: 'echo', inputSchema: { type: 'object' } }
const DONE = { content: [{ type: 'text', text: 'done' }] }
const [OFFERED_LEGACY_VERSION] = LEGACY_PROTOCOL_VERSIONS
const LEGACY = result({ protocolVersion: OFFERED_LEGACY_VERSION, capabilities: {} })

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

export const never: AbortSignal = new AbortController().signal

function withModernDiscover(fixture: TransportFixture, script: ScriptSource): ScriptSource {
  if (typeof script === 'function')
    return target => ({ discover: modern(fixture), ...script(target) })
  return { discover: modern(fixture), ...script }
}

export async function withPeer<T>(
  fixture: TransportFixture,
  script: ScriptSource,
  needs: Partial<PeerNeeds>,
  body: Body<T>,
): Promise<T> {
  assert.ok(
    fixture.protocolVersions.every(isModernProtocolVersion),
    'the fixture lists a legacy version; legacy versions are LEGACY_PROTOCOL_VERSIONS',
  )
  const peer = await fixture.peer(withModernDiscover(fixture, script), {
    ...needs,
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

export function requests(received: readonly PeerReceived[], method: string): readonly Request[] {
  return received.flatMap(entry =>
    entry.kind === 'request' && entry.method === method ? [entry] : [],
  )
}

function notifications(received: readonly PeerReceived[], method: string) {
  return received.flatMap(entry =>
    entry.kind === 'notification' && entry.method === method ? [entry] : [],
  )
}

function methods(received: readonly PeerReceived[]): readonly string[] {
  return received.flatMap(entry =>
    entry.kind === 'request' || entry.kind === 'notification' ? [entry.method] : [],
  )
}

export function ok<T>(outcome: Outcome<T, TransportFailure>, what: string): T {
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

function lastIndexOf(received: readonly PeerReceived[], method: string): number {
  return received.findLastIndex(entry => entry.kind === 'request' && entry.method === method)
}

function mcpNameOf(entry: Request): PlainJson | undefined {
  if (entry.method === 'tools/call') return at(entry.params, 'name')
  if (['tasks/get', 'tasks/update', 'tasks/cancel'].includes(entry.method))
    return at(entry.params, 'taskId')
  return undefined
}

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
    assert.deepStrictEqual(
      {
        'mcp-protocol-version': entry.headers?.['mcp-protocol-version'],
        'mcp-method': entry.headers?.['mcp-method'],
        'mcp-name': entry.headers?.['mcp-name'],
      },
      {
        'mcp-protocol-version': version,
        'mcp-method': entry.method,
        'mcp-name': entry.kind === 'request' ? mcpNameOf(entry) : undefined,
      },
      `${entry.method}: the MCP headers`,
    )
  }
  assert.deepStrictEqual(requests(received, 'logging/setLevel'), [], 'logging/setLevel was sent')
  assert.deepStrictEqual(
    requests(received, 'subscriptions/listen'),
    [],
    'subscriptions/listen was sent',
  )
}

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

function heldCredential(): HttpCredentialHandle & Readonly<{ reached: Promise<void> }> {
  let asked = (): void => undefined
  const reached = new Promise<void>(resolve => {
    asked = resolve
  })
  return {
    purpose: 'http-authorization',
    authorize() {
      asked()
      return new Promise(() => undefined)
    },
    async reportRejection() {},
    async release() {},
    reached,
  }
}

const bearer = (parameters: string) => `Bearer ${parameters}`
const METADATA_PATH = '/.well-known/oauth-protected-resource'

function pathOf(target: string): string {
  return new URL(target).pathname.replace(/\/$/u, '')
}

function metadataUrlOf(target: string): string {
  return new URL(`${METADATA_PATH}${pathOf(target)}`, target).href
}

function targetOf(peer: ScriptedPeer): string {
  return peer.material.target
}

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
      return [
        { message: 'no code' },
        { code: 1.5, message: 'fraction' },
        { code: -32603 },
        { code: -32603, message: 7 },
        'not an object',
      ]
    default: {
      const exhaustive: never = code
      return exhaustive
    }
  }
}

function resultValues(
  request: RequestClass,
  answer: string,
  fixture: TransportFixture,
): readonly PlainJson[] {
  const versions = [...fixture.protocolVersions]
  switch (`${request}|${answer}`) {
    case 'discover|result':
    case 'discover-retry|result':
      return [
        { supportedVersions: versions, capabilities: { tools: {} } },
        { supportedVersions: [...versions].reverse(), capabilities: { tools: {} } },
      ]
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
        { taskId: 't1', status: 'working' },
        { taskId: 't1', status: 'input_required', inputRequests: {} },
        { taskId: 't1', status: 'completed', result: DONE },
        { taskId: 't1', status: 'failed', error: { code: -32603, message: 'failed' } },
        { taskId: 't1', status: 'cancelled' },
      ]
    case 'tasks/get|result:status-unknown':
      return [
        { taskId: 't1', status: 'paused' },
        { taskId: 't1' },
        { status: 'working' },
        { taskId: '', status: 'working' },
        [1],
      ]
    case 'tasks/get|result:input-requests-missing':
      return [
        { taskId: 't1', status: 'input_required' },
        { taskId: 't1', status: 'input_required', inputRequests: 'x' },
      ]
    case 'tasks/get|result:result-missing':
      return [{ taskId: 't1', status: 'completed' }]
    case 'tasks/get|result:error-missing':
      return [
        { taskId: 't1', status: 'failed' },
        { taskId: 't1', status: 'failed', error: 'not an object' },
      ]
    case 'tasks/update|result':
    case 'tasks/cancel|result':
      return [{}, { resultType: 'complete' }]
    default:
      throw new TypeError(`no result sample for ${request} and ${answer}`)
  }
}

const HTTP_ANSWER = /^http:(\w+)\+(.+)$/u

const STATUSES_OF: Readonly<{ [statusClass: string]: readonly number[] }> = {
  '4xx': [418, 302],
  '5xx': [500, 503],
}

function isErrorClass(text: string): text is ErrorClass {
  return ERROR_CLASSES.some(code => code === text)
}

function repliesOf(cell: TableCell, fixture: TransportFixture): readonly PeerReply[] {
  const { request, answer } = cell
  if (answer === 'unsent') return [{ kind: 'unsent' }]
  if (answer === 'stream-broken') return [STREAM_BREAKS]
  if (answer === 'silent') return [SILENT]
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
    const statusClass = http[1] ?? ''
    const statuses = STATUSES_OF[statusClass] ?? [Number(statusClass)]
    const body = http[2] ?? ''
    if (body === 'plain')
      return statuses.flatMap((status): readonly PeerReply[] => [
        { kind: 'http', status, body: `HTTP ${status}` },
        { kind: 'http', status, body: '{"error":{"code":-32602,"message":"x"}}' },
        {
          kind: 'http',
          status,
          body: '{"jsonrpc":"2.0","id":null,"result":{},"error":{"code":-32602,"message":"x"}}',
        },
      ])
    assert.ok(isErrorClass(body), `unknown body class ${body}`)
    return statuses.flatMap(status =>
      errorObjects(body, fixture).map((object): PeerReply => ({
        kind: 'http',
        status,
        body: JSON.stringify({ jsonrpc: '2.0', id: null, error: object }),
      })),
    )
  }
  if (answer.startsWith('error:')) {
    const code = answer.slice('error:'.length)
    assert.ok(isErrorClass(code), `unknown error class ${code}`)
    return errorObjects(code, fixture).map(object => ({ kind: 'error', error: object }))
  }
  return resultValues(request, answer, fixture).map(value => result(value))
}

function eventOf(reply: PeerReply): WireEvent {
  const message = (member: Readonly<{ [key: string]: PlainJson }>): WireEvent => {
    const text = JSON.stringify({ jsonrpc: '2.0', id: 'x', ...member })
    return { kind: 'http-stream', messages: [text], ended: true }
  }
  switch (reply.kind) {
    case 'result':
      return message({ result: reply.result })
    case 'error':
      return message({ error: reply.error })
    case 'unsent':
      return { kind: 'unsent' }
    case 'silent':
      return { kind: 'nothing' }
    case 'stream-breaks':
      return { kind: 'http-aborted' }
    case 'http': {
      if (reply.status >= 200 && reply.status < 300)
        return {
          kind: 'http-stream',
          messages: reply.body === undefined ? [] : [reply.body],
          ended: true,
        }
      const headers = Object.fromEntries(
        Object.entries(reply.headers ?? {}).map(([name, value]) => [name.toLowerCase(), value]),
      )
      return { kind: 'http-status', status: reply.status, headers, body: reply.body ?? '' }
    }
    default: {
      const exhaustive: never = reply
      return exhaustive
    }
  }
}

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

function unusableCauseOf(conclusion: TableConclusion): UnusableCause | undefined {
  if (conclusion.unusable !== true) return undefined
  const cause = lineEndOf(conclusion)
  if (cause === undefined)
    throw new TypeError(`a row that ends the transport concludes ${JSON.stringify(conclusion)}`)
  return cause
}

function lineEndOf(conclusion: TableConclusion): UnusableCause | undefined {
  switch (conclusion.kind) {
    case 'answer':
      return gone(conclusion.answer)
    case 'failure': {
      const failure = conclusion.failure
      if (failure.kind === 'no-answer') return gone(failure.cause)
      if (failure.kind !== 'not-sent') return undefined
      if (failure.cause === 'credential-rejected') return 'credential-rejected'
      return failure.cause === 'session-ended' ? 'session-ended' : undefined
    }
    default:
      return undefined
  }
}

function gone(cause: string): UnusableCause | undefined {
  return cause === 'stream-broken' ? cause : undefined
}

function refusedAfter(conclusion: TableConclusion): TransportFailure {
  const unusable = unusableCauseOf(conclusion)
  return unusable === undefined
    ? NOT_SENT_FAILURE
    : { kind: 'not-sent', cause: 'connection-unavailable', unusable }
}

function assertFailure(
  actual: TransportFailure,
  expected: ExpectedFailure,
  reply: PeerReply,
  unusable?: UnusableCause,
): void {
  assert.deepStrictEqual(actual, failureOf(expected, reply, unusable))
}

function failureOf(
  expected: ExpectedFailure,
  reply: PeerReply,
  unusable?: UnusableCause,
): TransportFailure {
  if (expected.kind === 'not-sent' && expected.cause === 'credential-rejected')
    return { kind: 'not-sent', cause: 'connection-unavailable', unusable: 'credential-rejected' }
  if (expected.kind === 'no-answer')
    return unusable === undefined ? expected : { ...expected, unusable }
  if (expected.kind === 'not-sent') {
    if (unusable === undefined) return expected
    return expected.cause === 'session-ended'
      ? { kind: 'not-sent', cause: 'session-ended', unusable: 'session-ended' }
      : { kind: 'not-sent', cause: expected.cause, unusable }
  }
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

export async function untilSent(peer: ScriptedPeer, method: string): Promise<void> {
  for (let round = 0; round < 500; round += 1) {
    if (requests(await peer.received(), method).length > 0) return
    await new Promise(resolve => setTimeout(resolve, 2))
  }
  assert.fail(`${method} was never sent`)
}

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
        ok: result({ taskId: 't1', status: 'working' }),
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

const SESSION_SCRIPT: PeerScript = {
  discover: METHOD_NOT_FOUND,
  initialize: {
    kind: 'result',
    result: { protocolVersion: OFFERED_LEGACY_VERSION, capabilities: {} },
    headers: { 'mcp-session-id': SESSION },
  },
}

async function checkCell(
  fixture: TransportFixture,
  cell: TableCell,
  reply: PeerReply,
  conclusion: TableConclusion,
): Promise<void> {
  const run = async (
    script: PeerScript,
    body: (peer: ScriptedPeer, transport: McpTransport) => Promise<void>,
  ) => {
    const credential = countingCredential()
    await withPeer(fixture, script, { credential }, body)
    assert.strictEqual(
      credential.rejections(),
      conclusion.rejection === true ? 1 : 0,
      'reportRejection was not called as the row says',
    )
  }
  const afterwards = async (transport: McpTransport) => {
    if (conclusion.unusable === true)
      assert.deepStrictEqual(await transport.listActions(), { failure: refusedAfter(conclusion) })
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
          ok(await transport.listActions(), 'listActions')
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
  const sent = before.length + (reply.kind === 'unsent' ? 0 : 1)
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
        assertFailure(
          failure(await pending, 'discover'),
          conclusion.failure,
          reply,
          unusableCauseOf(conclusion),
        )
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
    assertFailure(
      failure(outcome, 'discover'),
      conclusion.failure,
      reply,
      unusableCauseOf(conclusion),
    )
    assert.deepStrictEqual(initialized, [])
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
        assertFailure(
          failure(outcome, 'call'),
          conclusion.failure,
          reply,
          unusableCauseOf(conclusion),
        )
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
        else {
          const unusable = unusableCauseOf(conclusion)
          assert.deepStrictEqual(
            answer,
            unusable === undefined
              ? { kind: 'no-answer', cause: conclusion.answer }
              : { kind: 'no-answer', cause: conclusion.answer, unusable },
          )
        }
      }
      const received = await peer.received()
      const left = reply.kind === 'unsent' ? 0 : 1
      assert.strictEqual(requests(received, 'tools/call').length, left, 'tools/call was sent again')
      if (session) assertSession(received, 'tools/call')
      await afterwards(transport)
    },
  )
}

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
        assertFailure(
          failure(await pending, drive.method),
          conclusion.failure,
          reply,
          unusableCauseOf(conclusion),
        )
        const left = reply.kind === 'unsent' ? 0 : 1
        assert.strictEqual(await count(peer), left, `${drive.method} was sent again`)
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

export function tableCases(): readonly Case[] {
  return TRANSPORT_TABLE.map(row =>
    conformanceCase(
      'T8',
      `[${row.id}] ${listed(row.requests)} × ${listed(row.answers)} → ${conclusionText(row.conclusion)}`,
      async fixture => {
        for (const cell of cellsOf(row))
          for (const reply of repliesOf(cell, fixture))
            try {
              const classified = classifyWireEvent(eventOf(reply), {
                id: 'x',
                request: cell.request,
                session: cell.answer === 'http:404+session',
                versions: fixture.protocolVersions,
              })
              assert.strictEqual(
                classified.kind === 'answer' ? classified.answer : classified.kind,
                cell.answer,
                'classifyWireEvent puts the sample into another class',
              )
              await checkCell(fixture, cell, reply, row.conclusion)
            } catch (error) {
              if (error instanceof assert.AssertionError)
                error.message = `${cell.request} ${cell.answer}: ${error.message}`
              throw error
            }
      },
    ),
  )
}

export const t1Cases = (): readonly Case[] => [
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
  conformanceCase(
    'T1',
    'Streamable HTTP: close() after the session ended (S07): the call still in flight and a later request carry no unusable',
    async fixture =>
      withPeer(
        fixture,
        {
          ...SESSION_SCRIPT,
          calls: { echo: SILENT },
          listing: { '': { kind: 'http', status: 404 } },
        },
        {},
        async (peer, transport) => {
          ok(await transport.discover(), 'discover')
          const sent = ok(await transport.call(echo, never), 'call')
          await untilSent(peer, 'tools/call')
          assert.deepStrictEqual(await transport.listActions(), {
            failure: { kind: 'not-sent', cause: 'session-ended', unusable: 'session-ended' },
          })
          await transport.close()
          assert.deepStrictEqual(await sent.answer, { kind: 'no-answer', cause: 'abandoned' })
          assert.deepStrictEqual(await transport.getTask(taskId('t')), {
            failure: { kind: 'not-sent', cause: 'connection-unavailable' },
          })
        },
      ),
  ),
  conformanceCase(
    'T1',
    'Streamable HTTP: a call stopped after the session ended (S07), before close(): abandoned, carrying session-ended',
    async fixture =>
      withPeer(
        fixture,
        {
          ...SESSION_SCRIPT,
          calls: { echo: SILENT },
          listing: { '': { kind: 'http', status: 404 } },
        },
        {},
        async (peer, transport) => {
          ok(await transport.discover(), 'discover')
          const controller = new AbortController()
          const sent = ok(await transport.call(echo, controller.signal), 'call')
          await untilSent(peer, 'tools/call')
          assert.deepStrictEqual(await transport.listActions(), {
            failure: { kind: 'not-sent', cause: 'session-ended', unusable: 'session-ended' },
          })
          controller.abort()
          assert.deepStrictEqual(await sent.answer, {
            kind: 'no-answer',
            cause: 'abandoned',
            unusable: 'session-ended',
          })
          await transport.close()
        },
      ),
  ),
]

export const t2Cases = (): readonly Case[] => [
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
    'listActions: the page carries the tools, the next cursor and the ttl as written; a ttl that is not a non-negative safe integer is left out',
    async fixture =>
      withPeer(
        fixture,
        {
          listing: {
            '': result({ tools: [TOOL], nextCursor: 'p2', ttlMs: 30 }),
            p2: result({ tools: [{ name: 'other', inputSchema: { type: 'object' } }] }),
            p3: result({ tools: [], ttlMs: -1 }),
            p4: result({ tools: [], ttlMs: 1.5 }),
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
          for (const cursor of ['p3', 'p4'])
            assert.strictEqual(
              ok(await transport.listActions(cursor), 'listActions').ttlMs,
              undefined,
            )
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
      const numeric = {
        name: 'numeric',
        inputSchema: {
          type: 'object',
          properties: { n: { type: 'number', 'x-mcp-header': 'X-N' } },
        },
      }
      const counted = {
        name: 'counted',
        inputSchema: {
          type: 'object',
          properties: { n: { type: 'integer', 'x-mcp-header': 'X-N' } },
        },
      }
      await withPeer(
        fixture,
        { listing: { '': result({ tools: [bad, good, numeric, counted] }) } },
        {},
        async (_peer, transport) => {
          const page = ok(await transport.listActions(), 'listActions')
          assert.deepStrictEqual(page.tools, [jsonOf(good), jsonOf(counted)])
          assert.deepStrictEqual(page.withheld, [
            { name: { untrusted: 'bad' }, reason: 'header-invalid' },
            { name: { untrusted: 'numeric' }, reason: 'header-invalid' },
          ])
        },
      )
    },
  ),
  conformanceCase(
    'T2',
    'streamable-http on a legacy revision: x-mcp-header is not checked (item 8)',
    async fixture => {
      const bad = {
        name: 'bad',
        inputSchema: {
          type: 'object',
          properties: { q: { type: 'string', 'x-mcp-header': 'not a token' } },
        },
      }
      await withPeer(
        fixture,
        {
          discover: METHOD_NOT_FOUND,
          initialize: LEGACY,
          listing: { '': result({ tools: [bad] }) },
        },
        {},
        async (_peer, transport) => {
          ok(await transport.discover(), 'discover')
          const page = ok(await transport.listActions(), 'listActions')
          assert.deepStrictEqual(page.tools, [jsonOf(bad)])
          assert.strictEqual(page.withheld, undefined)
        },
      )
    },
  ),
]

export const t3Cases = (): readonly Case[] => [
  conformanceCase(
    'T3',
    'every request and notification carries the three _meta keys and the fixed capabilities (item 7)',
    async fixture =>
      withPeer(
        fixture,
        {
          calls: { echo: result(DONE) },
          listing: { '': result({ tools: [] }) },
          tasks: { t1: { get: result({ taskId: 't1', status: 'working' }) } },
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
          tasks: { t1: { get: result({ taskId: 't1', status: 'working' }) } },
        },
        {},
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
    'streamable-http: on the legacy path each later request and notification carries the negotiated version in _meta and MCP-Protocol-Version, and the session id (item 7)',
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
        {},
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
          const [initialized] = notifications(received, 'notifications/initialized')
          assert.strictEqual(initialized?.headers?.['mcp-session-id'], 'session-1')
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
          tasks: { t1: { get: result({ taskId: 't1', status: 'working' }) } },
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

export const t4Cases = (): readonly Case[] => {
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
      '401: not-sent authorization-required from WWW-Authenticate and the named metadata (item 11)',
      async fixture =>
        withPeer(
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
          {},
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
          },
        ),
    ),
    conformanceCase(
      'T4',
      '401 on listActions without resource_metadata: the well-known URL with the path is tried before the root (item 11)',
      async fixture =>
        withPeer(
          fixture,
          target => ({
            listing: { '': unauthorized('realm="mcp"') },
            wellKnown: { [METADATA_PATH]: metadata(target, 'https://root.test') },
          }),
          {},
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
          },
        ),
    ),
    conformanceCase(
      'T4',
      '401 with no metadata anywhere: metadata unavailable, issuers empty, scopes from the header (item 11)',
      async fixture =>
        withPeer(
          fixture,
          { calls: { echo: unauthorized('scope="a b"') } },
          {},
          async (_peer, transport) => {
            const discovery = authorizationRequired(
              failure(await transport.call(echo, never), 'call'),
            )
            assert.strictEqual(discovery.metadata, 'unavailable')
            assert.strictEqual(discovery.resourceMetadata, undefined)
            assert.strictEqual(new URL(discovery.resourceMetadataUrl).pathname, METADATA_PATH)
            assert.deepStrictEqual(discovery.issuers, [])
            assert.deepStrictEqual(discovery.scopes, ['a', 'b'])
          },
        ),
    ),
    conformanceCase(
      'T4',
      '401: a named resource_metadata that is not a JSON object counts as unavailable (item 11)',
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
          {},
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
      '401 on discover: authorization-required with no legacy fallback (item 11)',
      async fixture =>
        withPeer(
          fixture,
          { discover: unauthorized('scope="files:read"'), initialize: LEGACY },
          {},
          async (peer, transport) => {
            const discovery = authorizationRequired(failure(await transport.discover(), 'discover'))
            assert.deepStrictEqual(discovery.scopes, ['files:read'])
            assert.deepStrictEqual(requests(await peer.received(), 'initialize'), [])
          },
        ),
    ),
    conformanceCase(
      'T4',
      '403 insufficient_scope: authorization-required with the scope of the header (item 11)',
      async fixture =>
        withPeer(
          fixture,
          { calls: { echo: forbidden('error="insufficient_scope", scope="files:write"') } },
          {},
          async (_peer, transport) => {
            const discovery = authorizationRequired(
              failure(await transport.call(echo, never), 'call'),
            )
            assert.deepStrictEqual(discovery.scopes, ['files:write'])
          },
        ),
    ),
    conformanceCase(
      'T4',
      'a 401 or a scoped 403 to a request a static credential authorized: credential-rejected, reported once, no metadata fetched, the transport not usable afterwards (C101)',
      async fixture => {
        const rejected = { failure: { ...NOT_SENT_FAILURE, unusable: 'credential-rejected' } }
        for (const [send, script] of [
          [
            (t: McpTransport) => t.call(echo, never),
            { calls: { echo: unauthorized('realm="m"') } },
          ],
          [
            (t: McpTransport) => t.listActions(),
            { listing: { '': forbidden('error="insufficient_scope"') } },
          ],
          [
            (t: McpTransport) => t.discover(),
            { discover: unauthorized('scope="r"'), initialize: LEGACY },
          ],
        ] as const) {
          const credential = countingCredential()
          await withPeer(fixture, script, { credential }, async (peer, transport) => {
            assert.deepStrictEqual(await send(transport), rejected)
            assert.deepStrictEqual(await transport.listActions(), rejected)
            assert.strictEqual(credential.rejections(), 1)
            assert.ok(!(await peer.received()).some(entry => entry.kind === 'fetch'))
          })
        }
      },
    ),
  ]
}

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

export const t9Cases = (): readonly Case[] => [
  conformanceCase(
    'T9',
    'a credential handle whose authorize rejects or throws: not-sent (connection-unavailable), nothing reaches the peer',
    async fixture => {
      for (const fails of ['authorize-rejects', 'authorize-throws'] as const)
        await withPeer(
          fixture,
          { calls: { echo: result(DONE) }, listing: { '': result({ tools: [] }) } },
          { credential: failingCredential(fails) },
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
    'a credential handle whose reportRejection rejects: the refusal is still credential-rejected',
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
        { credential: failingCredential('report-rejects') },
        async (_peer, transport) => {
          assert.deepStrictEqual(failure(await transport.call(echo, never), 'call'), {
            kind: 'not-sent',
            cause: 'connection-unavailable',
            unusable: 'credential-rejected',
          })
        },
      ),
  ),
]

export const t5Cases = (): readonly Case[] => [
  conformanceCase(
    'T5',
    'streamable-http: cancelRequest ends the answer stream, answer settles no-answer (abandoned), and no notification is sent (item 9)',
    async fixture =>
      withPeer(fixture, { calls: { echo: SILENT } }, {}, async (peer, transport) => {
        const sent = ok(await transport.call(echo, never), 'call')
        await transport.cancelRequest(sent.requestId)
        assert.deepStrictEqual(await sent.answer, { kind: 'no-answer', cause: 'abandoned' })
        const received = await peer.received()
        assert.deepStrictEqual(
          received.filter(entry => entry.kind === 'stream-aborted'),
          [{ kind: 'stream-aborted', id: sent.requestId }],
        )
        assert.deepStrictEqual(notifications(received, 'notifications/cancelled'), [])
      }),
  ),
  conformanceCase(
    'T5',
    'streamable-http on a legacy revision: cancelRequest sends notifications/cancelled and does not end the answer stream (item 9)',
    async fixture =>
      withPeer(
        fixture,
        { discover: METHOD_NOT_FOUND, initialize: LEGACY, calls: { echo: SILENT } },
        {},
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
    'a call still being authorized when close() ran is not-sent and never reaches the peer; close() does not wait for the handle',
    async fixture => {
      const handle = heldCredential()
      await withPeer(
        fixture,
        { calls: { echo: result(DONE) } },
        { credential: handle },
        async (peer, transport) => {
          const pending = transport.call(echo, never)
          await Promise.race([handle.reached, pending])
          await transport.close()
          assert.deepStrictEqual(await pending, {
            failure: { kind: 'not-sent', cause: 'connection-unavailable' },
          })
          assert.deepStrictEqual(requests(await peer.received(), 'tools/call'), [])
        },
      )
    },
  ),
  conformanceCase(
    'T5',
    'a call still being authorized when its signal fires is not-sent and never reaches the peer; call() does not wait for the handle',
    async fixture => {
      const handle = heldCredential()
      await withPeer(
        fixture,
        { calls: { echo: result(DONE) } },
        { credential: handle },
        async (peer, transport) => {
          const controller = new AbortController()
          const pending = transport.call(echo, controller.signal)
          await Promise.race([handle.reached, pending])
          controller.abort()
          assert.deepStrictEqual(await pending, {
            failure: { kind: 'not-sent', cause: 'connection-unavailable' },
          })
          assert.deepStrictEqual(requests(await peer.received(), 'tools/call'), [])
        },
      )
    },
  ),
]

export const t6Cases = (): readonly Case[] => {
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
