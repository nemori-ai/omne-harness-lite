// The protocol session on an in-memory line: every row of the contract's decision table (T8)
// drives the session with the wire event of each cell and holds it to the row's conclusion; the
// hand-written cases cover what the table does not say: the stdio probe time and close() during
// a probe (T5), the peer's requests and notifications (T3), and the legacy HTTP+SSE mode (T3).
import { getEventListeners } from 'node:events'
import type { Outcome } from '@omne-harness/operation-result'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  LEGACY_PROTOCOL_VERSIONS,
  isConnectionTarget,
  type PlainJson,
  type PlainRecord,
  type RequestClass,
} from '@omne-harness/mcp-contract'
import type {
  HttpCredentialHandle,
  McpTransport,
  ProcessHandle,
  TransportFailure,
  TransportMaterial,
} from '@omne-harness/mcp-contract/provider'
import {
  TRANSPORT_TABLE,
  actionNameOf,
  cellsOf,
  generationOf,
  jsonOf,
  jsonTextOf,
  taskIdOf,
  type ExpectedFailure,
  type TableCell,
  type TableConclusion,
} from '@omne-harness/mcp-contract/testing'
import type { Line, LineEvent } from '../src/line.ts'
import { AsyncQueue } from '../src/queue.ts'
import { Session, type SessionOptions } from '../src/session.ts'
import { settledWithin } from './fixtures/settle.ts'
import { MemoryLine, type Reply, type Script, type SseConfig } from './memory-line.ts'

/** The default scheduler for the unit tests: one real timer per probe. */
const schedule: SessionOptions['schedule'] = (delayMs, fire) => {
  const timer = setTimeout(fire, delayMs)
  return () => clearTimeout(timer)
}

/** The default defect outlet for the unit tests: thrown outside any promise, the guard of `unhandled.ts` fails the case. */
const reportDefect: SessionOptions['reportDefect'] = defect => {
  queueMicrotask(() => {
    throw defect
  })
}

const HIGHEST = '2026-07-28'
const VERSIONS = [HIGHEST] as const
const [OFFERED_LEGACY_VERSION] = LEGACY_PROTOCOL_VERSIONS
const SESSION = 'session-1'
const target = (() => {
  const text = 'https://peer.test/mcp'
  if (!isConnectionTarget(text)) throw new Error('bad target')
  return text
})()
const never = new AbortController().signal
const echo = { action: actionNameOf('echo'), args: jsonOf({}) }
const NOT_SENT: TransportFailure = { kind: 'not-sent', cause: 'connection-unavailable' }
const STREAM_BROKEN: TransportFailure = { kind: 'no-answer', cause: 'stream-broken' }

function idleProcess(): ProcessHandle {
  return {
    stdin: new WritableStream<Uint8Array>(),
    stdout: new ReadableStream<Uint8Array>(),
    stderr: new ReadableStream<string>(),
    exited: new Promise<void>(() => undefined),
    stop: async () => 'tree-confirmed',
  }
}

/** A gate holds the n-th authorization (counting from 1) until its promise settles. */
type Gate = (authorization: number) => Promise<void> | undefined

function countingCredential(
  gate?: Gate,
): HttpCredentialHandle &
  Readonly<{ rejections(): number; authorizations(): number; rejected: Promise<void> }> {
  let rejections = 0
  let authorizations = 0
  // Resolves on the first `reportRejection`: a case waits for the port to be reached, not for time.
  let firstRejection = (): void => undefined
  const rejected = new Promise<void>(resolve => {
    firstRejection = resolve
  })
  return {
    purpose: 'http-authorization',
    async authorize(headers) {
      authorizations += 1
      await gate?.(authorizations)
      headers.set('authorization', 'Bearer test-token')
      return { ok: true }
    },
    async reportRejection() {
      rejections += 1
      firstRejection()
    },
    async release() {},
    rejections: () => rejections,
    authorizations: () => authorizations,
    rejected,
  }
}

type Opened = Readonly<{
  line: MemoryLine
  transport: McpTransport
  credential: ReturnType<typeof countingCredential>
}>

const metadata = new Map<string, PlainJson>()

function open(
  kind: TransportMaterial['kind'],
  script: Script,
  options: Partial<SessionOptions> & Readonly<{ sse?: SseConfig; gate?: Gate }> = {},
): Opened {
  const credential = countingCredential(options.gate)
  const line = new MemoryLine(
    kind,
    script,
    options.sse === undefined ? undefined : { entry: options.sse },
  )
  const material: TransportMaterial =
    kind === 'stdio'
      ? { kind, process: idleProcess(), generation: generationOf(1), instructionsByteLimit: 4096 }
      : { kind, target, credential, generation: generationOf(1), instructionsByteLimit: 4096 }
  const transport = new Session(line, material, {
    clientInfo: { name: 'host', version: '1' },
    versions: VERSIONS,
    probeTimeoutMs: 50,
    fetchMetadata: async url => {
      const document = metadata.get(url)
      return document === undefined ? undefined : jsonOf(document)
    },
    schedule,
    reportDefect,
    ...options,
  })
  return { line, transport, credential }
}

const message = (member: PlainRecord): Reply => ({ kind: 'message', message: member })
const result = (value: PlainJson): Reply => message({ result: value })
const error = (code: number, text: string, data?: PlainJson): Reply =>
  message({ error: data === undefined ? { code, message: text } : { code, message: text, data } })
const status = (
  code: number,
  body = '',
  headers: Readonly<{ [name: string]: string }> = {},
): Reply => ({
  kind: 'status',
  status: code,
  headers,
  body,
})
/** A JSON-RPC error sent without the `jsonrpc` member: an envelope that T2 refuses. */
const bareError = (code: number, text: string, data?: PlainJson): Reply => ({
  kind: 'message',
  message: { error: data === undefined ? { code, message: text } : { code, message: text, data } },
  bare: true,
})
const METHOD_NOT_FOUND = error(-32601, 'Method not found')
const LEGACY = result({ protocolVersion: OFFERED_LEGACY_VERSION, capabilities: {} })
const LEGACY_BROKE = error(-32603, 'legacy broke')
const MODERN = result({ supportedVersions: VERSIONS, capabilities: {} })

// ---- The samples of the decision table ----

function errorObject(code: string): PlainJson {
  switch (code) {
    case '-32020':
      return { code: -32020, message: 'Header mismatch' }
    case '-32021':
      return { code: -32021, message: 'Missing required client capability' }
    case '-32022+common':
      return { code: -32022, message: 'Unsupported', data: { supported: ['2000-01-01', HIGHEST] } }
    case '-32022+modern':
      return { code: -32022, message: 'Unsupported', data: { supported: ['2099-01-01'] } }
    case '-32022+legacy':
      return {
        code: -32022,
        message: 'Unsupported',
        data: { supported: [LEGACY_PROTOCOL_VERSIONS[1]] },
      }
    case '-32601':
      return { code: -32601, message: 'Method not found' }
    case '-32602':
      return { code: -32602, message: 'Invalid params', data: { field: 'city' } }
    case 'other':
      return { code: -32603, message: 'Internal error' }
    case 'unreadable':
      return { message: 'no code' }
    default:
      throw new TypeError(`no error sample for ${code}`)
  }
}

function resultValue(request: RequestClass, answer: string): PlainJson {
  switch (`${request}|${answer}`) {
    case 'discover|result':
    case 'discover-retry|result':
      return { supportedVersions: VERSIONS, capabilities: { tools: {} } }
    case 'discover|result:no-common':
    case 'discover-retry|result:no-common':
      return { supportedVersions: ['2099-01-01'], capabilities: {} }
    case 'discover|result:unreadable':
    case 'discover-retry|result:unreadable':
      return { hello: 1 }
    case 'initialize|result':
      return { protocolVersion: OFFERED_LEGACY_VERSION, capabilities: {} }
    case 'initialize|result:unreadable':
      return { protocolVersion: HIGHEST, capabilities: {} }
    case 'tools/list|result':
      return { tools: [], nextCursor: 'p2' }
    case 'tools/list|result:tools-missing':
      return { tools: 'none' }
    case 'tools/list|result:cursor-invalid':
      return { tools: [], nextCursor: 7 }
    case 'tools/call|result':
      return { content: [{ type: 'text', text: 'done' }] }
    case 'tasks/get|result':
      return { taskId: 't1', status: 'working' }
    case 'tasks/get|result:status-unknown':
      return { taskId: 't1', status: 'paused' }
    case 'tasks/get|result:input-requests-missing':
      return { taskId: 't1', status: 'input_required' }
    case 'tasks/get|result:result-missing':
      return { taskId: 't1', status: 'completed' }
    case 'tasks/get|result:error-missing':
      return { taskId: 't1', status: 'failed' }
    case 'tasks/update|result':
    case 'tasks/cancel|result':
      return {}
    default:
      throw new TypeError(`no result sample for ${request} and ${answer}`)
  }
}

const STATUS_OF: Readonly<{ [statusClass: string]: number }> = { '4xx': 418, '5xx': 503 }
const HTTP_ANSWER = /^http:(\w+)\+(.+)$/u

/** The reply of the memory line for one cell. */
function replyOf(cell: TableCell): Reply {
  const { request, answer } = cell
  const stdio = cell.kind === 'stdio'
  switch (answer) {
    case 'unsent':
      return { kind: 'unsent' }
    case 'silent':
      return { kind: 'silent' }
    case 'stream-broken':
      return stdio ? { kind: 'ended', stdoutEndedAt: 0 } : { kind: 'aborted' }
    case 'process-exited':
      return { kind: 'ended', stdoutEndedAt: 0, exitedAt: 20 }
    case 'http:2xx':
      return { kind: 'empty' }
    case 'http:401':
      return status(401, '', { 'www-authenticate': 'Bearer scope="a"' })
    case 'http:403+scope':
      return status(403, '', {
        'www-authenticate': 'Bearer error="insufficient_scope", scope="files:write"',
      })
    case 'http:403':
      return status(403, 'origin not allowed')
    case 'http:404+session':
      return status(
        404,
        JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32001, message: 'Session not found' },
        }),
      )
    default: {
      const http = HTTP_ANSWER.exec(answer)
      if (http !== null) {
        const statusClass = http[1] ?? ''
        const code = STATUS_OF[statusClass] ?? Number(statusClass)
        const body = http[2] ?? ''
        if (body === 'plain') return status(code, `HTTP ${code}`)
        return status(code, JSON.stringify({ jsonrpc: '2.0', id: null, error: errorObject(body) }))
      }
      if (answer.startsWith('error:'))
        return message({ error: errorObject(answer.slice('error:'.length)) })
      return result(resultValue(request, answer))
    }
  }
}

function isPlain(value: unknown): value is PlainJson {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return true
  if (Array.isArray(value)) return value.every(isPlain)
  return typeof value === 'object' && Object.values(value).every(isPlain)
}

function isRecord(value: PlainJson | undefined): value is PlainRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The JSON-RPC error a reply carries, directly or as the body of an HTTP answer. */
function errorObjectOf(reply: Reply): PlainJson | undefined {
  if (reply.kind === 'message') return reply.message['error']
  if (reply.kind !== 'status' || reply.body === undefined || reply.body === '') return undefined
  const parsed: unknown = JSON.parse(reply.body)
  if (typeof parsed !== 'object' || parsed === null || !('error' in parsed)) return undefined
  const error: unknown = parsed.error
  return isPlain(error) ? error : undefined
}

function failureOf(expected: ExpectedFailure, reply: Reply): TransportFailure | undefined {
  if (expected.kind === 'not-sent' && expected.cause === 'authorization-required') return undefined
  if (expected.kind !== 'error-answer') return expected
  const object = errorObjectOf(reply)
  if (!isRecord(object)) throw new TypeError('the sample is no error')
  const code = object['code']
  const text = object['message']
  if (typeof code !== 'number' || typeof text !== 'string')
    throw new TypeError('the sample is no error')
  const data = object['data']
  return {
    kind: 'error-answer',
    code,
    message: text,
    ...(data === undefined ? {} : { data: jsonOf(data) }),
  }
}

function assertFailure(
  actual: Outcome<unknown, TransportFailure>,
  expected: ExpectedFailure,
  reply: Reply,
): void {
  expect('failure' in actual, JSON.stringify(actual)).toBe(true)
  if (!('failure' in actual)) return
  const wanted = failureOf(expected, reply)
  if (wanted === undefined) {
    expect(
      actual.failure.kind === 'not-sent' && actual.failure.cause === 'authorization-required',
      JSON.stringify(actual),
    ).toBe(true)
    return
  }
  expect(actual.failure).toEqual(wanted)
}

function ok<T>(outcome: Outcome<T, TransportFailure>, what: string): T {
  if (!('ok' in outcome)) throw new Error(`${what} failed: ${JSON.stringify(outcome)}`)
  return outcome.ok
}

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0))

/** Waits until the line saw a request of `method` (a silent answer settles only on close). */
async function untilSent(line: MemoryLine, method: string): Promise<void> {
  for (let round = 0; round < 200; round += 1) {
    if (line.requests(method).length > 0) return
    await tick()
  }
  throw new Error(`${method} was never sent`)
}

type Drive = Readonly<{
  method: string
  script: (replies: readonly Reply[]) => Script
  run: (transport: McpTransport) => Promise<Outcome<unknown, TransportFailure>>
  ok: Reply
}>

function driveOf(request: RequestClass): Drive {
  switch (request) {
    case 'tools/list':
      return {
        method: 'tools/list',
        script: replies => ({ 'tools/list': replies }),
        run: t => t.listActions(),
        ok: result({ tools: [] }),
      }
    case 'tasks/get':
      return {
        method: 'tasks/get',
        script: replies => ({ 'tasks/get': replies }),
        run: t => t.getTask(taskIdOf('t1')),
        ok: result({ taskId: 't1', status: 'working' }),
      }
    case 'tasks/update':
      return {
        method: 'tasks/update',
        script: replies => ({ 'tasks/update': replies }),
        run: t => t.updateTask(taskIdOf('t1'), jsonOf({})),
        ok: result({}),
      }
    case 'tasks/cancel':
      return {
        method: 'tasks/cancel',
        script: replies => ({ 'tasks/cancel': replies }),
        run: t => t.cancelTask(taskIdOf('t1')),
        ok: result({}),
      }
    default:
      return {
        method: 'server/discover',
        script: replies => ({ 'server/discover': replies }),
        run: t => t.discover(),
        ok: MODERN,
      }
  }
}

/** The script that opens a legacy Streamable HTTP session before the cell's request. */
const SESSION_SCRIPT: Script = {
  'server/discover': [METHOD_NOT_FOUND],
  initialize: [
    {
      kind: 'message',
      message: { result: { protocolVersion: OFFERED_LEGACY_VERSION, capabilities: {} } },
      headers: { 'mcp-session-id': SESSION },
    },
  ],
}

type Body = (opened: Opened) => Promise<void>

async function run(
  cell: TableCell,
  conclusion: TableConclusion,
  script: Script,
  body: Body,
): Promise<void> {
  const opened = open(cell.kind, script)
  try {
    await body(opened)
  } finally {
    await opened.transport.close()
  }
  if (cell.kind === 'streamable-http')
    expect(opened.credential.rejections(), 'reportRejection calls').toBe(
      conclusion.rejection === true ? 1 : 0,
    )
}

async function afterwards(opened: Opened, conclusion: TableConclusion): Promise<void> {
  if (conclusion.unusable === true)
    expect(await opened.transport.listActions()).toEqual({ failure: NOT_SENT })
}

async function checkProbe(
  cell: TableCell,
  reply: Reply,
  conclusion: TableConclusion,
): Promise<void> {
  const before: readonly Reply[] =
    cell.request === 'discover-retry' ? [message({ error: errorObject('-32022+common') })] : []
  const sent = before.length + (reply.kind === 'unsent' ? 0 : 1)
  const discovers = (line: MemoryLine) => line.requests('server/discover')
  switch (conclusion.kind) {
    case 'read':
      return run(
        cell,
        conclusion,
        { 'server/discover': [...before, reply], initialize: [LEGACY] },
        async ({ line, transport }) => {
          expect(ok(await transport.discover(), 'discover').protocolVersion).toBe(HIGHEST)
          expect(discovers(line)).toHaveLength(sent)
          expect(line.requests('initialize')).toEqual([])
        },
      )
    case 'retry':
      return run(
        cell,
        conclusion,
        { 'server/discover': [reply, MODERN], initialize: [LEGACY] },
        async ({ line, transport }) => {
          expect(ok(await transport.discover(), 'discover').protocolVersion).toBe(HIGHEST)
          expect(discovers(line)).toHaveLength(2)
          expect(discovers(line)[1]?.message['params']).toMatchObject({
            _meta: { 'io.modelcontextprotocol/protocolVersion': HIGHEST },
          })
        },
      )
    case 'fallback': {
      await run(
        cell,
        conclusion,
        { 'server/discover': [...before, reply], initialize: [LEGACY] },
        async ({ line, transport }) => {
          expect(ok(await transport.discover(), 'discover').protocolVersion).toBe(
            OFFERED_LEGACY_VERSION,
          )
          expect(line.requests('initialize')).toHaveLength(1)
        },
      )
      return run(
        cell,
        conclusion,
        { 'server/discover': [...before, reply], initialize: [LEGACY_BROKE] },
        async ({ transport }) => {
          const failed = await transport.discover()
          if (conclusion.report === 'legacy')
            expect(failed).toEqual({
              failure: { kind: 'error-answer', code: -32603, message: 'legacy broke' },
            })
          else assertFailure(failed, conclusion.report, reply)
        },
      )
    }
    case 'resend':
      await run(
        cell,
        conclusion,
        { 'server/discover': [...before, reply, MODERN] },
        async ({ line, transport }) => {
          ok(await transport.discover(), 'discover')
          const probes = discovers(line)
          expect(probes).toHaveLength(sent + 1)
          expect(probes.at(-1)?.message['id']).not.toBe(probes.at(-2)?.message['id'])
        },
      )
      return run(
        cell,
        conclusion,
        { 'server/discover': [...before, reply, reply] },
        async ({ line, transport }) => {
          expect(await transport.discover()).toEqual({ failure: STREAM_BROKEN })
          expect(discovers(line)).toHaveLength(sent + 1)
        },
      )
    case 'failure':
      return run(
        cell,
        conclusion,
        { 'server/discover': [...before, reply], initialize: [LEGACY] },
        async opened => {
          const { line, transport } = opened
          const pending = transport.discover()
          if (reply.kind === 'silent') {
            await untilSent(line, 'server/discover')
            await transport.close()
          }
          assertFailure(await pending, conclusion.failure, reply)
          expect(discovers(line)).toHaveLength(sent)
          expect(line.requests('initialize')).toEqual([])
          await afterwards(opened, conclusion)
        },
      )
    default:
      throw new Error(`row conclusion ${conclusion.kind} on server/discover`)
  }
}

async function checkInitialize(
  cell: TableCell,
  reply: Reply,
  conclusion: TableConclusion,
): Promise<void> {
  await run(
    cell,
    conclusion,
    { 'server/discover': [METHOD_NOT_FOUND], initialize: [reply] },
    async opened => {
      const { line, transport } = opened
      const pending = transport.discover()
      if (reply.kind === 'silent') {
        await untilSent(line, 'initialize')
        await transport.close()
      }
      const outcome = await pending
      const initialized = line.requests('notifications/initialized')
      if (conclusion.kind === 'read') {
        expect(ok(outcome, 'discover').protocolVersion).toBe(OFFERED_LEGACY_VERSION)
        expect(initialized).toHaveLength(1)
        return
      }
      expect(conclusion.kind).toBe('failure')
      if (conclusion.kind !== 'failure') return
      assertFailure(outcome, conclusion.failure, reply)
      expect(initialized).toEqual([])
      await afterwards(opened, conclusion)
    },
  )
}

async function checkCall(
  cell: TableCell,
  reply: Reply,
  conclusion: TableConclusion,
): Promise<void> {
  const session = cell.answer === 'http:404+session'
  await run(
    cell,
    conclusion,
    { ...(session ? SESSION_SCRIPT : {}), 'tools/call': [reply] },
    async opened => {
      const { line, transport } = opened
      if (session) ok(await transport.discover(), 'discover')
      const outcome = await transport.call(echo, never)
      if (conclusion.kind === 'failure') assertFailure(outcome, conclusion.failure, reply)
      else {
        expect(conclusion.kind).toBe('answer')
        if (conclusion.kind !== 'answer') return
        const sent = ok(outcome, 'call')
        if (reply.kind === 'silent') {
          await untilSent(line, 'tools/call')
          await transport.close()
        }
        const answer = await sent.answer
        if (conclusion.answer === 'result')
          expect(answer).toEqual({
            kind: 'result',
            result: jsonOf(resultValue('tools/call', 'result')),
          })
        else if (conclusion.answer === 'error')
          expect(answer).toEqual({ kind: 'error', error: jsonOf(errorObjectOf(reply)) })
        else expect(answer).toEqual({ kind: 'no-answer', cause: conclusion.answer })
      }
      expect(line.requests('tools/call')).toHaveLength(reply.kind === 'unsent' ? 0 : 1)
      if (session) expect(line.requests('tools/call')[0]?.headers['mcp-session-id']).toBe(SESSION)
      await afterwards(opened, conclusion)
    },
  )
}

async function checkNotification(
  cell: TableCell,
  reply: Reply,
  conclusion: TableConclusion,
): Promise<void> {
  const script: Script = {
    ...SESSION_SCRIPT,
    ...(cell.answer === 'http:404+session' ? {} : { initialize: [LEGACY] }),
    'notifications/initialized': [reply],
    'tools/list': [result({ tools: [] })],
  }
  await run(cell, conclusion, script, async ({ line, transport }) => {
    expect(conclusion.kind).toBe('ignored')
    ok(await transport.discover(), 'discover')
    expect(line.requests('notifications/initialized')).toHaveLength(reply.kind === 'unsent' ? 0 : 1)
    if (cell.kind === 'streamable-http') ok(await transport.listActions(), 'listActions')
  })
}

async function checkOperation(
  cell: TableCell,
  reply: Reply,
  conclusion: TableConclusion,
): Promise<void> {
  const drive = driveOf(cell.request)
  const session = cell.answer === 'http:404+session'
  const scriptOf = (replies: readonly Reply[]): Script => ({
    ...(session ? SESSION_SCRIPT : {}),
    ...drive.script(replies),
  })
  const opened = async (transport: McpTransport) => {
    if (session) ok(await transport.discover(), 'discover')
  }
  switch (conclusion.kind) {
    case 'read':
      return run(cell, conclusion, scriptOf([reply]), async ({ transport }) => {
        await opened(transport)
        ok(await drive.run(transport), drive.method)
      })
    case 'expired':
      return run(cell, conclusion, scriptOf([reply, reply]), async ({ transport }) => {
        expect(await transport.getTask(taskIdOf('t1'))).toEqual({ ok: 'expired' })
        expect(await transport.getTaskResult(taskIdOf('t1'))).toEqual({ ok: { kind: 'expired' } })
      })
    case 'resend':
      await run(cell, conclusion, scriptOf([reply, drive.ok]), async ({ line, transport }) => {
        await opened(transport)
        ok(await drive.run(transport), drive.method)
        const [first, second] = line.requests(drive.method)
        expect(line.requests(drive.method)).toHaveLength(2)
        expect(first?.message['id']).not.toBe(second?.message['id'])
      })
      return run(cell, conclusion, scriptOf([reply, reply]), async ({ line, transport }) => {
        await opened(transport)
        expect(await drive.run(transport)).toEqual({ failure: STREAM_BROKEN })
        expect(line.requests(drive.method)).toHaveLength(2)
      })
    case 'failure':
      return run(cell, conclusion, scriptOf([reply, reply]), async all => {
        const { line, transport } = all
        await opened(transport)
        const pending = drive.run(transport)
        if (reply.kind === 'silent') {
          await untilSent(line, drive.method)
          await transport.close()
        }
        assertFailure(await pending, conclusion.failure, reply)
        expect(line.requests(drive.method)).toHaveLength(reply.kind === 'unsent' ? 0 : 1)
        if (session) expect(line.requests(drive.method)[0]?.headers['mcp-session-id']).toBe(SESSION)
        await afterwards(all, conclusion)
      })
    default:
      throw new Error(`row conclusion ${conclusion.kind} on ${cell.request}`)
  }
}

async function checkCell(cell: TableCell, conclusion: TableConclusion): Promise<void> {
  const reply = replyOf(cell)
  switch (cell.request) {
    case 'discover':
    case 'discover-retry':
      return checkProbe(cell, reply, conclusion)
    case 'initialize':
      return checkInitialize(cell, reply, conclusion)
    case 'tools/call':
      return checkCall(cell, reply, conclusion)
    case 'notification':
      return checkNotification(cell, reply, conclusion)
    default:
      return checkOperation(cell, reply, conclusion)
  }
}

describe('the session holds every row of T8 on a memory line', () => {
  for (const row of TRANSPORT_TABLE) {
    const cells = cellsOf(row)
    it(`${row.id}: ${cells.length} cells`, async () => {
      for (const cell of cells) {
        try {
          await checkCell(cell, row.conclusion)
        } catch (failure) {
          throw new Error(
            `${cell.kind} ${cell.request} ${cell.answer}: ${failure instanceof Error ? failure.message : String(failure)}`,
          )
        }
      }
    })
  }
})

describe('the stdio probe time (T3) and close() during a probe (T5)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('falls back to initialize when the probe time runs out, and drops the late discover answer', async () => {
    const { line, transport } = open('stdio', {
      'server/discover': [{ kind: 'silent' }],
      initialize: [LEGACY],
      'tools/list': [result({ tools: [] })],
    })
    const pending = transport.discover()
    await untilSent(line, 'server/discover')
    await new Promise(resolve => setTimeout(resolve, 70))
    const identity = ok(await pending, 'discover')
    expect(identity.protocolVersion).toBe(OFFERED_LEGACY_VERSION)
    // The late answer to the probe is a line about no request in flight: dropped.
    const probe = line.requests('server/discover')[0]?.message['id']
    line.push({
      jsonrpc: '2.0',
      id: probe ?? null,
      result: { supportedVersions: VERSIONS, capabilities: {} },
    })
    await tick()
    expect(ok(await transport.listActions(), 'listActions')).toEqual({ tools: [] })
    await transport.close()
  })

  it('close() while the probe is in flight answers no-answer (abandoned) and sends no initialize (F5)', async () => {
    const { line, transport } = open('stdio', {
      'server/discover': [{ kind: 'silent' }],
      initialize: [LEGACY],
    })
    const pending = transport.discover()
    await untilSent(line, 'server/discover')
    await transport.close()
    expect(await pending).toEqual({ failure: { kind: 'no-answer', cause: 'abandoned' } })
    expect(line.requests('initialize')).toEqual([])
    expect(line.closeCount).toBe(1)
  })

  it('a probe answer that comes before the time ran out clears it', async () => {
    const { transport } = open('stdio', {}, { probeTimeoutMs: 10_000 })
    expect(ok(await transport.discover(), 'discover').protocolVersion).toBe(HIGHEST)
    await transport.close()
  })
})

describe('the requests and notifications of the peer (T3)', () => {
  it('answers ping with an empty result and any other request with -32601, with the version header', async () => {
    const { line, transport } = open('streamable-http', {})
    ok(await transport.discover(), 'discover')
    line.sse = false
    line.push({ jsonrpc: '2.0', id: 9, method: 'ping' })
    line.push({ jsonrpc: '2.0', id: 'q', method: 'roots/list' })
    await tick()
    const responses = line.sent.filter(entry => entry.message['method'] === undefined)
    expect(responses.map(entry => entry.message)).toEqual([
      { jsonrpc: '2.0', id: 9, result: {} },
      { jsonrpc: '2.0', id: 'q', error: { code: -32601, message: 'Method not found' } },
    ])
    expect(responses[0]?.headers['mcp-protocol-version']).toBe(HIGHEST)
    expect(responses[0]?.headers['mcp-method']).toBeUndefined()
    await transport.close()
  })

  it('routes a progress notification to the observer of the call whose token it carries, untrusted as written', async () => {
    const { line, transport } = open('stdio', { 'tools/call': [{ kind: 'silent' }] })
    const seen: unknown[] = []
    const sent = ok(
      await transport.call(echo, never, notification => seen.push(notification)),
      'call',
    )
    line.push({
      jsonrpc: '2.0',
      method: 'notifications/progress',
      params: { progressToken: sent.requestId, progress: 1 },
    })
    line.push({
      jsonrpc: '2.0',
      method: 'notifications/progress',
      params: { progressToken: 'other', progress: 2 },
    })
    line.push({ jsonrpc: '2.0', method: 'notifications/message', params: { level: 'info' } })
    await tick()
    expect(seen).toEqual([
      {
        kind: 'progress',
        notification: { untrusted: jsonOf({ progressToken: sent.requestId, progress: 1 }) },
      },
    ])
    await transport.close()
  })

  it('an observer that throws does not change the outcome (S6)', async () => {
    const { line, transport } = open('stdio', { 'tools/call': [{ kind: 'silent' }] })
    const sent = ok(
      await transport.call(echo, never, () => {
        throw new Error('observer broke')
      }),
      'call',
    )
    line.push({
      jsonrpc: '2.0',
      method: 'notifications/progress',
      params: { progressToken: sent.requestId },
    })
    line.push({ jsonrpc: '2.0', id: sent.requestId, result: { content: [] } })
    expect(await sent.answer).toEqual({ kind: 'result', result: jsonOf({ content: [] }) })
    await transport.close()
  })

  it('drops a stdio line that is not JSON and the answer still arrives (F4)', async () => {
    const { line, transport } = open('stdio', { 'tools/list': [{ kind: 'silent' }] })
    const pending = transport.listActions()
    await untilSent(line, 'tools/list')
    line.pushText('Listening on stdio')
    line.pushText('')
    const id = line.requests('tools/list')[0]?.message['id']
    line.push({ jsonrpc: '2.0', id: id ?? null, result: { tools: [] } })
    expect(ok(await pending, 'listActions')).toEqual({ tools: [] })
    await transport.close()
  })
})

describe('the legacy HTTP+SSE mode (T3)', () => {
  const sseScript: Script = {
    'server/discover': [METHOD_NOT_FOUND],
    initialize: [status(404, '<html>not found</html>'), LEGACY],
  }

  it('after initialize is answered 4xx+plain, enters the SSE mode, sends initialize again, and reads the answer from the stream', async () => {
    const { line, transport, credential } = open('streamable-http', sseScript, {
      sse: { kind: 'entered' },
    })
    const identity = ok(await transport.discover(), 'discover')
    expect(identity.protocolVersion).toBe(OFFERED_LEGACY_VERSION)
    expect(line.requests('initialize')).toHaveLength(2)
    expect(line.sseAttempts).toHaveLength(1)
    expect(line.sseAttempts[0]?.get('mcp-protocol-version')).toBe(OFFERED_LEGACY_VERSION)
    expect(line.sseAttempts[0]?.get('authorization')).toBe('Bearer test-token')
    // The second initialize and the notification go to the endpoint without a session header.
    expect(line.requests('initialize')[1]?.headers['mcp-session-id']).toBeUndefined()
    expect(line.requests('notifications/initialized')).toHaveLength(1)
    expect(credential.authorizations()).toBe(5)
    await transport.close()
  })

  it('in the SSE mode a 2xx POST without an answer waits for the stream; the stream breaking fails every request in flight, no re-send, unusable', async () => {
    const { line, transport } = open(
      'streamable-http',
      { ...sseScript, 'tools/list': [{ kind: 'silent' }] },
      { sse: { kind: 'entered' } },
    )
    ok(await transport.discover(), 'discover')
    const listing = transport.listActions()
    await untilSent(line, 'tools/list')
    await tick()
    line.queue.push({ kind: 'broken' })
    expect(await listing).toEqual({ failure: STREAM_BROKEN })
    expect(line.requests('tools/list')).toHaveLength(1)
    expect(await transport.listActions()).toEqual({ failure: NOT_SENT })
    await transport.close()
  })

  it('in the SSE mode a 404 to a request after initialize ends the session (S07); initialize itself carries no session', async () => {
    const { line, transport } = open(
      'streamable-http',
      { ...sseScript, 'tools/list': [status(404, 'gone')] },
      { sse: { kind: 'entered' } },
    )
    ok(await transport.discover(), 'discover')
    expect(await transport.listActions()).toEqual({
      failure: { kind: 'not-sent', cause: 'session-ended' },
    })
    expect(await transport.getTask(taskIdOf('t1'))).toEqual({ failure: NOT_SENT })
    expect(line.requests('tools/list')).toHaveLength(1)
    await transport.close()
  })

  it('in the SSE mode cancelRequest sends notifications/cancelled', async () => {
    const { line, transport } = open(
      'streamable-http',
      { ...sseScript, 'tools/call': [{ kind: 'silent' }] },
      { sse: { kind: 'entered' } },
    )
    ok(await transport.discover(), 'discover')
    const sent = ok(await transport.call(echo, never), 'call')
    await transport.cancelRequest(sent.requestId)
    await untilSent(line, 'notifications/cancelled')
    expect(line.requests('notifications/cancelled')[0]?.message['params']).toMatchObject({
      requestId: sent.requestId,
    })
    await transport.close()
    expect(await sent.answer).toEqual({ kind: 'no-answer', cause: 'abandoned' })
  })

  it('the GET answered 401 is authorization-required with reportRejection once; another 403 is connection-unavailable', async () => {
    const refused = open('streamable-http', sseScript, {
      sse: {
        kind: 'status',
        status: 401,
        headers: { 'www-authenticate': 'Bearer scope="a"' },
        body: '',
      },
    })
    const failed = await refused.transport.discover()
    expect(
      'failure' in failed &&
        failed.failure.kind === 'not-sent' &&
        failed.failure.cause === 'authorization-required',
    ).toBe(true)
    expect(refused.credential.rejections()).toBe(1)
    await refused.transport.close()

    const forbidden = open('streamable-http', sseScript, {
      sse: { kind: 'status', status: 403, headers: {}, body: 'no' },
    })
    expect(await forbidden.transport.discover()).toEqual({ failure: NOT_SENT })
    expect(forbidden.credential.rejections()).toBe(0)
    await forbidden.transport.close()
  })

  it('a fallback that does not hold reports I07: not-sent (connection-unavailable), initialize sent once', async () => {
    for (const entry of [
      { kind: 'unavailable' },
      { kind: 'unsent' },
      { kind: 'status', status: 500, headers: {}, body: '' },
    ] as const) {
      const { line, transport } = open('streamable-http', sseScript, { sse: entry })
      expect(await transport.discover()).toEqual({ failure: NOT_SENT })
      expect(line.requests('initialize')).toHaveLength(1)
      expect(line.sseAttempts).toHaveLength(1)
      await transport.close()
    }
  })

  it('initialize answered 401, 5xx or 4xx with a JSON-RPC error does not try the fallback', async () => {
    for (const reply of [
      status(401, '', { 'www-authenticate': 'Bearer' }),
      status(503, 'down'),
      status(
        400,
        JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'bad' } }),
      ),
    ]) {
      const { line, transport } = open(
        'streamable-http',
        { 'server/discover': [METHOD_NOT_FOUND], initialize: [reply] },
        { sse: { kind: 'entered' } },
      )
      await transport.discover()
      expect(line.sseAttempts).toEqual([])
      await transport.close()
    }
  })
})

describe("the contract's classes decide, not a second reading (T2, T8 D05, D11, O03, C02)", () => {
  it('a -32022 whose supported list names a modern-looking text that is no date: answer-malformed (discover-shape), no legacy path (D05)', async () => {
    const { line, transport } = open('streamable-http', {
      'server/discover': [error(-32022, 'Unsupported', { supported: ['2027-01-01x'] })],
      initialize: [LEGACY],
    })
    expect(await transport.discover()).toEqual({
      failure: { kind: 'answer-malformed', what: 'discover-shape' },
    })
    expect(line.requests('initialize')).toEqual([])
    await transport.close()
  })

  it('a -32022 without the jsonrpc member is an unreadable error: the legacy path, no second probe, error-shape when the legacy path fails too (D11)', async () => {
    const supported = { supported: [HIGHEST] }
    const first = open('streamable-http', {
      'server/discover': [bareError(-32022, 'Unsupported', supported)],
      initialize: [LEGACY],
    })
    expect(ok(await first.transport.discover(), 'discover').protocolVersion).toBe(
      OFFERED_LEGACY_VERSION,
    )
    expect(first.line.requests('server/discover')).toHaveLength(1)
    await first.transport.close()

    const second = open('streamable-http', {
      'server/discover': [bareError(-32022, 'Unsupported', supported)],
      initialize: [LEGACY_BROKE],
    })
    expect(await second.transport.discover()).toEqual({
      failure: { kind: 'answer-malformed', what: 'error-shape' },
    })
    expect(second.line.requests('server/discover')).toHaveLength(1)
    await second.transport.close()
  })

  it('tools/list answered an error without the jsonrpc member: answer-malformed (error-shape) (O03)', async () => {
    const { transport } = open('stdio', { 'tools/list': [bareError(-32000, 'boom')] })
    expect(await transport.listActions()).toEqual({
      failure: { kind: 'answer-malformed', what: 'error-shape' },
    })
    await transport.close()
  })

  it('a call answered an error without the jsonrpc member: the whole message is the error (C02)', async () => {
    const { transport } = open('stdio', { 'tools/call': [bareError(-32000, 'boom')] })
    const sent = ok(await transport.call(echo, never), 'call')
    expect(await sent.answer).toEqual({
      kind: 'error',
      error: jsonOf({ id: sent.requestId, error: { code: -32000, message: 'boom' } }),
    })
    await transport.close()
  })
})

describe('what goes on the wire keeps its lexemes (RFC-0010, T3)', () => {
  it("writes the caller's values and the peer's request id as they are: an integer beyond 2^53 keeps its digits", async () => {
    const { line, transport } = open('stdio', {
      'tools/call': [{ kind: 'silent' }],
      'tasks/update': [result({})],
    })
    const args = jsonTextOf('{"id":1234567890123456789,"price":1.10}')
    ok(await transport.call({ action: actionNameOf('echo'), args }, never), 'call')
    expect(line.requests('tools/call')[0]?.text).toContain(
      '"arguments":{"id":1234567890123456789,"price":1.10}',
    )
    ok(
      await transport.updateTask(taskIdOf('t1'), jsonTextOf('{"n":1234567890123456789}')),
      'updateTask',
    )
    expect(line.requests('tasks/update')[0]?.text).toContain(
      '"inputResponses":{"n":1234567890123456789}',
    )
    line.pushText('{"jsonrpc":"2.0","id":1234567890123456789,"method":"ping"}')
    await tick()
    const response = line.sent.find(entry => entry.message['method'] === undefined)
    expect(response?.text).toContain('"id":1234567890123456789')
    await transport.close()
  })
})

describe('closing and the credential handle (T5, T9)', () => {
  it('answers a request of a protected peer with the credential on the response (T9)', async () => {
    const { line, transport, credential } = open('streamable-http', {})
    ok(await transport.discover(), 'discover')
    line.push({ jsonrpc: '2.0', id: 9, method: 'ping' })
    await tick()
    const response = line.sent.find(entry => entry.message['method'] === undefined)
    expect(response?.message).toEqual({ jsonrpc: '2.0', id: 9, result: {} })
    expect(response?.headers['authorization']).toBe('Bearer test-token')
    expect(credential.authorizations()).toBe(2)
    await transport.close()
  })

  it('close() while the metadata of a 401 is being fetched: the fetch ends, authorization-required with metadata unavailable, reportRejection once before close() returned', async () => {
    let fetching = (): void => undefined
    const started = new Promise<void>(resolve => {
      fetching = resolve
    })
    const { transport, credential } = open(
      'streamable-http',
      { 'tools/list': [status(401, '', { 'www-authenticate': 'Bearer realm="x"' })] },
      {
        fetchMetadata: (_url, signal) =>
          new Promise(resolve => {
            fetching()
            if (signal.aborted) resolve(undefined)
            signal.addEventListener('abort', () => resolve(undefined), { once: true })
          }),
      },
    )
    const pending = transport.listActions()
    await started
    let rejectionsAtClose = -1
    await transport.close().then(() => {
      rejectionsAtClose = credential.rejections()
    })
    expect(await settledWithin(pending)).toEqual({
      settled: {
        failure: {
          kind: 'not-sent',
          cause: 'authorization-required',
          discovery: {
            resourceMetadataUrl: 'https://peer.test/.well-known/oauth-protected-resource',
            metadata: 'unavailable',
            issuers: [],
            scopes: [],
          },
        },
      },
    })
    expect(rejectionsAtClose).toBe(1)
  })

  it("the call's signal while the metadata of a 401 is being fetched: the same conclusion, the fetch ended by the signal", async () => {
    let fetching = (): void => undefined
    const started = new Promise<void>(resolve => {
      fetching = resolve
    })
    const { transport, credential } = open(
      'streamable-http',
      { 'tools/call': [status(401, '', { 'www-authenticate': 'Bearer realm="x"' })] },
      {
        fetchMetadata: (_url, signal) =>
          new Promise(resolve => {
            fetching()
            if (signal.aborted) resolve(undefined)
            signal.addEventListener('abort', () => resolve(undefined), { once: true })
          }),
      },
    )
    const controller = new AbortController()
    const pending = transport.call(echo, controller.signal)
    await started
    controller.abort()
    expect(await settledWithin(pending)).toMatchObject({
      settled: {
        failure: {
          kind: 'not-sent',
          cause: 'authorization-required',
          discovery: { metadata: 'unavailable' },
        },
      },
    })
    expect(credential.rejections()).toBe(1)
    await transport.close()
  })

  it('a call still being authorized when close() ran is not-sent and never reaches the line', async () => {
    let release = (): void => undefined
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    const credential: HttpCredentialHandle = {
      purpose: 'http-authorization',
      async authorize() {
        await gate
        return { ok: true }
      },
      async reportRejection() {},
      async release() {},
    }
    const line = new MemoryLine('streamable-http', {})
    const transport = new Session(
      line,
      {
        kind: 'streamable-http',
        target,
        credential,
        generation: generationOf(1),
        instructionsByteLimit: 4096,
      },
      {
        clientInfo: { name: 'host', version: '1' },
        versions: VERSIONS,
        probeTimeoutMs: 50,
        fetchMetadata: async () => undefined,
        schedule,
        reportDefect,
      },
    )
    const pending = transport.call(echo, never)
    await transport.close()
    release()
    expect(await pending).toEqual({ failure: NOT_SENT })
    expect(line.sent).toEqual([])
  })

  it('a credential handle whose authorize rejects leaves the request not sent', async () => {
    const credential: HttpCredentialHandle = {
      purpose: 'http-authorization',
      async authorize() {
        throw new Error('vault down')
      },
      async reportRejection() {},
      async release() {},
    }
    const line = new MemoryLine('streamable-http', {})
    const transport = new Session(
      line,
      {
        kind: 'streamable-http',
        target,
        credential,
        generation: generationOf(1),
        instructionsByteLimit: 4096,
      },
      {
        clientInfo: { name: 'host', version: '1' },
        versions: VERSIONS,
        probeTimeoutMs: 50,
        fetchMetadata: async () => undefined,
        schedule,
        reportDefect,
      },
    )
    expect(await transport.discover()).toEqual({ failure: NOT_SENT })
    expect(line.sent).toEqual([])
    await transport.close()
  })

  it('a modern Streamable HTTP cancelRequest aborts the answer stream and sends no notification', async () => {
    const { line, transport } = open('streamable-http', { 'tools/call': [{ kind: 'silent' }] })
    const sent = ok(await transport.call(echo, never), 'call')
    await transport.cancelRequest(sent.requestId)
    expect(await sent.answer).toEqual({ kind: 'no-answer', cause: 'abandoned' })
    expect(line.aborted).toEqual([sent.requestId])
    expect(line.requests('notifications/cancelled')).toEqual([])
    await transport.close()
  })

  it('the metadata of a refused authorization is fetched at the path address first, then the root', async () => {
    const path = 'https://peer.test/.well-known/oauth-protected-resource/mcp'
    const root = 'https://peer.test/.well-known/oauth-protected-resource'
    metadata.clear()
    metadata.set(root, { authorization_servers: ['https://issuer.test'], scopes_supported: ['s'] })
    metadata.set(path, 'not an object')
    const { transport } = open('streamable-http', {
      'tools/list': [status(401, '', { 'www-authenticate': 'Bearer realm="x"' })],
    })
    const failed = await transport.listActions()
    expect(failed).toEqual({
      failure: {
        kind: 'not-sent',
        cause: 'authorization-required',
        discovery: {
          resourceMetadataUrl: root,
          metadata: 'fetched',
          resourceMetadata: {
            untrusted: jsonOf({
              authorization_servers: ['https://issuer.test'],
              scopes_supported: ['s'],
            }),
          },
          issuers: ['https://issuer.test'],
          scopes: ['s'],
        },
      },
    })
    await transport.close()
  })
})

/**
 * A gate that holds every authorization after the first `free` ones until `release()`. On a
 * connection that entered the SSE fallback, `discover()` asks for five: the probe, `initialize`,
 * the fallback GET, `initialize` again, and `notifications/initialized`; a `call` is the sixth.
 */
function holdAfter(
  free: number,
): Readonly<{ gate: Gate; release: () => void; reached: Promise<void> }> {
  let release = (): void => undefined
  const open = new Promise<void>(resolve => {
    release = resolve
  })
  // Resolves once the first held authorization arrived: the port was reached, not a timer.
  let arrived = (): void => undefined
  const reached = new Promise<void>(resolve => {
    arrived = resolve
  })
  return {
    gate: authorization => {
      if (authorization <= free) return undefined
      arrived()
      return open
    },
    release,
    reached,
  }
}

describe('what the signal of a call and close() end (T5)', () => {
  it('ends the write of a request whose answer head has not come, and the answer is abandoned', async () => {
    const closed = open('streamable-http', { 'tools/call': [{ kind: 'hang' }] })
    const calling = closed.transport.call(echo, never)
    await untilSent(closed.line, 'tools/call')
    await closed.transport.close()
    expect(closed.line.hungAborted).toEqual(['tools/call'])
    expect(await ok(await calling, 'call').answer).toEqual({
      kind: 'no-answer',
      cause: 'abandoned',
    })

    const signalled = open('streamable-http', { 'tools/call': [{ kind: 'hang' }] })
    const controller = new AbortController()
    const pending = signalled.transport.call(echo, controller.signal)
    await untilSent(signalled.line, 'tools/call')
    controller.abort()
    expect(await ok(await pending, 'call').answer).toEqual({
      kind: 'no-answer',
      cause: 'abandoned',
    })
    expect(signalled.line.hungAborted).toEqual(['tools/call'])
    await signalled.transport.close()
  })

  it('ends the answer stream of a request through the stream, whether the line watches the signal or not', async () => {
    const closing = open('streamable-http', { 'tools/call': [{ kind: 'deaf' }] })
    const first = ok(await closing.transport.call(echo, never), 'call')
    await closing.transport.close()
    expect(closing.line.streamAborted).toEqual([first.requestId])
    expect(await first.answer).toEqual({ kind: 'no-answer', cause: 'abandoned' })

    const signalled = open('streamable-http', { 'tools/call': [{ kind: 'deaf' }] })
    const controller = new AbortController()
    const second = ok(await signalled.transport.call(echo, controller.signal), 'call')
    controller.abort()
    expect(await second.answer).toEqual({ kind: 'no-answer', cause: 'abandoned' })
    expect(signalled.line.streamAborted).toEqual([second.requestId])
    await signalled.transport.close()
  })

  it('reads to its end the answer of a request that was abandoned while its write was in flight', async () => {
    const { line, transport } = open('streamable-http', { 'tools/call': [{ kind: 'late-stream' }] })
    const controller = new AbortController()
    const calling = transport.call(echo, controller.signal)
    await untilSent(line, 'tools/call')
    controller.abort()
    expect(await ok(await calling, 'call').answer).toEqual({
      kind: 'no-answer',
      cause: 'abandoned',
    })
    await tick()
    expect(line.drained).toBe(1)
    await transport.close()
  })

  it('does not send a call whose signal fired before it began; one that fires while it is authorized is not-sent, no SentCall (T5)', async () => {
    const early = open('streamable-http', {})
    expect(await early.transport.call(echo, AbortSignal.abort())).toEqual({ failure: NOT_SENT })
    expect(early.line.sent).toEqual([])
    await early.transport.close()

    const held = holdAfter(0)
    const { line, transport } = open('streamable-http', {}, { gate: held.gate })
    const controller = new AbortController()
    const calling = transport.call(echo, controller.signal)
    controller.abort()
    expect(await settledWithin(calling)).toEqual({ settled: { failure: NOT_SENT } })
    held.release()
    await tick()
    expect(line.sent).toEqual([])
    await transport.close()
  })

  it('leaves no listener on the signal of a call once the call has its answer', async () => {
    const { transport } = open('streamable-http', { 'tools/call': [result({ content: [] })] })
    const controller = new AbortController()
    const sent = ok(await transport.call(echo, controller.signal), 'call')
    await sent.answer
    await tick()
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0)
    await transport.close()
  })

  it('closes the line once however often close() runs', async () => {
    const { line, transport } = open('stdio', {})
    await transport.close()
    await transport.close()
    expect(line.closeCount).toBe(1)
  })

  it('ends a notification that is still being written when close() runs', async () => {
    const { line, transport } = open(
      'streamable-http',
      {
        'server/discover': [METHOD_NOT_FOUND],
        initialize: [LEGACY],
        'tools/call': [{ kind: 'silent' }],
        'notifications/cancelled': [{ kind: 'hang' }],
      },
      {},
    )
    ok(await transport.discover(), 'discover')
    const sent = ok(await transport.call(echo, never), 'call')
    const cancelling = transport.cancelRequest(sent.requestId)
    await untilSent(line, 'notifications/cancelled')
    await transport.close()
    await cancelling
    expect(line.hungAborted).toEqual(['notifications/cancelled'])
  })

  it('close() settles a request in the authorization discovery there and then, closes the line, and does not wait for the metadata fetch it ended', async () => {
    const order: string[] = []
    const fetching = deferred()
    const metadataEnded = deferred()
    const { line, transport } = open(
      'streamable-http',
      { 'tools/list': [status(401, '', { 'www-authenticate': 'Bearer realm="x"' })] },
      {
        fetchMetadata: (_url, signal) =>
          new Promise(resolve => {
            fetching.resolve()
            signal.addEventListener(
              'abort',
              () =>
                setTimeout(() => {
                  order.push('metadata-ended')
                  resolve(undefined)
                  metadataEnded.resolve()
                }, 30),
              { once: true },
            )
          }),
      },
    )
    const closeLine = line.close.bind(line)
    line.close = async () => {
      order.push('line-closed')
      await closeLine()
    }
    const listing = transport.listActions()
    await fetching.promise
    await transport.close()
    expect(order).toEqual(['line-closed'])
    expect(await settledWithin(listing)).toMatchObject({
      settled: {
        failure: { cause: 'authorization-required', discovery: { metadata: 'unavailable' } },
      },
    })
    // The fetch the signal ended comes back later; its result has nowhere to go.
    await metadataEnded.promise
    expect(order).toEqual(['line-closed', 'metadata-ended'])
  })
})

describe('a session that cannot be used any more sends nothing and asks no credential (T5, T9)', () => {
  const scripts: Script = {
    'server/discover': [METHOD_NOT_FOUND],
    initialize: [status(404, '<html>not found</html>'), LEGACY],
    'tools/call': [{ kind: 'silent' }],
  }

  it('does not send a request after close(), whichever request it is', async () => {
    for (const kind of ['stdio', 'streamable-http'] as const) {
      const { line, transport, credential } = open(kind, {})
      ok(await transport.discover(), 'discover')
      await transport.close()
      const sentBefore = line.sent.length
      const authorizedBefore = credential.authorizations()
      expect(await transport.call(echo, never), kind).toEqual({ failure: NOT_SENT })
      expect(await transport.listActions(), kind).toEqual({ failure: NOT_SENT })
      expect(await transport.getTask(taskIdOf('t')), kind).toEqual({ failure: NOT_SENT })
      expect(await transport.cancelTask(taskIdOf('t')), kind).toEqual({ failure: NOT_SENT })
      expect(await transport.discover(), kind).toEqual({ failure: NOT_SENT })
      await transport.cancelRequest('r1')
      expect(line.sent.length, kind).toBe(sentBefore)
      expect(credential.authorizations(), kind).toBe(authorizedBefore)
    }
  })

  it('does not answer the peer or notify it once the shared stream is gone, and does not ask the credential', async () => {
    const { line, transport, credential } = open('streamable-http', scripts, {
      sse: { kind: 'entered' },
    })
    ok(await transport.discover(), 'discover')
    const sent = ok(await transport.call(echo, never), 'call')
    line.queue.push({ kind: 'broken' })
    expect(await sent.answer).toEqual({ kind: 'no-answer', cause: 'stream-broken' })
    const sentBefore = line.sent.length
    const authorizedBefore = credential.authorizations()
    line.push({ jsonrpc: '2.0', id: 9, method: 'ping' })
    await tick()
    await transport.cancelRequest(sent.requestId)
    await tick()
    expect(line.sent.length).toBe(sentBefore)
    expect(credential.authorizations()).toBe(authorizedBefore)
    await transport.close()
  })

  it('writes no answer to the peer and no notification when the stream is gone while the credential is being asked', async () => {
    const held = holdAfter(6)
    const { line, transport } = open('streamable-http', scripts, {
      sse: { kind: 'entered' },
      gate: held.gate,
    })
    ok(await transport.discover(), 'discover')
    const sent = ok(await transport.call(echo, never), 'call')
    const sentBefore = line.sent.length
    line.push({ jsonrpc: '2.0', id: 9, method: 'ping' })
    const cancelling = transport.cancelRequest(sent.requestId)
    await tick()
    line.queue.push({ kind: 'broken' })
    await tick()
    held.release()
    await cancelling
    await tick()
    expect(line.sent.length).toBe(sentBefore)
    await transport.close()
  })

  it('answers a request that was being authorized when the stream died with not-sent, and never sends it', async () => {
    const held = holdAfter(5)
    const { line, transport } = open('streamable-http', scripts, {
      sse: { kind: 'entered' },
      gate: held.gate,
    })
    ok(await transport.discover(), 'discover')
    const calling = transport.call(echo, never)
    await tick()
    line.queue.push({ kind: 'broken' })
    await tick()
    held.release()
    expect(await calling).toEqual({ failure: NOT_SENT })
    expect(line.requests('tools/call')).toEqual([])
    await transport.close()
  })

  it('does not open the fallback stream when close() ran while its authorization was being asked', async () => {
    const held = holdAfter(2)
    const { line, transport } = open(
      'streamable-http',
      { 'server/discover': [METHOD_NOT_FOUND], initialize: [status(404, 'gone'), LEGACY] },
      { sse: { kind: 'entered' }, gate: held.gate },
    )
    const discovering = transport.discover()
    await untilSent(line, 'initialize')
    await tick()
    await tick()
    await transport.close()
    held.release()
    expect(await discovering).toEqual({ failure: NOT_SENT })
    expect(line.sseAttempts).toEqual([])
  })

  it('turns down the fallback stream that came back after close() ran', async () => {
    let release = (): void => undefined
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    const { line, transport } = open(
      'streamable-http',
      { 'server/discover': [METHOD_NOT_FOUND], initialize: [status(404, 'gone'), LEGACY] },
      { sse: { kind: 'entered', gate } },
    )
    const discovering = transport.discover()
    for (let round = 0; round < 200 && line.sseAttempts.length === 0; round += 1) await tick()
    expect(line.sseAttempts).toHaveLength(1)
    await transport.close()
    release()
    expect(await discovering).toEqual({ failure: NOT_SENT })
    expect(line.discarded).toBe(1)
    expect(line.sse).toBe(false)
  })

  it('leaves another request of the session in flight when one is told the session ended (S07)', async () => {
    const { line, transport } = open(
      'streamable-http',
      { ...scripts, 'tools/list': [status(404, 'gone')] },
      { sse: { kind: 'entered' } },
    )
    ok(await transport.discover(), 'discover')
    const other = ok(await transport.call(echo, never), 'call')
    expect(await transport.listActions()).toEqual({
      failure: { kind: 'not-sent', cause: 'session-ended' },
    })
    expect(await settledWithin(other.answer, 30)).toBe('pending')
    await transport.close()
    expect(await other.answer).toEqual({ kind: 'no-answer', cause: 'abandoned' })
    expect(line.requests('tools/list')).toHaveLength(1)
  })
})

/**
 * A gate that never opens: the port hangs. The caller must not wait for it (T5): the signal and
 * `close()` settle what the caller can see; the hung port call is the session's background work.
 */
const HANG: Gate = () => new Promise<void>(() => undefined)

describe('the caller waits on the settlement, never on a port (T5): hung credential handle and metadata', () => {
  it("authorize never answers: the call's signal settles call() with not-sent, and nothing reaches the line", async () => {
    const { line, transport } = open('streamable-http', {}, { gate: HANG })
    const controller = new AbortController()
    const calling = transport.call(echo, controller.signal)
    await tick()
    controller.abort()
    expect(await settledWithin(calling)).toEqual({ settled: { failure: NOT_SENT } })
    expect(line.sent).toEqual([])
    expect(await settledWithin(transport.close())).toEqual({ settled: undefined })
  })

  it('authorize never answers: close() settles listActions() with not-sent and returns', async () => {
    const { line, transport, credential } = open('streamable-http', {}, { gate: HANG })
    const listing = transport.listActions()
    await tick()
    expect(credential.authorizations()).toBe(1)
    expect(await settledWithin(transport.close())).toEqual({ settled: undefined })
    expect(await settledWithin(listing)).toEqual({ settled: { failure: NOT_SENT } })
    expect(line.sent).toEqual([])
  })

  it('reportRejection never answers after a 401: close() returns at once and the request is authorization-required with what was fetched', async () => {
    const credential = countingCredential()
    const hanging: HttpCredentialHandle & typeof credential = {
      ...credential,
      reportRejection: () => {
        credential.reportRejection()
        return new Promise<void>(() => undefined)
      },
    }
    const line = new MemoryLine('streamable-http', {
      'tools/list': [status(401, '', { 'www-authenticate': 'Bearer realm="x"' })],
    })
    const transport = new Session(
      line,
      {
        kind: 'streamable-http',
        target,
        credential: hanging,
        generation: generationOf(1),
        instructionsByteLimit: 4096,
      },
      {
        clientInfo: { name: 'host', version: '1' },
        versions: VERSIONS,
        probeTimeoutMs: 50,
        fetchMetadata: async () => undefined,
        schedule,
        reportDefect,
      },
    )
    const listing = transport.listActions()
    await credential.rejected
    expect(credential.rejections()).toBe(1)
    expect(await settledWithin(transport.close())).toEqual({ settled: undefined })
    expect(await settledWithin(listing)).toEqual({
      settled: {
        failure: {
          kind: 'not-sent',
          cause: 'authorization-required',
          discovery: {
            resourceMetadataUrl: 'https://peer.test/.well-known/oauth-protected-resource',
            metadata: 'unavailable',
            issuers: [],
            scopes: [],
          },
        },
      },
    })
  })

  it("reportRejection never answers after a 401 to a call: the call's signal settles call() with authorization-required", async () => {
    const credential = countingCredential()
    const hanging: HttpCredentialHandle & typeof credential = {
      ...credential,
      reportRejection: () => {
        credential.reportRejection()
        return new Promise<void>(() => undefined)
      },
    }
    const line = new MemoryLine('streamable-http', {
      'tools/call': [status(401, '', { 'www-authenticate': 'Bearer realm="x"' })],
    })
    const transport = new Session(
      line,
      {
        kind: 'streamable-http',
        target,
        credential: hanging,
        generation: generationOf(1),
        instructionsByteLimit: 4096,
      },
      {
        clientInfo: { name: 'host', version: '1' },
        versions: VERSIONS,
        probeTimeoutMs: 50,
        fetchMetadata: async () => undefined,
        schedule,
        reportDefect,
      },
    )
    const controller = new AbortController()
    const calling = transport.call(echo, controller.signal)
    await credential.rejected
    controller.abort()
    expect(await settledWithin(calling)).toMatchObject({
      settled: { failure: { kind: 'not-sent', cause: 'authorization-required' } },
    })
    expect(credential.rejections()).toBe(1)
    await transport.close()
  })

  it('authorize never answers: cancelRequest on a legacy Streamable HTTP connection returns at once', async () => {
    // The legacy path authorizes the probe, `initialize` and `notifications/initialized`; the call
    // is the fourth authorization; the cancel notification, the fifth, hangs.
    const held = holdAfter(4)
    const { line, transport } = open(
      'streamable-http',
      {
        'server/discover': [METHOD_NOT_FOUND],
        initialize: [LEGACY],
        'tools/call': [{ kind: 'silent' }],
      },
      { gate: held.gate },
    )
    ok(await transport.discover(), 'discover')
    const sent = ok(await transport.call(echo, never), 'call')
    expect(await settledWithin(transport.cancelRequest(sent.requestId))).toEqual({
      settled: undefined,
    })
    expect(line.requests('notifications/cancelled')).toEqual([])
    await transport.close()
    expect(await sent.answer).toEqual({ kind: 'no-answer', cause: 'abandoned' })
  })

  it('authorize never answers: close() settles a discover that waits to authorize the fallback GET', async () => {
    // The probe and `initialize` are authorized; the GET of the fallback, the third, hangs.
    const held = holdAfter(2)
    const { line, transport } = open(
      'streamable-http',
      {
        'server/discover': [METHOD_NOT_FOUND],
        initialize: [status(404, '<html>not found</html>')],
      },
      { sse: { kind: 'entered' }, gate: held.gate },
    )
    const discovering = transport.discover()
    await held.reached
    expect(line.sseAttempts).toEqual([])
    expect(await settledWithin(transport.close())).toEqual({ settled: undefined })
    expect(await settledWithin(discovering)).toEqual({ settled: { failure: NOT_SENT } })
    expect(line.sseAttempts).toEqual([])
  })

  it('a metadata fetch that throws at every address counts as nothing fetched (R4): authorization-required with the metadata unavailable, reportRejection once', async () => {
    const { transport, credential } = open(
      'streamable-http',
      { 'tools/list': [status(401, '', { 'www-authenticate': 'Bearer realm="x"' })] },
      {
        fetchMetadata: () => {
          throw new Error('the fetch port is broken')
        },
      },
    )
    expect(await settledWithin(transport.listActions())).toEqual({
      settled: {
        failure: {
          kind: 'not-sent',
          cause: 'authorization-required',
          discovery: {
            resourceMetadataUrl: 'https://peer.test/.well-known/oauth-protected-resource',
            metadata: 'unavailable',
            issuers: [],
            scopes: [],
          },
        },
      },
    })
    expect(credential.rejections()).toBe(1)
    await transport.close()
  })

  it('two callers closing at once both return after the line closed, from the one close', async () => {
    const { line, transport } = open('stdio', {})
    let release = (): void => undefined
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    const closeLine = line.close.bind(line)
    line.close = async () => {
      await gate
      await closeLine()
    }
    const first = transport.close()
    const second = transport.close()
    expect(await settledWithin(first, 30)).toBe('pending')
    expect(await settledWithin(second, 30)).toBe('pending')
    release()
    expect(await settledWithin(first)).toEqual({ settled: undefined })
    expect(await settledWithin(second)).toEqual({ settled: undefined })
    expect(line.closeCount).toBe(1)
  })
})

describe('cancelling a request, and the probe timer (T3, T5)', () => {
  it('sends notifications/cancelled on stdio and on a legacy Streamable HTTP connection and leaves the request waiting for its answer', async () => {
    for (const kind of ['stdio', 'streamable-http'] as const) {
      const { line, transport } = open(kind, {
        'server/discover': [METHOD_NOT_FOUND],
        initialize: [LEGACY],
        'tools/call': [{ kind: 'silent' }],
      })
      ok(await transport.discover(), 'discover')
      const sent = ok(await transport.call(echo, never), 'call')
      await transport.cancelRequest(sent.requestId)
      await untilSent(line, 'notifications/cancelled')
      expect(line.requests('notifications/cancelled')[0]?.message['params'], kind).toMatchObject({
        requestId: sent.requestId,
      })
      expect(await settledWithin(sent.answer, 30), kind).toBe('pending')
      expect(line.aborted, kind).toEqual([])
      await transport.close()
      expect(await sent.answer, kind).toEqual({ kind: 'no-answer', cause: 'abandoned' })
    }
  })

  it('sends notifications/cancelled on stdio on the modern revision too, with the _meta of the revision', async () => {
    const { line, transport } = open('stdio', { 'tools/call': [{ kind: 'silent' }] })
    ok(await transport.discover(), 'discover')
    const sent = ok(await transport.call(echo, never), 'call')
    await transport.cancelRequest(sent.requestId)
    await untilSent(line, 'notifications/cancelled')
    expect(line.requests('notifications/cancelled')[0]?.message['params']).toMatchObject({
      requestId: sent.requestId,
      _meta: { 'io.modelcontextprotocol/protocolVersion': HIGHEST },
    })
    expect(await settledWithin(sent.answer, 30)).toBe('pending')
    await transport.close()
  })

  it('starts a probe timer for the probe only, and clears it when the probe is answered', async () => {
    const timers: { delayMs: number; cleared: boolean }[] = []
    const { line, transport } = open(
      'stdio',
      { 'tools/call': [{ kind: 'silent' }] },
      {
        probeTimeoutMs: 777,
        schedule: delayMs => {
          const timer = { delayMs, cleared: false }
          timers.push(timer)
          return () => {
            timer.cleared = true
          }
        },
      },
    )
    ok(await transport.discover(), 'discover')
    expect(timers).toEqual([{ delayMs: 777, cleared: true }])
    const sent = ok(await transport.call(echo, never), 'call')
    await untilSent(line, 'tools/call')
    expect(timers).toHaveLength(1)
    await transport.cancelRequest(sent.requestId)
    await transport.close()
  })
})

/** A promise and the function that resolves it. */
function deferred<T = void>(): Readonly<{ promise: Promise<T>; resolve: (value: T) => void }> {
  const { promise, resolve } = Promise.withResolvers<T>()
  return { promise, resolve }
}

describe('the line going away settles a request by its phase (T8 S01–S04, S07, the SSE mode)', () => {
  const sseScripts: Script = {
    'server/discover': [METHOD_NOT_FOUND],
    initialize: [status(404, '<html>not found</html>'), LEGACY],
    'tools/call': [{ kind: 'silent' }],
  }

  it('a request still being authorized when the session ended (S07) is not-sent and never reaches the line', async () => {
    // The legacy path authorizes the probe, `initialize` and `notifications/initialized`; the
    // listing is the fourth authorization; the call, the fifth, is held until the 404 came back.
    const held = holdAfter(4)
    const { line, transport } = open(
      'streamable-http',
      {
        ...SESSION_SCRIPT,
        'tools/list': [status(404, 'gone')],
        'tools/call': [{ kind: 'silent' }],
      },
      { gate: held.gate },
    )
    ok(await transport.discover(), 'discover')
    const listing = transport.listActions()
    const calling = transport.call(echo, never)
    await held.reached
    expect(await listing).toEqual({ failure: { kind: 'not-sent', cause: 'session-ended' } })
    held.release()
    expect(await settledWithin(calling)).toEqual({ settled: { failure: NOT_SENT } })
    expect(line.requests('tools/call')).toEqual([])
    expect(await transport.listActions()).toEqual({ failure: NOT_SENT })
    await transport.close()
  })

  it('the process exiting settles a request still being authorized with not-sent, and never sends it', async () => {
    const held = holdAfter(5)
    const { line, transport } = open('streamable-http', sseScripts, {
      sse: { kind: 'entered' },
      gate: held.gate,
    })
    ok(await transport.discover(), 'discover')
    const calling = transport.call(echo, never)
    await held.reached
    // The session settles by the event, whichever line reported it.
    line.queue.push({ kind: 'ended', stdoutEndedAt: 0, exitedAt: 0 })
    await tick()
    held.release()
    expect(await settledWithin(calling)).toEqual({ settled: { failure: NOT_SENT } })
    expect(line.requests('tools/call')).toEqual([])
    expect(await transport.listActions()).toEqual({ failure: NOT_SENT })
    await transport.close()
  })

  it('a request in the authorization discovery is not settled by the shared stream breaking: it ends authorization-required when the discovery ends', async () => {
    const root = 'https://peer.test/.well-known/oauth-protected-resource'
    const fetching = deferred<string>()
    const found = deferred<PlainJson | undefined>()
    const { line, transport, credential } = open(
      'streamable-http',
      { ...sseScripts, 'tools/list': [status(401, '', { 'www-authenticate': 'Bearer' })] },
      {
        sse: { kind: 'entered' },
        fetchMetadata: url => {
          fetching.resolve(url)
          return found.promise.then(document =>
            document === undefined ? undefined : jsonOf(document),
          )
        },
      },
    )
    ok(await transport.discover(), 'discover')
    const listing = transport.listActions()
    await credential.rejected
    await fetching.promise
    line.queue.push({ kind: 'broken' })
    await tick()
    found.resolve({ authorization_servers: ['https://issuer.test'] })
    expect(await settledWithin(listing)).toMatchObject({
      settled: {
        failure: {
          kind: 'not-sent',
          cause: 'authorization-required',
          discovery: { metadata: 'fetched', issuers: ['https://issuer.test'] },
        },
      },
    })
    expect(credential.rejections()).toBe(1)
    expect(await transport.listActions()).toEqual({ failure: NOT_SENT })
    expect(await settledWithin(transport.close())).toEqual({ settled: undefined })
    void root
  })
})

describe('an answer on the shared stream reaches a request only once it was handed to the line (T5: the first event decides)', () => {
  const sseScripts: Script = {
    'server/discover': [METHOD_NOT_FOUND],
    initialize: [status(404, '<html>not found</html>'), LEGACY],
  }

  it('an answer for a request number that was not written yet does not settle it: the request goes out and waits for its own answer', async () => {
    const held = holdAfter(5)
    const { line, transport } = open(
      'streamable-http',
      { ...sseScripts, 'tools/call': [{ kind: 'silent' }] },
      { sse: { kind: 'entered' }, gate: held.gate },
    )
    ok(await transport.discover(), 'discover')
    const calling = transport.call(echo, never)
    await held.reached
    // The ids are predictable: the probe, two `initialize`s, then this call: `r4`.
    line.push({ jsonrpc: '2.0', id: 'r4', result: { content: [] } })
    await tick()
    held.release()
    await untilSent(line, 'tools/call')
    const sent = ok(await calling, 'call')
    expect(sent.requestId).toBe('r4')
    expect(line.requests('tools/call')).toHaveLength(1)
    line.push({ jsonrpc: '2.0', id: 'r4', result: { content: [{ type: 'text', text: 'late' }] } })
    expect(await settledWithin(sent.answer)).toEqual({
      settled: { kind: 'result', result: jsonOf({ content: [{ type: 'text', text: 'late' }] }) },
    })
    await transport.close()
  })

  it('a request refused with 401 keeps that conclusion when the shared stream later carries an answer with its id', async () => {
    const fetching = deferred<string>()
    const found = deferred<undefined>()
    const { line, transport, credential } = open(
      'streamable-http',
      { ...sseScripts, 'tools/list': [status(401, '', { 'www-authenticate': 'Bearer' })] },
      {
        sse: { kind: 'entered' },
        fetchMetadata: url => {
          fetching.resolve(url)
          return found.promise
        },
      },
    )
    ok(await transport.discover(), 'discover')
    const listing = transport.listActions()
    await credential.rejected
    await fetching.promise
    const id = line.requests('tools/list')[0]?.message['id']
    line.push({ jsonrpc: '2.0', id: id ?? null, result: { tools: [] } })
    await tick()
    found.resolve(undefined)
    expect(await settledWithin(listing)).toMatchObject({
      settled: { failure: { kind: 'not-sent', cause: 'authorization-required' } },
    })
    expect(credential.rejections()).toBe(1)
    await transport.close()
  })
})

describe('the metadata fetch of a refused authorization (R4, T9)', () => {
  const path = 'https://peer.test/.well-known/oauth-protected-resource/mcp'
  const root = 'https://peer.test/.well-known/oauth-protected-resource'
  const refused: Script = {
    'tools/list': [status(401, '', { 'www-authenticate': 'Bearer realm="x"' })],
  }

  it('a fetch that throws at one address counts as nothing fetched there; the next address is tried', async () => {
    const fetched: string[] = []
    const { transport } = open('streamable-http', refused, {
      fetchMetadata: url => {
        fetched.push(url)
        if (url === path) throw new Error('the fetch port broke')
        return Promise.resolve(jsonOf({ authorization_servers: ['https://issuer.test'] }))
      },
    })
    expect(await settledWithin(transport.listActions())).toMatchObject({
      settled: {
        failure: {
          kind: 'not-sent',
          cause: 'authorization-required',
          discovery: {
            resourceMetadataUrl: root,
            metadata: 'fetched',
            issuers: ['https://issuer.test'],
          },
        },
      },
    })
    expect(fetched).toEqual([path, root])
    await transport.close()
  })

  it("no fetch starts after the call's signal fired; the one in flight is let go and its result dropped", async () => {
    const fetched: string[] = []
    const started = deferred()
    const ended = deferred()
    const { transport } = open(
      'streamable-http',
      { 'tools/call': [status(401, '', { 'www-authenticate': 'Bearer realm="x"' })] },
      {
        fetchMetadata: (url, signal) => {
          fetched.push(url)
          started.resolve()
          // A fetch that honours the abort late: it answers after the signal, with a document.
          return new Promise(resolve => {
            signal.addEventListener(
              'abort',
              () =>
                setTimeout(() => {
                  resolve(jsonOf({ authorization_servers: ['https://late.test'] }))
                  ended.resolve()
                }, 10),
              { once: true },
            )
          })
        },
      },
    )
    const controller = new AbortController()
    const calling = transport.call(echo, controller.signal)
    await started.promise
    controller.abort()
    expect(await settledWithin(calling)).toMatchObject({
      settled: {
        failure: {
          kind: 'not-sent',
          cause: 'authorization-required',
          discovery: { metadata: 'unavailable', issuers: [] },
        },
      },
    })
    await ended.promise
    await tick()
    expect(fetched).toEqual([path])
    await transport.close()
  })
})

describe('a defect of the session goes to the defect outlet (DP-06): the request settles by its phase', () => {
  type Defects = Readonly<{ seen: unknown[]; reportDefect: SessionOptions['reportDefect'] }>
  const defects = (): Defects => {
    const seen: unknown[] = []
    return { seen, reportDefect: defect => seen.push(defect) }
  }

  it('a scheduler that throws: the probe it was armed for is abandoned, discover reports no-answer, and the throw is reported once', async () => {
    const outlet = defects()
    const { line, transport } = open(
      'stdio',
      { 'server/discover': [{ kind: 'silent' }] },
      {
        reportDefect: outlet.reportDefect,
        schedule: () => {
          throw new Error('the timer port broke')
        },
      },
    )
    expect(await settledWithin(transport.discover())).toEqual({
      settled: { failure: { kind: 'no-answer', cause: 'abandoned' } },
    })
    expect(line.requests('server/discover')).toHaveLength(1)
    expect(outlet.seen.map(describeDefect)).toEqual(['Error: the timer port broke'])
    await transport.close()
  })

  it('a 2xx body that yields something that is not a message: the request is abandoned, not re-sent as a broken stream, and the throw is reported', async () => {
    const outlet = defects()
    const sent: string[] = []
    const line: Line = {
      kind: 'streamable-http',
      events: new AsyncQueue<LineEvent>(),
      async send(outbound) {
        sent.push(outbound.text)
        const messages = new AsyncQueue<string>()
        // The line breaks its own port: the body yields a number where a message text is due.
        messages.push(notAText())
        return { kind: 'stream', headers: {}, messages, abort: () => undefined }
      },
      async close() {},
    }
    const transport = new Session(
      line,
      {
        kind: 'stdio',
        process: idleProcess(),
        generation: generationOf(1),
        instructionsByteLimit: 4096,
      },
      {
        clientInfo: { name: 'host', version: '1' },
        versions: VERSIONS,
        probeTimeoutMs: 50,
        fetchMetadata: async () => undefined,
        schedule,
        reportDefect: outlet.reportDefect,
      },
    )
    expect(await settledWithin(transport.listActions())).toEqual({
      settled: { failure: { kind: 'no-answer', cause: 'abandoned' } },
    })
    expect(sent).toHaveLength(1)
    expect(outlet.seen.map(describeDefect)).toEqual(['TypeError: text must be a string'])
    await transport.close()
  })

  it('an event of the shared stream that is not a text: the throw is reported, the reading goes on, and the next line still answers', async () => {
    const outlet = defects()
    const { line, transport } = open(
      'stdio',
      { 'tools/list': [{ kind: 'silent' }] },
      { reportDefect: outlet.reportDefect },
    )
    const listing = transport.listActions()
    await untilSent(line, 'tools/list')
    line.queue.push({ kind: 'line', text: notAText() })
    const id = line.requests('tools/list')[0]?.message['id']
    line.push({ jsonrpc: '2.0', id: id ?? null, result: { tools: [] } })
    expect(await settledWithin(listing)).toEqual({ settled: { ok: { tools: [] } } })
    expect(outlet.seen.map(describeDefect)).toEqual(['TypeError: text must be a string'])
    await transport.close()
  })
})

/** A value the type calls text and is not one: what a line that breaks its port would hand over. */
function notAText(): string {
  const value: unknown = 42
  return value as string
}

function describeDefect(defect: unknown): string {
  return defect instanceof Error ? `${defect.name}: ${defect.message}` : String(defect)
}
