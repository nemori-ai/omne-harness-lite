// The conformance suite of `McpTransport` and `McpTransportFactory` (SPEC T1–T7), and the fixture
// it drives. A fixture gives the suite a peer that answers as a `PeerScript` says, at the JSON-RPC
// level, and a transport factory with the material to reach it. The script describes the peer,
// never an SDK: the in-memory scripted transport and a real server fixture read the same script.
import assert from 'node:assert/strict'
import type { Outcome } from '@omne-harness/operation-result'
import { isTaskId, type TaskId } from './brands.ts'
import { boundInstructions } from './instructions.ts'
import type { AnswerMalformed } from './outcomes.ts'
import type { HttpCredentialHandle, ProcessHandle } from './ports.ts'
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

/** A notification the peer sends before it answers a request. A progress token is filled in. */
export type PeerNotificationScript = Readonly<{ method: string; params?: PlainJson }>

/**
 * How the peer answers one request. `result` and `error` are JSON-RPC answers as written.
 * `silent` never answers. `stream-breaks` breaks the answer stream (on stdio: the pipe) before
 * an answer. `process-exits` ends the stdio process before an answer. `http` answers at the HTTP
 * level, on Streamable HTTP only.
 */
export type PeerReply =
  | Readonly<{
      kind: 'result'
      result: PlainJson
      notifications?: readonly PeerNotificationScript[]
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
  /** Requests the peer sends to the client after `notifications/initialized` (legacy peers). */
  peerRequests?: readonly Readonly<{ method: string; params?: PlainJson }>[]
  /** Protected resource metadata by well-known path, for example `/.well-known/oauth-protected-resource`. */
  wellKnown?: Readonly<{ [path: string]: PlainJson }>
}>

/** What the peer saw: each request and notification as sent, and what the client did to it. */
export type PeerReceived =
  | Readonly<{ kind: 'request'; id: string; method: string; params?: PlainJson }>
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

/** A peer the fixture prepared, with the factory and the material to reach it. */
export type ScriptedPeer = Readonly<{
  factory: McpTransportFactory
  material: TransportMaterial
  received(): readonly PeerReceived[]
  close(): Promise<void>
}>

/**
 * The fixture of the transport suite. `kinds` lists the material kinds it can open; a case that
 * needs another kind is not applicable. `protocolVersions` lists the versions the transport
 * speaks, highest first. `peer` prepares a peer that answers as the script says; it throws
 * `NotApplicable` for a script it cannot realize, for example one with `peerRequests`.
 */
export type TransportFixture = Readonly<{
  kinds: readonly TransportKind[]
  protocolVersions: readonly string[]
  peer(script: PeerScript, needs: PeerNeeds): Promise<ScriptedPeer>
}>

export const PROTOCOL_VERSION_KEY = 'io.modelcontextprotocol/protocolVersion'
export const CLIENT_CAPABILITIES_KEY = 'io.modelcontextprotocol/clientCapabilities'
export const CLIENT_INFO_KEY = 'io.modelcontextprotocol/clientInfo'
export const SERVER_INFO_KEY = 'io.modelcontextprotocol/serverInfo'
export const LOG_LEVEL_KEY = 'io.modelcontextprotocol/logLevel'
export const TASKS_EXTENSION = 'io.modelcontextprotocol/tasks'

type Case = ConformanceCase<TransportFixture>
type Body<T> = (peer: ScriptedPeer, transport: McpTransport) => Promise<T>

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

const SILENT: PeerReply = { kind: 'silent' }
const STREAM_BREAKS: PeerReply = { kind: 'stream-breaks' }
const PROCESS_EXITS: PeerReply = { kind: 'process-exits' }
const METHOD_NOT_FOUND = error(-32601, 'Method not found')
const TASK_NOT_FOUND = error(-32602, 'Task not found')

const TOOL = { name: 'echo', inputSchema: { type: 'object' } }
const DONE = { content: [{ type: 'text', text: 'done' }] }

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

/** Opens a transport to a scripted peer, runs the body, and closes both. */
async function withPeer<T>(
  fixture: TransportFixture,
  script: PeerScript,
  needs: Partial<PeerNeeds>,
  body: Body<T>,
): Promise<T> {
  const kind = needs.kind ?? fixture.kinds[0]
  assert.ok(kind !== undefined, 'the fixture names no material kind')
  if (!fixture.kinds.includes(kind)) throw new NotApplicable(`${kind} material`)
  const peer = await fixture.peer(
    { discover: modern(fixture), ...script },
    { ...needs, kind, instructionsByteLimit: needs.instructionsByteLimit ?? 4096 },
  )
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

function requests(peer: ScriptedPeer, method: string) {
  return peer
    .received()
    .flatMap(entry => (entry.kind === 'request' && entry.method === method ? [entry] : []))
}

function notifications(peer: ScriptedPeer, method: string) {
  return peer
    .received()
    .flatMap(entry => (entry.kind === 'notification' && entry.method === method ? [entry] : []))
}

function ok<T>(outcome: Outcome<T, TransportFailure>, what: string): T {
  assert.ok('ok' in outcome, `${what} failed: ${JSON.stringify(outcome)}`)
  return outcome.ok
}

function failure<T>(outcome: Outcome<T, TransportFailure>, what: string): TransportFailure {
  assert.ok('failure' in outcome, `${what} did not fail: ${JSON.stringify(outcome)}`)
  return outcome.failure
}

function malformed(what: AnswerMalformed['what']): TransportFailure {
  return { kind: 'answer-malformed', what }
}

/** Every request and notification carries the envelope, and the capabilities say what T3 says. */
function assertEnvelopes(peer: ScriptedPeer): void {
  const sent = peer
    .received()
    .filter(entry => entry.kind === 'request' || entry.kind === 'notification')
  assert.ok(sent.length > 0, 'the peer received nothing')
  for (const entry of sent) {
    const meta = at(entry.params, '_meta')
    assert.ok(isRecord(meta), `${entry.method} carries no _meta`)
    assert.strictEqual(
      typeof meta[PROTOCOL_VERSION_KEY],
      'string',
      `${entry.method}: no protocol version`,
    )
    assert.ok(isRecord(meta[CLIENT_INFO_KEY]), `${entry.method}: no clientInfo`)
    const capabilities = meta[CLIENT_CAPABILITIES_KEY]
    assert.ok(isRecord(capabilities), `${entry.method}: no clientCapabilities`)
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
    assert.strictEqual(meta[LOG_LEVEL_KEY], undefined, `${entry.method}: logLevel set`)
  }
  assert.deepStrictEqual(requests(peer, 'logging/setLevel'), [], 'logging/setLevel was sent')
  assert.deepStrictEqual(
    requests(peer, 'subscriptions/listen'),
    [],
    'subscriptions/listen was sent',
  )
}

function versionOf(entry: Extract<PeerReceived, { kind: 'request' }>): PlainJson | undefined {
  return at(entry.params, '_meta', PROTOCOL_VERSION_KEY)
}

/** A credential handle that counts rejections and authorizes with a fixed header. */
function countingCredential(): HttpCredentialHandle & Readonly<{ rejections(): number }> {
  let rejections = 0
  return {
    purpose: 'http-authorization',
    async authorize(headers) {
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

/** A process handle whose streams and stop calls are observed. */
function observedProcess(process: ProcessHandle, events: string[]): ProcessHandle {
  return {
    stdin: new WritableStream<Uint8Array>({
      close() {
        events.push('stdin-closed')
      },
    }),
    stdout: new ReadableStream<Uint8Array>({
      cancel() {
        events.push('stdout-cancelled')
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
        const [request] = requests(peer, 'tools/call')
        assert.ok(request !== undefined, 'tools/call was not sent')
        assert.strictEqual(request.id, sent.requestId)
        assert.strictEqual(at(request.params, 'name'), 'echo')
        assert.deepStrictEqual(at(request.params, 'arguments'), {})
      }),
  ),
  conformanceCase(
    'T1',
    'call: a JSON-RPC error comes through answer as error, as written',
    async fixture =>
      withPeer(
        fixture,
        { calls: { echo: error(-32602, 'bad arguments', { field: 'city' }) } },
        {},
        async (_peer, transport) => {
          const sent = ok(await transport.call(echo, never), 'call')
          assert.deepStrictEqual(await sent.answer, {
            kind: 'error',
            error: jsonOf({ code: -32602, message: 'bad arguments', data: { field: 'city' } }),
          })
        },
      ),
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
        assert.deepStrictEqual(requests(peer, 'tools/call'), [])
      }),
  ),
  conformanceCase(
    'T1',
    'listActions: a JSON-RPC error is error-answer with code, message and data',
    async fixture =>
      withPeer(
        fixture,
        { listing: { '': error(-32603, 'listing broke', { retry: false }) } },
        {},
        async (_peer, transport) => {
          assert.deepStrictEqual(failure(await transport.listActions(), 'listActions'), {
            kind: 'error-answer',
            code: -32603,
            message: 'listing broke',
            data: jsonOf({ retry: false }),
          })
        },
      ),
  ),
  conformanceCase(
    'T1',
    'stdio: a broken stream leaves a sent call with no-answer (stream-broken)',
    async fixture =>
      withPeer(
        fixture,
        { calls: { echo: STREAM_BREAKS } },
        { kind: 'stdio' },
        async (_peer, transport) => {
          const sent = ok(await transport.call(echo, never), 'call')
          assert.deepStrictEqual(await sent.answer, { kind: 'no-answer', cause: 'stream-broken' })
          assert.deepStrictEqual(await transport.listActions(), {
            failure: { kind: 'not-sent', cause: 'connection-unavailable' },
          })
        },
      ),
  ),
  conformanceCase(
    'T1',
    'stdio: a process that exits leaves a sent call with no-answer (process-exited)',
    async fixture =>
      withPeer(
        fixture,
        { calls: { echo: PROCESS_EXITS } },
        { kind: 'stdio' },
        async (_peer, transport) => {
          const sent = ok(await transport.call(echo, never), 'call')
          assert.deepStrictEqual(await sent.answer, { kind: 'no-answer', cause: 'process-exited' })
        },
      ),
  ),
]

const t2Cases = (): readonly Case[] => [
  conformanceCase(
    'T2',
    'call: input_required, task and an unknown resultType come through unclassified',
    async fixture => {
      const answers: readonly PlainJson[] = [
        {
          resultType: 'input_required',
          inputRequests: { who: { method: 'elicitation/create', params: {} } },
          requestState: 's1',
        },
        {
          resultType: 'task',
          taskId: 'task-1',
          status: 'working',
          ttlMs: null,
          pollIntervalMs: 50,
          createdAt: 'now',
        },
        {
          resultType: 'stream',
          _meta: { [SERVER_INFO_KEY]: { name: 'p', version: '1' } },
          content: [],
        },
      ]
      await withPeer(
        fixture,
        { calls: { echo: answers.map(answer => result(answer)) } },
        {},
        async (_peer, transport) => {
          for (const answer of answers) {
            const sent = ok(await transport.call(echo, never), 'call')
            assert.deepStrictEqual(await sent.answer, { kind: 'result', result: jsonOf(answer) })
          }
        },
      )
    },
  ),
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
          const [, next] = requests(peer, 'tools/list')
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
          assertEnvelopes(peer)
          const [discover] = requests(peer, 'server/discover')
          assert.strictEqual(
            discover === undefined ? undefined : versionOf(discover),
            fixture.protocolVersions[0],
          )
        },
      ),
  ),
  conformanceCase(
    'T3',
    'a legacy peer: discover falls back to initialize and initialized (item 7)',
    async fixture => {
      const initialized = {
        protocolVersion: '2025-11-25',
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
          assert.strictEqual(identity.protocolVersion, '2025-11-25')
          assert.deepStrictEqual(identity.capabilities, jsonOf({ tools: {} }))
          assert.deepStrictEqual(identity.serverInfo, { untrusted: jsonOf(initialized.serverInfo) })
          assert.strictEqual(identity.instructions?.untrusted.text, 'hello')
          const order = peer
            .received()
            .flatMap(entry =>
              entry.kind === 'request' || entry.kind === 'notification' ? [entry.method] : [],
            )
          assert.deepStrictEqual(order, [
            'server/discover',
            'initialize',
            'notifications/initialized',
          ])
          assertEnvelopes(peer)
        },
      )
    },
  ),
  conformanceCase(
    'T3',
    'stdio: a peer silent on discover within the probe time is a legacy peer (item 7)',
    async fixture =>
      withPeer(
        fixture,
        {
          discover: SILENT,
          initialize: result({ protocolVersion: '2025-11-25', capabilities: {} }),
        },
        { kind: 'stdio' },
        async (_peer, transport) => {
          assert.strictEqual(
            ok(await transport.discover(), 'discover').protocolVersion,
            '2025-11-25',
          )
        },
      ),
  ),
  conformanceCase(
    'T3',
    'streamable-http: a 400 answer to discover is a legacy peer (item 7)',
    async fixture =>
      withPeer(
        fixture,
        {
          discover: {
            kind: 'http',
            status: 400,
            body: '{"error":"unknown method server/discover"}',
          },
          initialize: result({ protocolVersion: '2025-11-25', capabilities: {} }),
        },
        { kind: 'streamable-http' },
        async (_peer, transport) => {
          assert.strictEqual(
            ok(await transport.discover(), 'discover').protocolVersion,
            '2025-11-25',
          )
        },
      ),
  ),
  conformanceCase(
    'T3',
    'discover fails only when both paths fail, and reports the modern path (item 7)',
    async fixture =>
      withPeer(
        fixture,
        { discover: error(-32603, 'boom'), initialize: METHOD_NOT_FOUND },
        {},
        async (peer, transport) => {
          assert.deepStrictEqual(failure(await transport.discover(), 'discover'), {
            kind: 'error-answer',
            code: -32603,
            message: 'boom',
          })
          assert.strictEqual(requests(peer, 'initialize').length, 1)
        },
      ),
  ),
  conformanceCase(
    'T3, T7',
    'an unreadable discover result is discover-shape when initialize fails too',
    async fixture =>
      withPeer(
        fixture,
        { discover: result({ hello: 1 }), initialize: METHOD_NOT_FOUND },
        {},
        async (_peer, transport) => {
          assert.deepStrictEqual(
            failure(await transport.discover(), 'discover'),
            malformed('discover-shape'),
          )
        },
      ),
  ),
  conformanceCase(
    'T3, T7',
    'no protocol version in common is discover-shape, with no legacy fallback',
    async fixture =>
      withPeer(
        fixture,
        {
          discover: result({ supportedVersions: ['1999-01-01'], capabilities: {} }),
          initialize: result({ protocolVersion: '2025-11-25', capabilities: {} }),
        },
        {},
        async (peer, transport) => {
          assert.deepStrictEqual(
            failure(await transport.discover(), 'discover'),
            malformed('discover-shape'),
          )
          assert.deepStrictEqual(requests(peer, 'initialize'), [])
        },
      ),
  ),
  conformanceCase(
    'T3',
    '-32022 with supported versions: one retry with the highest version in common (item 7)',
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
        },
        {},
        async (peer, transport) => {
          assert.strictEqual(ok(await transport.discover(), 'discover').protocolVersion, lowest)
          const sent = requests(peer, 'server/discover')
          assert.strictEqual(sent.length, 2)
          assert.strictEqual(sent[1] === undefined ? undefined : versionOf(sent[1]), lowest)
          assert.deepStrictEqual(requests(peer, 'initialize'), [])
        },
      )
    },
  ),
  conformanceCase(
    'T3, T7',
    '-32022 without a version in common is discover-shape (item 7)',
    async fixture =>
      withPeer(
        fixture,
        { discover: error(-32022, 'unsupported', { supported: ['2000-01-01'] }) },
        {},
        async (peer, transport) => {
          assert.deepStrictEqual(
            failure(await transport.discover(), 'discover'),
            malformed('discover-shape'),
          )
          assert.strictEqual(requests(peer, 'server/discover').length, 1)
        },
      ),
  ),
  conformanceCase(
    'T3',
    '-32022 after the retry is error-answer: the retry happens once (item 7)',
    async fixture => {
      const highest = fixture.protocolVersions[0]
      assert.ok(highest !== undefined)
      const unsupported = error(-32022, 'unsupported', { supported: [highest] })
      await withPeer(
        fixture,
        { discover: [unsupported, unsupported, modern(fixture)] },
        {},
        async (peer, transport) => {
          assert.deepStrictEqual(failure(await transport.discover(), 'discover'), {
            kind: 'error-answer',
            code: -32022,
            message: 'unsupported',
            data: jsonOf({ supported: [highest] }),
          })
          assert.strictEqual(requests(peer, 'server/discover').length, 2)
        },
      )
    },
  ),
  conformanceCase(
    'T3',
    'legacy: a request from the peer is refused with a JSON-RPC error (item 7)',
    async fixture =>
      withPeer(
        fixture,
        {
          discover: METHOD_NOT_FOUND,
          initialize: result({ protocolVersion: '2025-11-25', capabilities: {} }),
          peerRequests: [{ method: 'roots/list' }],
        },
        {},
        async (peer, transport) => {
          ok(await transport.discover(), 'discover')
          const responses = peer
            .received()
            .flatMap(entry => (entry.kind === 'response' ? [entry] : []))
          assert.strictEqual(responses.length, 1)
          assert.strictEqual(typeof at(responses[0]?.error, 'code'), 'number')
          assert.strictEqual(responses[0]?.result, undefined)
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
          const expected = boundInstructions(whole, 8)
          assert.deepStrictEqual(identity.instructions, {
            untrusted: { ...expected, generation: peer.material.generation },
          })
        },
      )
    },
  ),
  conformanceCase(
    'T3',
    'a call carries a progress token unique per request; progress reaches observe untrusted (item 14)',
    async fixture => {
      const progress: PeerNotificationScript = {
        method: 'notifications/progress',
        params: { progress: 1, total: 2 },
      }
      await withPeer(
        fixture,
        { calls: { echo: result(DONE, [progress]) } },
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
          const tokens = requests(peer, 'tools/call').map(request =>
            at(request.params, '_meta', 'progressToken'),
          )
          assert.strictEqual(tokens.length, 2)
          assert.ok(
            tokens.every(token => typeof token === 'string' || typeof token === 'number'),
            'a call has no progressToken',
          )
          assert.notDeepStrictEqual(tokens[0], tokens[1])
          assert.strictEqual(seen.length, 1)
          assert.strictEqual(seen[0]?.kind, 'progress')
          assert.deepStrictEqual(seen[0]?.notification, {
            untrusted: jsonOf({ progress: 1, total: 2, progressToken: tokens[0] ?? null }),
          })
        },
      )
    },
  ),
]

const t4Cases = (): readonly Case[] => {
  const metadata = (issuer: string) => ({
    resource: 'https://peer.test/mcp',
    authorization_servers: [issuer],
    scopes_supported: ['files:read', 'files:write'],
  })
  return [
    conformanceCase(
      'T4',
      '401: not-sent authorization-required from WWW-Authenticate and the named metadata; reportRejection once (item 11)',
      async fixture => {
        const credential = countingCredential()
        const url = 'https://peer.test/.well-known/oauth-protected-resource/mcp'
        const header = bearer(`resource_metadata="${url}", scope="files:read"`)
        await withPeer(
          fixture,
          {
            calls: { echo: { kind: 'http', status: 401, headers: { 'www-authenticate': header } } },
            wellKnown: { [`${METADATA_PATH}/mcp`]: metadata('https://issuer.test') },
          },
          { kind: 'streamable-http', credential },
          async (_peer, transport) => {
            const refused = failure(await transport.call(echo, never), 'call')
            assert.strictEqual(refused.kind, 'not-sent')
            assert.strictEqual(refused.cause, 'authorization-required')
            assert.ok(refused.kind === 'not-sent' && refused.cause === 'authorization-required')
            assert.strictEqual(refused.discovery.resourceMetadataUrl, url)
            assert.strictEqual(refused.discovery.metadata, 'fetched')
            assert.deepStrictEqual(refused.discovery.resourceMetadata, {
              untrusted: jsonOf(metadata('https://issuer.test')),
            })
            assert.deepStrictEqual(refused.discovery.issuers, ['https://issuer.test'])
            assert.deepStrictEqual(refused.discovery.scopes, ['files:read'])
            assert.strictEqual(credential.rejections(), 1)
          },
        )
      },
    ),
    conformanceCase(
      'T4',
      '401 without resource_metadata: the well-known URL with the path is tried before the root (item 11)',
      async fixture => {
        await withPeer(
          fixture,
          {
            listing: {
              '': {
                kind: 'http',
                status: 401,
                headers: { 'www-authenticate': bearer('realm="mcp"') },
              },
            },
            wellKnown: { [METADATA_PATH]: metadata('https://root.test') },
          },
          { kind: 'streamable-http', credential: countingCredential() },
          async (peer, transport) => {
            const refused = failure(await transport.listActions(), 'listActions')
            assert.ok(
              refused.kind === 'not-sent' && refused.cause === 'authorization-required',
              JSON.stringify(refused),
            )
            const origin = new URL(
              peer.material.kind === 'streamable-http'
                ? peer.material.target
                : 'https://invalid.test/',
            )
            const path = origin.pathname.replace(/\/$/u, '')
            const fetched = peer
              .received()
              .flatMap(entry => (entry.kind === 'fetch' ? [new URL(entry.url).pathname] : []))
            assert.deepStrictEqual(fetched, [`${METADATA_PATH}${path}`, METADATA_PATH])
            assert.strictEqual(
              new URL(refused.discovery.resourceMetadataUrl).pathname,
              METADATA_PATH,
            )
            assert.strictEqual(refused.discovery.metadata, 'fetched')
            assert.deepStrictEqual(refused.discovery.issuers, ['https://root.test'])
            assert.deepStrictEqual(refused.discovery.scopes, ['files:read', 'files:write'])
          },
        )
      },
    ),
    conformanceCase(
      'T4',
      '401 with no metadata anywhere: metadata unavailable, issuers empty, scopes from the header (item 11)',
      async fixture =>
        withPeer(
          fixture,
          {
            calls: {
              echo: {
                kind: 'http',
                status: 401,
                headers: { 'www-authenticate': bearer('scope="a b"') },
              },
            },
          },
          { kind: 'streamable-http', credential: countingCredential() },
          async (_peer, transport) => {
            const refused = failure(await transport.call(echo, never), 'call')
            assert.ok(
              refused.kind === 'not-sent' && refused.cause === 'authorization-required',
              JSON.stringify(refused),
            )
            assert.strictEqual(refused.discovery.metadata, 'unavailable')
            assert.strictEqual(refused.discovery.resourceMetadata, undefined)
            assert.strictEqual(
              new URL(refused.discovery.resourceMetadataUrl).pathname,
              METADATA_PATH,
            )
            assert.deepStrictEqual(refused.discovery.issuers, [])
            assert.deepStrictEqual(refused.discovery.scopes, ['a', 'b'])
          },
        ),
    ),
    conformanceCase(
      'T4',
      '403 insufficient_scope: authorization-required with the scope of the header; reportRejection once (item 11)',
      async fixture => {
        const credential = countingCredential()
        await withPeer(
          fixture,
          {
            calls: {
              echo: {
                kind: 'http',
                status: 403,
                headers: {
                  'www-authenticate': bearer('error="insufficient_scope", scope="files:write"'),
                },
              },
            },
          },
          { kind: 'streamable-http', credential },
          async (_peer, transport) => {
            const refused = failure(await transport.call(echo, never), 'call')
            assert.ok(
              refused.kind === 'not-sent' && refused.cause === 'authorization-required',
              JSON.stringify(refused),
            )
            assert.deepStrictEqual(refused.discovery.scopes, ['files:write'])
            assert.strictEqual(credential.rejections(), 1)
          },
        )
      },
    ),
    conformanceCase(
      'T4',
      'another 403: not-sent connection-unavailable and reportRejection is not called (item 11)',
      async fixture => {
        const credential = countingCredential()
        await withPeer(
          fixture,
          { calls: { echo: { kind: 'http', status: 403, body: 'origin not allowed' } } },
          { kind: 'streamable-http', credential },
          async (_peer, transport) => {
            assert.deepStrictEqual(await transport.call(echo, never), {
              failure: { kind: 'not-sent', cause: 'connection-unavailable' },
            })
            assert.strictEqual(credential.rejections(), 0)
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
          {
            discover: {
              kind: 'http',
              status: 401,
              headers: { 'www-authenticate': bearer('realm="mcp"') },
            },
          },
          { kind: 'streamable-http' },
          async (_peer, transport) => {
            const refused = failure(await transport.discover(), 'discover')
            assert.ok(
              refused.kind === 'not-sent' && refused.cause === 'authorization-required',
              JSON.stringify(refused),
            )
          },
        ),
    ),
  ]
}

const t5Cases = (): readonly Case[] => [
  conformanceCase(
    'T5',
    'stdio: cancelRequest sends notifications/cancelled with the request id and the envelope (item 9)',
    async fixture =>
      withPeer(fixture, { calls: { echo: SILENT } }, { kind: 'stdio' }, async (peer, transport) => {
        const sent = ok(await transport.call(echo, never), 'call')
        await transport.cancelRequest(sent.requestId)
        const [cancelled] = notifications(peer, 'notifications/cancelled')
        assert.ok(cancelled !== undefined, 'notifications/cancelled was not sent')
        assert.strictEqual(at(cancelled.params, 'requestId'), sent.requestId)
        assert.ok(
          isRecord(at(cancelled.params, '_meta', CLIENT_CAPABILITIES_KEY)),
          'the cancel carries no envelope',
        )
        assert.deepStrictEqual(
          peer.received().filter(entry => entry.kind === 'stream-aborted'),
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
          assert.deepStrictEqual(
            peer.received().filter(entry => entry.kind === 'stream-aborted'),
            [{ kind: 'stream-aborted', id: sent.requestId }],
          )
          assert.deepStrictEqual(notifications(peer, 'notifications/cancelled'), [])
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
      '-32602 on tasks/get is expired for getTask and getTaskResult',
      async fixture =>
        withPeer(
          fixture,
          { tasks: { t1: { get: TASK_NOT_FOUND } } },
          {},
          async (_peer, transport) => {
            assert.deepStrictEqual(await transport.getTask(taskId('t1')), { ok: 'expired' })
            assert.deepStrictEqual(await transport.getTaskResult(taskId('t1')), {
              ok: { kind: 'expired' },
            })
            assert.deepStrictEqual(await transport.getTask(taskId('missing')), { ok: 'expired' })
          },
        ),
    ),
    conformanceCase(
      'T6',
      'updateTask sends tasks/update with the task id and the input responses; the ack is accepted',
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
            const [update] = requests(peer, 'tasks/update')
            assert.strictEqual(at(update?.params, 'taskId'), 't1')
            assert.deepStrictEqual(at(update?.params, 'inputResponses'), responses)
          },
        )
      },
    ),
    conformanceCase(
      'T6',
      'cancelTask sends tasks/cancel; the ack is requested; no notifications/cancelled',
      async fixture =>
        withPeer(
          fixture,
          { tasks: { t1: { cancel: result({}) } } },
          {},
          async (peer, transport) => {
            assert.deepStrictEqual(await transport.cancelTask(taskId('t1')), { ok: 'requested' })
            assert.strictEqual(at(requests(peer, 'tasks/cancel')[0]?.params, 'taskId'), 't1')
            assert.deepStrictEqual(notifications(peer, 'notifications/cancelled'), [])
          },
        ),
    ),
    conformanceCase(
      'T6',
      'updateTask and cancelTask on an expired task are error-answer -32602 as written',
      async fixture =>
        withPeer(
          fixture,
          { tasks: { t1: { update: TASK_NOT_FOUND, cancel: TASK_NOT_FOUND } } },
          {},
          async (_peer, transport) => {
            const expired = { kind: 'error-answer', code: -32602, message: 'Task not found' }
            assert.deepStrictEqual(await transport.updateTask(taskId('t1'), jsonOf({})), {
              failure: expired,
            })
            assert.deepStrictEqual(await transport.cancelTask(taskId('t1')), { failure: expired })
          },
        ),
    ),
    conformanceCase(
      'T6',
      '-32021 on a task operation is error-answer as written: a missing client capability (item 12)',
      async fixture => {
        const missing = error(-32021, 'Missing required client capability', {
          requiredCapabilities: { extensions: { [TASKS_EXTENSION]: {} } },
        })
        await withPeer(
          fixture,
          { tasks: { t1: { get: missing } } },
          {},
          async (_peer, transport) => {
            const refused = failure(await transport.getTask(taskId('t1')), 'getTask')
            assert.strictEqual(refused.kind, 'error-answer')
            assert.ok(refused.kind === 'error-answer')
            assert.strictEqual(refused.code, -32021)
            assert.deepStrictEqual(
              refused.data,
              jsonOf({ requiredCapabilities: { extensions: { [TASKS_EXTENSION]: {} } } }),
            )
          },
        )
      },
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
  ]
}

const t7Cases = (): readonly Case[] => {
  const task = (extra: Readonly<{ [key: string]: PlainJson }>): PeerReply =>
    result({ resultType: 'complete', taskId: 't1', ...extra })
  return [
    conformanceCase(
      'T7',
      'status-unknown: a tasks/get status outside the five values',
      async fixture =>
        withPeer(
          fixture,
          { tasks: { t1: { get: [task({ status: 'paused' }), task({})] } } },
          {},
          async (_peer, transport) => {
            assert.deepStrictEqual(await transport.getTask(taskId('t1')), {
              failure: malformed('status-unknown'),
            })
            assert.deepStrictEqual(await transport.getTaskResult(taskId('t1')), {
              failure: malformed('status-unknown'),
            })
          },
        ),
    ),
    conformanceCase(
      'T7',
      'input-requests-missing: input_required without inputRequests',
      async fixture =>
        withPeer(
          fixture,
          { tasks: { t1: { get: task({ status: 'input_required' }) } } },
          {},
          async (_peer, transport) => {
            assert.deepStrictEqual(await transport.getTask(taskId('t1')), {
              failure: malformed('input-requests-missing'),
            })
          },
        ),
    ),
    conformanceCase(
      'T7',
      'result-missing: completed without result, for getTask and getTaskResult',
      async fixture =>
        withPeer(
          fixture,
          { tasks: { t1: { get: task({ status: 'completed' }) } } },
          {},
          async (_peer, transport) => {
            assert.deepStrictEqual(await transport.getTask(taskId('t1')), {
              failure: malformed('result-missing'),
            })
            assert.deepStrictEqual(await transport.getTaskResult(taskId('t1')), {
              failure: malformed('result-missing'),
            })
          },
        ),
    ),
    conformanceCase(
      'T7',
      'error-shape: an error without an integer code or without a message is not an error-answer',
      async fixture =>
        withPeer(
          fixture,
          {
            listing: {
              '': [
                { kind: 'error', error: { message: 'no code' } },
                { kind: 'error', error: { code: 1.5, message: 'fraction' } },
                { kind: 'error', error: { code: -32603 } },
              ],
            },
          },
          {},
          async (_peer, transport) => {
            for (let round = 0; round < 3; round += 1)
              assert.deepStrictEqual(await transport.listActions(), {
                failure: malformed('error-shape'),
              })
          },
        ),
    ),
    conformanceCase(
      'T7',
      'tools-missing: a tools/list result without a tools list',
      async fixture =>
        withPeer(
          fixture,
          { listing: { '': [result({}), result({ tools: 'none' })] } },
          {},
          async (_peer, transport) => {
            assert.deepStrictEqual(await transport.listActions(), {
              failure: malformed('tools-missing'),
            })
            assert.deepStrictEqual(await transport.listActions(), {
              failure: malformed('tools-missing'),
            })
          },
        ),
    ),
  ]
}

const deviationCases = (): readonly Case[] => [
  conformanceCase(
    '偏离',
    'streamable-http: a read request whose answer stream broke is sent once more with a new id (item 10)',
    async fixture =>
      withPeer(
        fixture,
        {
          discover: [STREAM_BREAKS, modern(fixture)],
          listing: { '': [STREAM_BREAKS, result({ tools: [] })] },
          tasks: { t1: { get: [STREAM_BREAKS, result({ status: 'working' })] } },
        },
        { kind: 'streamable-http' },
        async (peer, transport) => {
          ok(await transport.discover(), 'discover')
          ok(await transport.listActions(), 'listActions')
          ok(await transport.getTask(taskId('t1')), 'getTask')
          for (const method of ['server/discover', 'tools/list', 'tasks/get']) {
            const sent = requests(peer, method)
            assert.strictEqual(sent.length, 2, `${method} was sent ${sent.length} times`)
            assert.notStrictEqual(
              sent[0]?.id,
              sent[1]?.id,
              `${method} was re-sent with the same id`,
            )
          }
        },
      ),
  ),
  conformanceCase(
    '偏离',
    'streamable-http: a call, tasks/update and tasks/cancel are not re-sent: no-answer (stream-broken) (item 10)',
    async fixture =>
      withPeer(
        fixture,
        {
          calls: { echo: [STREAM_BREAKS, result(DONE)] },
          tasks: {
            t1: { update: [STREAM_BREAKS, result({})], cancel: [STREAM_BREAKS, result({})] },
          },
        },
        { kind: 'streamable-http' },
        async (peer, transport) => {
          const sent = ok(await transport.call(echo, never), 'call')
          assert.deepStrictEqual(await sent.answer, { kind: 'no-answer', cause: 'stream-broken' })
          assert.deepStrictEqual(await transport.updateTask(taskId('t1'), jsonOf({})), {
            failure: { kind: 'no-answer', cause: 'stream-broken' },
          })
          assert.deepStrictEqual(await transport.cancelTask(taskId('t1')), {
            failure: { kind: 'no-answer', cause: 'stream-broken' },
          })
          for (const method of ['tools/call', 'tasks/update', 'tasks/cancel'])
            assert.strictEqual(requests(peer, method).length, 1, `${method} was re-sent`)
        },
      ),
  ),
  conformanceCase(
    '偏离',
    'streamable-http: a second broken stream on a read is no-answer (stream-broken) (item 10)',
    async fixture =>
      withPeer(
        fixture,
        { listing: { '': [STREAM_BREAKS, STREAM_BREAKS, result({ tools: [] })] } },
        { kind: 'streamable-http' },
        async (peer, transport) => {
          assert.deepStrictEqual(await transport.listActions(), {
            failure: { kind: 'no-answer', cause: 'stream-broken' },
          })
          assert.strictEqual(requests(peer, 'tools/list').length, 2)
        },
      ),
  ),
]

/**
 * The conformance suite of `McpTransport` and `McpTransportFactory`. Each case names the SPEC
 * clause it checks. The fixture prepares a scripted peer per case; cases that need a material
 * kind the fixture cannot open are not applicable.
 */
export function mcpTransportConformance(): readonly ConformanceCase<TransportFixture>[] {
  return [
    ...t1Cases(),
    ...t2Cases(),
    ...t3Cases(),
    ...t4Cases(),
    ...t5Cases(),
    ...t6Cases(),
    ...t7Cases(),
    ...deviationCases(),
  ]
}
