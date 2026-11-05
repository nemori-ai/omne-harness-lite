// classifyWireEvent: every answer class of the decision table has an event that falls into it,
// and every classification is a class of the table's domain for that request and material.
import { describe, expect, it } from 'vitest'
import {
  PROCESS_EXIT_WINDOW_MS,
  classifyWireEvent,
  type AnswerClass,
  type RequestClass,
  type WireClassification,
  type WireContext,
  type WireEvent,
} from '@omne-harness/mcp-contract'
import { jsonTextOf, transportCells } from '@omne-harness/mcp-contract/testing'

const VERSIONS = ['2027-01-01', '2026-07-28']

const context = (request: RequestClass, session = false): WireContext => ({
  id: 7,
  request,
  session,
  versions: VERSIONS,
})

const answer = (message: Readonly<Record<string, unknown>>) =>
  JSON.stringify({ jsonrpc: '2.0', id: 7, ...message })

type Sample = Readonly<{
  kind: 'stdio' | 'streamable-http'
  request: RequestClass
  event: WireEvent
  session?: boolean
  expected: AnswerClass
}>

/** One answer delivered on a material: a stdio line or a 2xx JSON body. */
function delivered(kind: Sample['kind'], text: string): WireEvent {
  return kind === 'stdio'
    ? { kind: 'line', text }
    : { kind: 'http-stream', messages: [text], ended: true }
}

const ERRORS: readonly Readonly<[string, Readonly<Record<string, unknown>> | string]>[] = [
  ['-32020', { code: -32020, message: 'Header mismatch' }],
  ['-32021', { code: -32021, message: 'Missing required client capability' }],
  ['-32022+common', { code: -32022, message: 'x', data: { supported: ['2026-07-28'] } }],
  ['-32022+modern', { code: -32022, message: 'x', data: { supported: ['2099-01-01'] } }],
  ['-32022+legacy', { code: -32022, message: 'x', data: { supported: ['2025-06-18'] } }],
  ['-32601', { code: -32601, message: 'Method not found' }],
  ['-32602', { code: -32602, message: 'Invalid params' }],
  ['other', { code: -32603, message: 'Internal error' }],
  ['unreadable', { code: -32603 }],
]

const RESULTS: Readonly<Record<RequestClass, readonly Readonly<[AnswerClass, unknown]>[]>> = {
  discover: [
    ['result', { supportedVersions: ['2026-07-28'], capabilities: {} }],
    ['result:no-common', { supportedVersions: ['2099-01-01'], capabilities: {} }],
    ['result:unreadable', { supportedVersions: ['2026-07-28'] }],
  ],
  'discover-retry': [
    ['result', { supportedVersions: ['2027-01-01'], capabilities: {} }],
    ['result:no-common', { supportedVersions: [], capabilities: {} }],
    ['result:unreadable', [1]],
  ],
  initialize: [
    ['result', { protocolVersion: '2025-06-18', capabilities: {} }],
    ['result:unreadable', { protocolVersion: '2025-01-01', capabilities: {} }],
  ],
  'tools/list': [
    ['result', { tools: [], nextCursor: '' }],
    ['result:tools-missing', { tools: {} }],
    ['result:cursor-invalid', { tools: [], nextCursor: null }],
  ],
  'tools/call': [['result', { anything: true }]],
  'tasks/get': [
    ['result', { taskId: 't', status: 'cancelled' }],
    ['result:status-unknown', { status: 'working' }],
    ['result:input-requests-missing', { taskId: 't', status: 'input_required' }],
    ['result:result-missing', { taskId: 't', status: 'completed' }],
    ['result:error-missing', { taskId: 't', status: 'failed', error: 'x' }],
  ],
  'tasks/update': [['result', {}]],
  'tasks/cancel': [['result', {}]],
  notification: [],
}

const REQUESTS: readonly RequestClass[] = [
  'discover',
  'discover-retry',
  'initialize',
  'tools/list',
  'tools/call',
  'tasks/get',
  'tasks/update',
  'tasks/cancel',
  'notification',
]

const STATUSES: Readonly<Record<string, number>> = {
  '400': 400,
  '404': 404,
  '405': 405,
  '406': 406,
  '415': 415,
  '429': 429,
  '4xx': 302,
  '5xx': 502,
}

/** Samples built from their class: one or more events for every class of every cell. */
function samples(): readonly Sample[] {
  const kinds = ['stdio', 'streamable-http'] as const
  const list: Sample[] = []
  for (const kind of kinds)
    for (const request of REQUESTS) {
      const http = kind === 'streamable-http'
      list.push(
        { kind, request, event: { kind: 'unsent' }, expected: 'unsent' },
        { kind, request, event: { kind: 'nothing' }, expected: 'silent' },
      )
      if (http) {
        list.push(
          { kind, request, event: { kind: 'http-aborted' }, expected: 'stream-broken' },
          {
            kind,
            request,
            event: { kind: 'http-stream', messages: [], ended: true },
            expected: 'http:2xx',
          },
          {
            kind,
            request,
            event: { kind: 'http-status', status: 401, headers: {}, body: '' },
            expected: 'http:401',
          },
          {
            kind,
            request,
            event: {
              kind: 'http-status',
              status: 403,
              headers: { 'www-authenticate': 'Bearer error="insufficient_scope"' },
              body: '',
            },
            expected: 'http:403+scope',
          },
          {
            kind,
            request,
            event: { kind: 'http-status', status: 403, headers: {}, body: 'no' },
            expected: 'http:403',
          },
        )
        if (!['discover', 'discover-retry', 'initialize'].includes(request))
          list.push({
            kind,
            request,
            session: true,
            event: { kind: 'http-status', status: 404, headers: {}, body: '' },
            expected: 'http:404+session',
          })
        for (const [statusClass, status] of Object.entries(STATUSES)) {
          list.push({
            kind,
            request,
            event: { kind: 'http-status', status, headers: {}, body: 'Not Found' },
            expected: `http:${statusClass}+plain` as AnswerClass,
          })
          for (const [code, error] of ERRORS)
            list.push({
              kind,
              request,
              event: {
                kind: 'http-status',
                status,
                headers: {},
                body: JSON.stringify({ jsonrpc: '2.0', id: null, error }),
              },
              expected: `http:${statusClass}+${code}` as AnswerClass,
            })
        }
      } else
        list.push(
          {
            kind,
            request,
            event: { kind: 'stdio-ended', stdoutEndedAt: 0 },
            expected: 'stream-broken',
          },
          {
            kind,
            request,
            event: { kind: 'stdio-ended', stdoutEndedAt: 0, exitedAt: 5 },
            expected: 'process-exited',
          },
        )
      if (request === 'notification') continue
      for (const [code, error] of ERRORS)
        list.push({
          kind,
          request,
          event: delivered(kind, answer({ error })),
          expected: `error:${code}` as AnswerClass,
        })
      for (const [expected, result] of RESULTS[request])
        list.push({ kind, request, event: delivered(kind, answer({ result })), expected })
    }
  return list
}

describe('classifyWireEvent over the domain of the decision table', () => {
  it('puts every sample into the class it was built for', () => {
    const wrong = samples().flatMap(sample => {
      const got = classifyWireEvent(sample.event, context(sample.request, sample.session))
      return got.kind === 'answer' && got.answer === sample.expected
        ? []
        : [`${sample.kind} ${sample.request} ${sample.expected}: ${JSON.stringify(got)}`]
    })
    expect(wrong).toEqual([])
  })

  it('has a sample for every answer class of every cell, and nothing outside the domain', () => {
    const cells = new Set(
      transportCells().map(cell => `${cell.kind} ${cell.request} ${cell.answer}`),
    )
    const sampled = new Set(
      samples().map(sample => `${sample.kind} ${sample.request} ${sample.expected}`),
    )
    expect([...cells].filter(cell => !sampled.has(cell))).toEqual([])
    expect([...sampled].filter(cell => !cells.has(cell))).toEqual([])
  })
})

/**
 * The class of an event, without the message the classification carries with a result or error
 * class: these cases pin the class; `carries the message` below pins the message.
 */
function classify(event: WireEvent, ctx: WireContext): WireClassification {
  const classified = classifyWireEvent(event, ctx)
  return classified.kind === 'answer' ? { kind: 'answer', answer: classified.answer } : classified
}

describe('the envelope of an answer (T2)', () => {
  const discover = context('discover')

  it('reads a line with the id of the request, jsonrpc "2.0" and exactly one of result and error', () => {
    const line = (text: string) => classify({ kind: 'line', text }, discover)
    expect(
      line(answer({ result: { supportedVersions: ['2026-07-28'], capabilities: {} } })),
    ).toEqual({
      kind: 'answer',
      answer: 'result',
    })
    for (const bad of [
      JSON.stringify({ id: 7, result: {} }),
      JSON.stringify({ jsonrpc: '1.0', id: 7, result: {} }),
      JSON.stringify({ jsonrpc: '2.0', id: 7, result: {}, error: { code: 1, message: 'x' } }),
      JSON.stringify({ jsonrpc: '2.0', id: 7 }),
    ])
      expect(line(bad), bad).toEqual({ kind: 'answer', answer: 'error:unreadable' })
  })

  it('leaves other lines to the transport: another id, a request or notification of the peer', () => {
    for (const other of [
      JSON.stringify({ jsonrpc: '2.0', id: 8, result: {} }),
      JSON.stringify({ jsonrpc: '2.0', id: '7', result: {} }),
      JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'ping' }),
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/progress', params: {} }),
      '[1]',
    ])
      expect(classify({ kind: 'line', text: other }, discover), other).toEqual({
        kind: 'other',
      })
  })

  it('drops a stdio line that is not JSON and keeps the stream (F4: not stricter than the SDK)', () => {
    for (const text of [
      'Listening on stdio',
      '',
      '﻿{"jsonrpc":"2.0","id":7,"result":{}}',
      '{"jsonrpc":"2.0","id":7,"result":{},"result":{}}',
      '{"jsonrpc":"2.0","id":7,"result":{}',
    ])
      expect(classify({ kind: 'line', text }, discover), JSON.stringify(text)).toEqual({
        kind: 'other',
      })
  })

  it('in the legacy HTTP+SSE mode a 2xx body that ended with no answer is still waiting', () => {
    const sse: WireContext = { ...context('tools/list'), mode: 'sse' }
    expect(classify({ kind: 'http-stream', messages: [], ended: true }, sse)).toEqual({
      kind: 'waiting',
    })
    expect(
      classify(
        { kind: 'http-stream', messages: [answer({ result: { tools: [] } })], ended: false },
        sse,
      ),
    ).toEqual({ kind: 'answer', answer: 'result' })
    expect(classify({ kind: 'http-aborted' }, sse)).toEqual({
      kind: 'answer',
      answer: 'stream-broken',
    })
  })

  it('reads an error object only with an integer code and a text message', () => {
    for (const [error, expected] of [
      [{ code: -32602, message: 'x' }, 'error:-32602'],
      [{ code: -32602.0, message: 'x' }, 'error:-32602'],
      [{ code: -32602, message: 1 }, 'error:unreadable'],
      [{ code: '-32602', message: 'x' }, 'error:unreadable'],
      ['x', 'error:unreadable'],
    ] as const)
      expect(classify({ kind: 'line', text: answer({ error }) }, context('tools/list'))).toEqual({
        kind: 'answer',
        answer: expected,
      })
    expect(
      classify(
        { kind: 'line', text: `{"jsonrpc":"2.0","id":7,"error":{"code":-32602.5,"message":"x"}}` },
        context('tools/list'),
      ),
    ).toEqual({ kind: 'answer', answer: 'error:unreadable' })
  })

  it('reads the body of an HTTP error without its id, and only as an envelope with error', () => {
    const status = (body: string) =>
      classify({ kind: 'http-status', status: 400, headers: {}, body }, context('tools/list'))
    expect(
      status(JSON.stringify({ jsonrpc: '2.0', id: 99, error: { code: -32602, message: 'x' } })),
    ).toEqual({
      kind: 'answer',
      answer: 'http:400+-32602',
    })
    expect(status(JSON.stringify({ jsonrpc: '2.0', id: null, error: 'x' }))).toEqual({
      kind: 'answer',
      answer: 'http:400+unreadable',
    })
    for (const plain of [
      JSON.stringify({ error: { code: -32602, message: 'x' } }),
      JSON.stringify({ jsonrpc: '2.0', id: null, result: {} }),
      '<html>bad</html>',
      '',
    ])
      expect(status(plain), plain).toEqual({ kind: 'answer', answer: 'http:400+plain' })
  })
})

describe('the end of a stdio process (T8)', () => {
  const stdio = context('tools/list')
  const ended = (stdoutEndedAt?: number, exitedAt?: number) =>
    classify(
      {
        kind: 'stdio-ended',
        ...(stdoutEndedAt === undefined ? {} : { stdoutEndedAt }),
        ...(exitedAt === undefined ? {} : { exitedAt }),
      },
      stdio,
    )

  it(`counts the exit as the cause within ${PROCESS_EXIT_WINDOW_MS} ms after stdout ended`, () => {
    expect(PROCESS_EXIT_WINDOW_MS).toBe(100)
    expect(ended(1000, 1000 + PROCESS_EXIT_WINDOW_MS)).toEqual({
      kind: 'answer',
      answer: 'process-exited',
    })
    expect(ended(1000, 1000 + PROCESS_EXIT_WINDOW_MS + 1)).toEqual({
      kind: 'answer',
      answer: 'stream-broken',
    })
    expect(ended(1000, 900)).toEqual({ kind: 'answer', answer: 'process-exited' })
    expect(ended(undefined, 5)).toEqual({ kind: 'answer', answer: 'process-exited' })
    expect(ended(5)).toEqual({ kind: 'answer', answer: 'stream-broken' })
  })
})

describe('Streamable HTTP outside the error statuses (T8)', () => {
  it('waits on an open 2xx stream without the answer, and reads the answer when it comes', () => {
    const list = context('tools/list')
    expect(classify({ kind: 'http-stream', messages: [], ended: false }, list)).toEqual({
      kind: 'waiting',
    })
    const progress = JSON.stringify({ jsonrpc: '2.0', method: 'notifications/progress' })
    expect(
      classify(
        {
          kind: 'http-stream',
          messages: [progress, answer({ result: { tools: [] } })],
          ended: false,
        },
        list,
      ),
    ).toEqual({ kind: 'answer', answer: 'result' })
  })

  it('reads a 3xx like another 4xx: the transport does not follow redirects', () => {
    expect(
      classify(
        { kind: 'http-status', status: 307, headers: { location: '/x' }, body: '' },
        context('discover'),
      ),
    ).toEqual({ kind: 'answer', answer: 'http:4xx+plain' })
  })

  it('reads a 404 as the end of the legacy session only when the request carried one', () => {
    const event: WireEvent = { kind: 'http-status', status: 404, headers: {}, body: '' }
    expect(classify(event, context('tools/call', true))).toEqual({
      kind: 'answer',
      answer: 'http:404+session',
    })
    expect(classify(event, context('tools/call'))).toEqual({
      kind: 'answer',
      answer: 'http:404+plain',
    })
  })
})

describe('the message a classification carries', () => {
  it('carries the message of a result or error class, the error body of an HTTP error status, and none for the rest', () => {
    const list = context('tools/list')
    const result = answer({ result: { tools: [] } })
    expect(classifyWireEvent({ kind: 'line', text: result }, list)).toEqual({
      kind: 'answer',
      answer: 'result',
      message: jsonTextOf(result),
    })
    const error = JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32602, message: 'x' },
    })
    expect(
      classifyWireEvent({ kind: 'http-status', status: 400, headers: {}, body: error }, list),
    ).toEqual({ kind: 'answer', answer: 'http:400+-32602', message: jsonTextOf(error) })
    expect(
      classifyWireEvent({ kind: 'http-status', status: 400, headers: {}, body: 'plain' }, list),
    ).toEqual({ kind: 'answer', answer: 'http:400+plain' })
    expect(classifyWireEvent({ kind: 'http-aborted' }, list)).toEqual({
      kind: 'answer',
      answer: 'stream-broken',
    })
  })
})
