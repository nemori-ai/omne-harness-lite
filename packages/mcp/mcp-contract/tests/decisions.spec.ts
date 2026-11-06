// The decision layer of T8: for every cell of the table, the conclusion of the classification
// matches the row; and the readings, the probe, the discovery loop and the message texts that
// every transport takes from here.
import { describe, expect, it } from 'vitest'
import type { JsonValue } from '@omne-harness/json-text'
import type { Outcome } from '@omne-harness/operation-result'
import {
  ABANDONED,
  LEGACY_PROTOCOL_VERSIONS,
  OFFERED_LEGACY_VERSION,
  PROCESS_EXIT_WINDOW_MS,
  authorizationRequiredAnswerOf,
  callAnswerOf,
  callRequestOf,
  cancelTaskRequest,
  cancelsByNotification,
  checksListingHeaders,
  classifyWireEvent,
  clientEnvelopeOf,
  concludeAnswer,
  concludeProbe,
  discoverAuthorization,
  discoverWith,
  endedCauseOf,
  getTaskRequest,
  getTaskResultRequest,
  interpretAnswer,
  isLegacyConnection,
  legacyIdentityOf,
  legacyInitializeParamsOf,
  listActionsRequest,
  listingPageOf,
  notificationTextOf,
  peerRequestAnswerOf,
  readPeerMessage,
  readerOf,
  requestClassOf,
  requestMetaOf,
  requestTextOf,
  responseTextOf,
  retryVersionOf,
  startAuthorizationDiscovery,
  streamGoneAnswerOf,
  taskAnswerOf,
  taskReportOf,
  updateTaskRequest,
  withOneResend,
  type AnswerClass,
  type AnswerConclusion,
  type ConnectionView,
  type ErrorClass,
  type RequestClass,
  type WireAnswer,
  type WireClassification,
  type WireContext,
  type WireEvent,
} from '@omne-harness/mcp-contract'
import type { TransportFailure } from '@omne-harness/mcp-contract/provider'
import {
  TRANSPORT_TABLE,
  actionNameOf,
  cellsOf,
  generationOf,
  jsonOf,
  jsonTextOf,
  protocolVersionOf,
  requestStateOf,
  taskIdOf,
  type TableCell,
  type TableConclusion,
} from '@omne-harness/mcp-contract/testing'

const HIGHEST = '2026-07-28'
const VERSIONS = [HIGHEST] as const
const BOUND = { generation: generationOf(1), instructionsByteLimit: 4096 }
const NOT_SENT: TransportFailure = { kind: 'not-sent', cause: 'connection-unavailable' }

const context = (request: RequestClass, extra: Partial<WireContext> = {}): WireContext => ({
  id: 'r1',
  request,
  session: false,
  versions: VERSIONS,
  ...extra,
})

// ---- Samples, one per answer class ----

function errorObject(code: string): unknown {
  switch (code) {
    case '-32020':
      return { code: -32020, message: 'Header mismatch' }
    case '-32021':
      return { code: -32021, message: 'Missing required client capability' }
    case '-32022+common':
      return { code: -32022, message: 'x', data: { supported: ['2000-01-01', HIGHEST] } }
    case '-32022+modern':
      return { code: -32022, message: 'x', data: { supported: ['2099-01-01'] } }
    case '-32022+legacy':
      return { code: -32022, message: 'x', data: { supported: ['2025-06-18'] } }
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

function resultValue(request: RequestClass, answer: string): unknown {
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

/** The wire event of one cell, delivered on its material. */
function eventOf(cell: TableCell): WireEvent {
  const { request, answer } = cell
  const stdio = cell.kind === 'stdio'
  const message = (member: object): WireEvent => {
    const text = JSON.stringify({ jsonrpc: '2.0', id: 'r1', ...member })
    return stdio ? { kind: 'line', text } : { kind: 'http-stream', messages: [text], ended: true }
  }
  switch (answer) {
    case 'unsent':
      return { kind: 'unsent' }
    case 'silent':
      return { kind: 'nothing' }
    case 'stream-broken':
      return stdio ? { kind: 'stdio-ended', stdoutEndedAt: 0 } : { kind: 'http-aborted' }
    case 'process-exited':
      return { kind: 'stdio-ended', stdoutEndedAt: 0, exitedAt: 20 }
    case 'http:2xx':
      return { kind: 'http-stream', messages: [], ended: true }
    case 'http:401':
      return { kind: 'http-status', status: 401, headers: {}, body: '' }
    case 'http:403+scope':
      return {
        kind: 'http-status',
        status: 403,
        headers: { 'www-authenticate': 'Bearer error="insufficient_scope"' },
        body: '',
      }
    case 'http:403':
      return { kind: 'http-status', status: 403, headers: {}, body: 'no' }
    case 'http:404+session':
      return { kind: 'http-status', status: 404, headers: {}, body: '' }
    default: {
      const http = HTTP_ANSWER.exec(answer)
      if (http !== null) {
        const statusClass = http[1] ?? ''
        const status = STATUS_OF[statusClass] ?? Number(statusClass)
        const body = http[2] ?? ''
        const text =
          body === 'plain'
            ? `HTTP ${status}`
            : JSON.stringify({ jsonrpc: '2.0', id: null, error: errorObject(body) })
        return { kind: 'http-status', status, headers: {}, body: text }
      }
      if (answer.startsWith('error:'))
        return message({ error: errorObject(answer.slice('error:'.length)) })
      return message({ result: resultValue(request, answer) })
    }
  }
}

function conclusionOf(cell: TableCell): AnswerConclusion {
  const ctx = context(cell.request, { session: cell.answer === 'http:404+session' })
  return concludeAnswer(classifyWireEvent(eventOf(cell), ctx), ctx, cell.kind)
}

/** The reading of a settled answer for the request class, as the transport applies it. */
function readingOf(request: RequestClass, wire: WireAnswer): Outcome<unknown, TransportFailure> {
  switch (request) {
    case 'initialize':
      return legacyIdentityOf(wire, BOUND)
    case 'tools/list':
      return listingPageOf(wire, false)
    case 'tasks/get':
      return taskReportOf(wire)
    default:
      return interpretAnswer(wire, () => ({ ok: 'read' }))
  }
}

/** What the row says the request settles with, read through the layer for that request. */
function outcomeOf(
  cell: TableCell,
  conclusion: AnswerConclusion,
): Readonly<{ kind: string; detail?: unknown }> {
  if (conclusion.kind !== 'settle') return { kind: conclusion.kind }
  const { wire, unusable } = conclusion
  switch (cell.request) {
    case 'discover':
    case 'discover-retry': {
      const probe = concludeProbe(wire, cell.request, VERSIONS, BOUND)
      return { kind: probe.kind, detail: 'failure' in probe ? probe.failure : unusable }
    }
    case 'tools/call':
      return wire.kind === 'not-sent'
        ? { kind: 'failure', detail: wire.failure }
        : { kind: `answer:${callAnswerOf(wire).kind}`, detail: unusable }
    default: {
      const read = readingOf(cell.request, wire)
      if ('failure' in read) return { kind: 'failure', detail: read.failure }
      return read.ok === 'expired' ? { kind: 'expired' } : { kind: 'read', detail: unusable }
    }
  }
}

/** The row's conclusion in the same terms. */
function expectedOf(cell: TableCell, conclusion: TableConclusion): readonly unknown[] {
  const probe = cell.request === 'discover' || cell.request === 'discover-retry'
  const unusable = conclusion.unusable === true ? expect.anything() : undefined
  switch (conclusion.kind) {
    case 'read':
      return [{ kind: probe ? 'identity' : 'read', detail: unusable }]
    case 'retry':
      return [{ kind: 'retry', detail: undefined }]
    case 'fallback':
      return conclusion.report === 'legacy'
        ? [{ kind: 'legacy-peer', detail: unusable }]
        : [{ kind: 'fallback', detail: expect.objectContaining(conclusion.report) }]
    case 'resend':
      return [
        {
          kind: probe ? 'final' : 'failure',
          detail: { kind: 'no-answer', cause: 'stream-broken' },
        },
      ]
    case 'failure':
      if (
        conclusion.failure.kind === 'not-sent' &&
        conclusion.failure.cause === 'authorization-required'
      )
        return [{ kind: 'authorization-required' }]
      return [
        {
          kind: probe ? 'final' : 'failure',
          detail: expect.objectContaining(conclusion.failure),
        },
      ]
    case 'answer':
      return [
        {
          kind: `answer:${conclusion.answer === 'result' || conclusion.answer === 'error' ? conclusion.answer : 'no-answer'}`,
          detail: unusable,
        },
      ]
    case 'expired':
      return [{ kind: 'expired' }]
    case 'ignored':
      return []
    default: {
      const exhaustive: never = conclusion
      return exhaustive
    }
  }
}

describe('concludeAnswer holds every cell of T8', () => {
  for (const row of TRANSPORT_TABLE) {
    if (row.conclusion.kind === 'ignored') continue
    const cells = cellsOf(row)
    it(`${row.id}: ${cells.length} cells`, () => {
      for (const cell of cells) {
        const conclusion = conclusionOf(cell)
        const [expected] = expectedOf(cell, row.conclusion)
        expect(outcomeOf(cell, conclusion), `${cell.kind} ${cell.request} ${cell.answer}`).toEqual(
          expected,
        )
      }
    })
  }

  it('the rows that end the transport say so: stdio unsent and broken streams, the exit, the ended session', () => {
    const unusableOf = (cell: TableCell) => {
      const conclusion = conclusionOf(cell)
      return conclusion.kind === 'settle' ? conclusion.unusable : conclusion.kind
    }
    expect(unusableOf({ kind: 'stdio', request: 'tools/list', answer: 'unsent' })).toBe(
      'stream-broken',
    )
    expect(
      unusableOf({ kind: 'streamable-http', request: 'tools/list', answer: 'unsent' }),
    ).toBeUndefined()
    expect(unusableOf({ kind: 'stdio', request: 'tools/call', answer: 'stream-broken' })).toBe(
      'stream-broken',
    )
    expect(unusableOf({ kind: 'stdio', request: 'tools/call', answer: 'process-exited' })).toBe(
      'process-exited',
    )
    expect(
      unusableOf({ kind: 'streamable-http', request: 'tools/call', answer: 'http:404+session' }),
    ).toBe('session-ended')
  })

  it('re-sends a read request on Streamable HTTP after a broken stream, not a write, not on stdio, not in the SSE mode', () => {
    const resend = (
      request: RequestClass,
      kind: TableCell['kind'],
      extra: Partial<WireContext> = {},
    ) => {
      const ctx = context(request, extra)
      const conclusion = concludeAnswer(classifyWireEvent({ kind: 'http-aborted' }, ctx), ctx, kind)
      return (
        conclusion.kind === 'settle' &&
        conclusion.wire.kind === 'no-answer' &&
        conclusion.wire.resend
      )
    }
    expect(resend('tools/list', 'streamable-http')).toBe(true)
    expect(resend('discover-retry', 'streamable-http')).toBe(true)
    expect(resend('tasks/update', 'streamable-http')).toBe(false)
    expect(resend('tools/call', 'streamable-http')).toBe(false)
    expect(resend('tools/list', 'stdio')).toBe(false)
    expect(resend('tools/list', 'streamable-http', { mode: 'sse' })).toBe(false)
  })

  it('reads the error as written: the error member of a good envelope, the whole message of a bad one (C02)', () => {
    const ctx = context('tools/call')
    const good = JSON.stringify({
      jsonrpc: '2.0',
      id: 'r1',
      error: { code: -32000, message: 'boom' },
    })
    const bad = JSON.stringify({ id: 'r1', error: { code: -32000, message: 'boom' } })
    const wireOf = (text: string) => {
      const conclusion = concludeAnswer(
        classifyWireEvent({ kind: 'line', text }, ctx),
        ctx,
        'stdio',
      )
      return conclusion.kind === 'settle' ? conclusion.wire : undefined
    }
    expect(wireOf(good)).toEqual({
      kind: 'error',
      error: jsonOf({ code: -32000, message: 'boom' }),
      errorClass: 'other',
    })
    expect(wireOf(bad)).toEqual({ kind: 'error', error: jsonTextOf(bad), errorClass: 'unreadable' })
  })

  it('initialize answered 4xx+plain outside the SSE mode is the chance of the fallback; in the SSE mode it is not sent (I07)', () => {
    const event: WireEvent = { kind: 'http-status', status: 404, headers: {}, body: 'not found' }
    const wireOf = (extra: Partial<WireContext>) => {
      const ctx = context('initialize', extra)
      const conclusion = concludeAnswer(classifyWireEvent(event, ctx), ctx, 'streamable-http')
      return conclusion.kind === 'settle' ? conclusion.wire.kind : conclusion.kind
    }
    expect(wireOf({})).toBe('legacy-http')
    expect(wireOf({ mode: 'sse' })).toBe('not-sent')
  })

  it('a result or error class without its message is a defect of the caller, not a fabricated answer', () => {
    const ctx = context('tools/list')
    const bare = (answer: AnswerClass): WireClassification => ({ kind: 'answer', answer })
    expect(() => concludeAnswer(bare('result'), ctx, 'stdio')).toThrow(TypeError)
    expect(() => concludeAnswer(bare('error:other'), ctx, 'stdio')).toThrow(TypeError)
    expect(() => concludeAnswer(bare('http:400+-32602'), ctx, 'streamable-http')).toThrow(TypeError)
    expect(() => concludeAnswer(bare('http:400+plain'), ctx, 'streamable-http')).not.toThrow()
  })

  it('an event that is no answer is wait', () => {
    const ctx = context('tools/list')
    expect(concludeAnswer({ kind: 'other' }, ctx, 'stdio')).toEqual({ kind: 'wait' })
    expect(concludeAnswer({ kind: 'waiting' }, ctx, 'streamable-http')).toEqual({ kind: 'wait' })
  })
})

describe('the readings of a settled answer (T2, T6, T7)', () => {
  const error = (errorClass: ErrorClass, object: unknown): WireAnswer => ({
    kind: 'error',
    error: jsonOf(object),
    errorClass,
  })

  it('a readable error is error-answer with its data; an unreadable one is error-shape', () => {
    const readable = error('other', { code: -32603, message: 'x', data: { a: 1 } })
    expect(interpretAnswer(readable, () => ({ ok: 1 }))).toEqual({
      failure: { kind: 'error-answer', code: -32603, message: 'x', data: jsonOf({ a: 1 }) },
    })
    expect(interpretAnswer(error('unreadable', { message: 'x' }), () => ({ ok: 1 }))).toEqual({
      failure: { kind: 'answer-malformed', what: 'error-shape' },
    })
  })

  it("a reader's defect is the what of T7", () => {
    const read = readerOf((_result: JsonValue) => ({ failure: 'tools-missing' as const }))
    expect(read(jsonOf({}))).toEqual({
      failure: { kind: 'answer-malformed', what: 'tools-missing' },
    })
    expect(listingPageOf({ kind: 'result', result: jsonOf({ tools: [] }) }, false)).toEqual({
      ok: { tools: [] },
    })
  })

  it('the other wires read as their failures', () => {
    const read = (wire: WireAnswer) => interpretAnswer(wire, () => ({ ok: 1 }))
    expect(read({ kind: 'no-answer', cause: 'abandoned', resend: false })).toEqual({
      failure: { kind: 'no-answer', cause: 'abandoned' },
    })
    expect(read({ kind: 'not-sent', failure: NOT_SENT })).toEqual({ failure: NOT_SENT })
    expect(read({ kind: 'legacy-http' })).toEqual({ failure: NOT_SENT })
    expect(read({ kind: 'legacy-peer' })).toEqual({
      failure: { kind: 'answer-malformed', what: 'discover-shape' },
    })
  })

  it('tasks/get: -32602 is expired for both readings, anywhere it came from (G06)', () => {
    const expired = error('-32602', { code: -32602, message: 'gone' })
    expect(taskReportOf(expired)).toEqual({ ok: 'expired' })
    expect(taskAnswerOf(expired)).toEqual({ ok: { kind: 'expired' } })
    const working: WireAnswer = {
      kind: 'result',
      result: jsonOf({ taskId: 't', status: 'working' }),
    }
    expect(taskReportOf(working)).toEqual({ ok: { status: 'working' } })
    expect(taskAnswerOf(working)).toEqual({ ok: { kind: 'not-finished' } })
    const done: WireAnswer = {
      kind: 'result',
      result: jsonOf({ taskId: 't', status: 'completed', result: { content: [] } }),
    }
    expect(taskAnswerOf(done)).toEqual({
      ok: { kind: 'finished', answer: { kind: 'result', result: jsonOf({ content: [] }) } },
    })
  })

  it('the answer of a call: the result or error as written, the cause of no answer, abandoned for the rest', () => {
    expect(callAnswerOf({ kind: 'result', result: jsonOf(1) })).toEqual({
      kind: 'result',
      result: jsonOf(1),
    })
    expect(callAnswerOf(error('unreadable', 'x'))).toEqual({ kind: 'error', error: jsonOf('x') })
    expect(callAnswerOf({ kind: 'no-answer', cause: 'process-exited', resend: false })).toEqual({
      kind: 'no-answer',
      cause: 'process-exited',
    })
    expect(callAnswerOf({ kind: 'not-sent', failure: NOT_SENT })).toEqual(ABANDONED_ANSWER)
    expect(callAnswerOf({ kind: 'legacy-peer' })).toEqual(ABANDONED_ANSWER)
    expect(callAnswerOf({ kind: 'legacy-http' })).toEqual(ABANDONED_ANSWER)
    expect(ABANDONED).toEqual({ kind: 'no-answer', cause: 'abandoned', resend: false })
  })
  const ABANDONED_ANSWER = { kind: 'no-answer', cause: 'abandoned' }
})

describe('the probe and the paths of discover (T3, T8 D rows)', () => {
  it('retryVersionOf names the highest version in common with the modern ones the peer supports', () => {
    const error = (supported: unknown) =>
      jsonOf({ code: -32022, message: 'x', data: { supported } })
    expect(
      retryVersionOf(error(['2000-01-01', HIGHEST, '2027-01-01']), ['2027-01-01', HIGHEST]),
    ).toBe('2027-01-01')
    expect(retryVersionOf(error([HIGHEST]), ['2027-01-01', HIGHEST])).toBe(HIGHEST)
    expect(retryVersionOf(error(['2099-01-01']), VERSIONS)).toBeUndefined()
    expect(retryVersionOf(error([]), VERSIONS)).toBeUndefined()
    expect(retryVersionOf(jsonOf({ code: -32022, message: 'x' }), VERSIONS)).toBeUndefined()
    expect(retryVersionOf(jsonOf('x'), VERSIONS)).toBeUndefined()
  })

  it('a -32022 on the second probe is final whatever its class (D07); on the first, the class decides (D04–D06)', () => {
    const wire = (errorClass: ErrorClass, supported: unknown): WireAnswer => ({
      kind: 'error',
      error: jsonOf({ code: -32022, message: 'x', data: { supported } }),
      errorClass,
    })
    const common = wire('-32022+common', [HIGHEST])
    expect(concludeProbe(common, 'discover', VERSIONS, BOUND)).toEqual({
      kind: 'retry',
      version: HIGHEST,
    })
    expect(concludeProbe(common, 'discover-retry', VERSIONS, BOUND)).toMatchObject({
      kind: 'final',
      failure: { kind: 'error-answer', code: -32022 },
    })
    expect(
      concludeProbe(wire('-32022+modern', ['2099-01-01']), 'discover', VERSIONS, BOUND),
    ).toEqual({
      kind: 'final',
      failure: { kind: 'answer-malformed', what: 'discover-shape' },
    })
    expect(concludeProbe(wire('-32022+legacy', []), 'discover', VERSIONS, BOUND)).toEqual({
      kind: 'legacy-peer',
    })
  })

  it('discoverWith: identity on the modern path; the retry; the legacy path and which failure it reports', async () => {
    const identity = (version: string): WireAnswer => ({
      kind: 'result',
      result: jsonOf({ supportedVersions: [version], capabilities: {} }),
    })
    const probes: string[] = []
    const legacyOk = async () => ({
      ok: { protocolVersion: protocolVersionOf(OFFERED_LEGACY_VERSION), capabilities: jsonOf({}) },
    })
    const legacyBroke = async () => ({
      failure: { kind: 'error-answer', code: -32603, message: 'legacy broke' } as const,
    })
    const versions = ['2027-01-01', HIGHEST] as const

    const modern = await discoverWith(
      {
        probe: async (version, request) => {
          probes.push(`${request}:${version}`)
          return request === 'discover'
            ? {
                kind: 'error',
                error: jsonOf({ code: -32022, message: 'x', data: { supported: [HIGHEST] } }),
                errorClass: '-32022+common',
              }
            : identity(HIGHEST)
        },
        legacy: legacyBroke,
      },
      versions,
      BOUND,
    )
    expect(modern).toMatchObject({ ok: { protocolVersion: HIGHEST } })
    expect(probes).toEqual(['discover:2027-01-01', `discover-retry:${HIGHEST}`])

    const legacyPeer = await discoverWith(
      { probe: async () => ({ kind: 'legacy-peer' }), legacy: legacyBroke },
      versions,
      BOUND,
    )
    expect(legacyPeer).toEqual({
      failure: { kind: 'error-answer', code: -32603, message: 'legacy broke' },
    })

    const fallback = await discoverWith(
      {
        probe: async () => ({ kind: 'result', result: jsonOf({ hello: 1 }) }),
        legacy: legacyBroke,
      },
      versions,
      BOUND,
    )
    expect(fallback).toEqual({ failure: { kind: 'answer-malformed', what: 'discover-shape' } })
    const fallbackRead = await discoverWith(
      { probe: async () => ({ kind: 'result', result: jsonOf({ hello: 1 }) }), legacy: legacyOk },
      versions,
      BOUND,
    )
    expect(fallbackRead).toMatchObject({ ok: { protocolVersion: OFFERED_LEGACY_VERSION } })

    const final = await discoverWith(
      { probe: async () => ({ kind: 'not-sent', failure: NOT_SENT }), legacy: legacyOk },
      versions,
      BOUND,
    )
    expect(final).toEqual({ failure: NOT_SENT })
  })

  it('the legacy path: the params it offers and the identity it reads', () => {
    expect(legacyInitializeParamsOf({ name: 'host', version: '1' })).toEqual({
      protocolVersion: LEGACY_PROTOCOL_VERSIONS[0],
      capabilities: {},
      clientInfo: { name: 'host', version: '1' },
    })
    const read: WireAnswer = {
      kind: 'result',
      result: jsonOf({ protocolVersion: OFFERED_LEGACY_VERSION, capabilities: {} }),
    }
    expect(legacyIdentityOf(read, BOUND)).toEqual({
      ok: { protocolVersion: OFFERED_LEGACY_VERSION, capabilities: jsonOf({}) },
    })
    const unreadable: WireAnswer = {
      kind: 'result',
      result: jsonOf({ protocolVersion: HIGHEST, capabilities: {} }),
    }
    expect(legacyIdentityOf(unreadable, BOUND)).toEqual({
      failure: { kind: 'answer-malformed', what: 'discover-shape' },
    })
  })

  it('requestClassOf: the second server/discover is discover-retry', () => {
    expect(requestClassOf('server/discover', false)).toBe('discover')
    expect(requestClassOf('server/discover', true)).toBe('discover-retry')
    expect(requestClassOf('tools/call', true)).toBe('tools/call')
  })
})

describe('the authorization discovery (T4, R4)', () => {
  const challenge = new Map<string, string>()
  const target = 'https://peer.test/mcp'

  it('fetches the candidates in order until one is an object; a fetch that rejects is nothing', async () => {
    const seen: string[] = []
    const discovery = await discoverAuthorization(
      target,
      challenge,
      async url => {
        seen.push(url)
        if (url.endsWith('/mcp')) throw new Error('down')
        return jsonOf({ authorization_servers: ['https://issuer.test'] })
      },
      new AbortController().signal,
    )
    expect(seen).toEqual([
      'https://peer.test/.well-known/oauth-protected-resource/mcp',
      'https://peer.test/.well-known/oauth-protected-resource',
    ])
    expect(discovery).toMatchObject({ metadata: 'fetched', issuers: ['https://issuer.test'] })
  })

  it('stops at the signal: what was not fetched is unavailable', async () => {
    const controller = new AbortController()
    const seen: string[] = []
    const discovery = await discoverAuthorization(
      target,
      challenge,
      async (url, signal) => {
        seen.push(url)
        controller.abort()
        return signal.aborted ? undefined : jsonOf({})
      },
      controller.signal,
    )
    expect(seen).toHaveLength(1)
    expect(discovery).toMatchObject({ metadata: 'unavailable', issuers: [] })
  })
})

describe('the rules a transport applies by its connection (T2, T5) and the requests its operations send (T3, T6)', () => {
  const http = (
    version: string | undefined,
    mode: 'streamable' | 'sse' = 'streamable',
  ): ConnectionView => ({
    kind: 'streamable-http',
    version,
    mode,
  })

  it('a connection is legacy once it negotiated a legacy revision, not before', () => {
    expect(isLegacyConnection(http(undefined))).toBe(false)
    expect(isLegacyConnection(http(HIGHEST))).toBe(false)
    expect(isLegacyConnection(http(LEGACY_PROTOCOL_VERSIONS[0]))).toBe(true)
    expect(isLegacyConnection({ kind: 'stdio', version: LEGACY_PROTOCOL_VERSIONS[1] })).toBe(true)
  })

  it('checks the listing headers on modern Streamable HTTP only; cancels by notification on stdio, legacy and the SSE mode', () => {
    expect(checksListingHeaders(http(undefined))).toBe(true)
    expect(checksListingHeaders(http(HIGHEST))).toBe(true)
    expect(checksListingHeaders(http(LEGACY_PROTOCOL_VERSIONS[0]))).toBe(false)
    expect(checksListingHeaders(http(undefined, 'sse'))).toBe(false)
    expect(checksListingHeaders({ kind: 'stdio', version: HIGHEST })).toBe(false)
    expect(cancelsByNotification(http(undefined))).toBe(false)
    expect(cancelsByNotification(http(HIGHEST))).toBe(false)
    expect(cancelsByNotification(http(LEGACY_PROTOCOL_VERSIONS[0]))).toBe(true)
    expect(cancelsByNotification(http(undefined, 'sse'))).toBe(true)
    expect(cancelsByNotification({ kind: 'stdio', version: undefined })).toBe(true)
  })

  it('a gone stream settles every request with no-answer and no re-send; a refusal settles with its discovery', () => {
    expect(streamGoneAnswerOf('process-exited')).toEqual({
      kind: 'no-answer',
      cause: 'process-exited',
      resend: false,
    })
    const discovery = {
      resourceMetadataUrl: 'https://peer.test/.well-known/oauth-protected-resource',
      metadata: 'unavailable',
      issuers: [],
      scopes: [],
    } as const
    expect(authorizationRequiredAnswerOf(discovery)).toEqual({
      kind: 'not-sent',
      failure: { kind: 'not-sent', cause: 'authorization-required', discovery },
    })
  })

  it('sends once more only after a conclusion that says resend, and never a third time', async () => {
    const answers: WireAnswer[] = [
      { kind: 'no-answer', cause: 'stream-broken', resend: true },
      { kind: 'no-answer', cause: 'stream-broken', resend: true },
      { kind: 'result', result: jsonOf({}) },
    ]
    let sends = 0
    const send = async () => {
      sends += 1
      return { wire: answers[sends - 1] ?? ABANDONED }
    }
    expect(await withOneResend(send)).toEqual({ wire: answers[1] })
    expect(sends).toBe(2)
    sends = 0
    answers.splice(0, 1)
    expect(await withOneResend(send)).toEqual({ wire: answers[1] })
    expect(sends).toBe(2)
    sends = 0
    answers.splice(0, 1)
    expect(await withOneResend(send)).toEqual({ wire: answers[0] })
    expect(sends).toBe(1)
  })

  it('composes the _meta of a request: the envelope, and on tools/call the progress token', () => {
    const clientInfo = { name: 'c', version: '1' }
    expect(requestMetaOf('tools/list', 'r1', HIGHEST, clientInfo)).toEqual(
      clientEnvelopeOf(HIGHEST, clientInfo),
    )
    expect(requestMetaOf('tools/call', 'r2', HIGHEST, clientInfo)).toEqual({
      ...clientEnvelopeOf(HIGHEST, clientInfo),
      progressToken: 'r2',
    })
  })

  it('composes tools/call from the call request: the action and continuation as params, the values as written', () => {
    const args = jsonTextOf('{"n":1234567890123456789}')
    const inputResponses = jsonOf({ a: 1 })
    expect(callRequestOf({ action: actionNameOf('echo'), args })).toEqual({
      method: 'tools/call',
      params: { name: 'echo' },
      values: { arguments: args },
    })
    expect(
      callRequestOf({
        action: actionNameOf('echo'),
        args,
        continuation: { requestState: requestStateOf('s1'), inputResponses },
      }),
    ).toEqual({
      method: 'tools/call',
      params: { name: 'echo', requestState: 's1' },
      values: { arguments: args, inputResponses },
    })
  })

  it('composes the listing and the task requests, each reading its answer the way the operation does', async () => {
    const taskId = taskIdOf('t1')
    expect(listActionsRequest(undefined, http(HIGHEST))).toMatchObject({
      method: 'tools/list',
      params: {},
    })
    const listing = listActionsRequest('c2', http(HIGHEST))
    expect(listing.params).toEqual({ cursor: 'c2' })
    expect(listing.read({ kind: 'result', result: jsonOf({ tools: [] }) })).toEqual({
      ok: { tools: [] },
    })
    expect(getTaskRequest(taskId)).toMatchObject({ method: 'tasks/get', params: { taskId: 't1' } })
    expect(
      getTaskRequest(taskId).read({
        kind: 'result',
        result: jsonOf({ taskId: 't1', status: 'working' }),
      }),
    ).toEqual({ ok: { status: 'working' } })
    expect(
      getTaskResultRequest(taskId).read({
        kind: 'result',
        result: jsonOf({ taskId: 't1', status: 'cancelled' }),
      }),
    ).toEqual({ ok: { kind: 'cancelled' } })
    const update = updateTaskRequest(taskId, jsonOf({ a: 1 }))
    expect(update).toMatchObject({
      method: 'tasks/update',
      params: { taskId: 't1' },
      values: { inputResponses: jsonOf({ a: 1 }) },
    })
    expect(update.read({ kind: 'result', result: jsonOf({}) })).toEqual({ ok: 'accepted' })
    expect(update.read(ABANDONED)).toEqual({ failure: { kind: 'no-answer', cause: 'abandoned' } })
    const cancel = cancelTaskRequest(taskId)
    expect(cancel).toMatchObject({ method: 'tasks/cancel', params: { taskId: 't1' } })
    expect(cancel.read({ kind: 'result', result: jsonOf({}) })).toEqual({ ok: 'requested' })
    await Promise.resolve()
  })

  it('the exit window decides the cause of a stdio end: the exit within the window, else the stream', () => {
    expect(endedCauseOf({ stdoutEndedAt: 100 })).toBe('stream-broken')
    expect(endedCauseOf({ exitedAt: 100 })).toBe('process-exited')
    expect(endedCauseOf({ stdoutEndedAt: 100, exitedAt: 100 + PROCESS_EXIT_WINDOW_MS })).toBe(
      'process-exited',
    )
    expect(endedCauseOf({ stdoutEndedAt: 100, exitedAt: 101 + PROCESS_EXIT_WINDOW_MS })).toBe(
      'stream-broken',
    )
  })

  it('a discovery in progress reports what was fetched so far, and its end when the loop ended', async () => {
    const challenge = new Map<string, string>()
    let release = (value: JsonValue | undefined): void => void value
    const run = startAuthorizationDiscovery(
      'https://peer.test/mcp',
      challenge,
      () =>
        new Promise<JsonValue | undefined>(resolve => {
          release = resolve
        }),
      new AbortController().signal,
    )
    expect(run.soFar()).toMatchObject({
      resourceMetadataUrl: 'https://peer.test/.well-known/oauth-protected-resource',
      metadata: 'unavailable',
    })
    release(jsonOf({ authorization_servers: ['https://issuer.test'] }))
    expect(await run.done).toMatchObject({
      resourceMetadataUrl: 'https://peer.test/.well-known/oauth-protected-resource/mcp',
      metadata: 'fetched',
      issuers: ['https://issuer.test'],
    })
    expect(run.soFar()).toEqual(await run.done)
  })
})

describe('the messages of the peer and the texts of this side (T3, RFC-0010)', () => {
  it('reads a request with its id as written, a notification with its progress token as text', () => {
    expect(readPeerMessage('{"jsonrpc":"2.0","id":1234567890123456789,"method":"ping"}')).toEqual({
      kind: 'request',
      id: { kind: 'number', lexeme: '1234567890123456789' },
      method: 'ping',
    })
    expect(
      readPeerMessage(
        '{"jsonrpc":"2.0","method":"notifications/progress","params":{"progressToken":"r1","progress":1}}',
      ),
    ).toEqual({
      kind: 'notification',
      method: 'notifications/progress',
      params: jsonOf({ progressToken: 'r1', progress: 1 }),
      progressToken: 'r1',
    })
    expect(
      readPeerMessage(
        '{"jsonrpc":"2.0","method":"notifications/progress","params":{"progressToken":7}}',
      ),
    ).toMatchObject({
      progressToken: '7',
    })
    expect(readPeerMessage('{"jsonrpc":"2.0","method":"x"}')).toEqual({
      kind: 'notification',
      method: 'x',
    })
    for (const other of [
      '{"jsonrpc":"2.0","id":"r1","result":{}}',
      'not json',
      '[1]',
      '{"method":1}',
    ])
      expect(readPeerMessage(other), other).toBeUndefined()
  })

  it('answers ping with an empty result and any other request with -32601', () => {
    const id = jsonOf(9)
    expect(peerRequestAnswerOf({ kind: 'request', id, method: 'ping' })).toEqual({ result: {} })
    expect(peerRequestAnswerOf({ kind: 'request', id, method: 'roots/list' })).toEqual({
      error: { code: -32601, message: 'Method not found' },
    })
  })

  it('writes jsonrpc first, the value trees as written, and the echoed id as written', () => {
    expect(
      requestTextOf({
        id: 'r1',
        method: 'tools/call',
        params: { name: 'echo', _meta: { progressToken: 'r1' } },
        values: { arguments: jsonTextOf('{"n":1234567890123456789,"p":1.10}') },
      }),
    ).toBe(
      '{"jsonrpc":"2.0","id":"r1","method":"tools/call","params":{"name":"echo","_meta":{"progressToken":"r1"},"arguments":{"n":1234567890123456789,"p":1.10}}}',
    )
    expect(
      notificationTextOf({ method: 'notifications/cancelled', params: { requestId: 'r1' } }),
    ).toBe('{"jsonrpc":"2.0","method":"notifications/cancelled","params":{"requestId":"r1"}}')
    expect(responseTextOf({ id: jsonTextOf('1234567890123456789'), result: {} })).toBe(
      '{"jsonrpc":"2.0","id":1234567890123456789,"result":{}}',
    )
    expect(
      responseTextOf({ id: jsonOf('q'), error: { code: -32601, message: 'Method not found' } }),
    ).toBe('{"jsonrpc":"2.0","id":"q","error":{"code":-32601,"message":"Method not found"}}')
  })
})
