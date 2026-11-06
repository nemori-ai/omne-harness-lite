// The read-session-diagnostics operation (SPEC「会话公开操作」, 「会话诊断页」): the two request
// shapes chosen by `cursor`, and the closed success page with every branch of its unions.
import {
  encodeSessionRequest,
  encodeSessionResponse,
  readSessionRequest,
  readSessionResponse,
  type SessionDiagnosticsPage,
  type SessionResponseEncodeInput,
} from '@omne-harness/public-contract'
import { describe, expect, it } from 'vitest'

const limits = {
  maxBytes: 200_000,
  maxDepth: 100,
  maxItems: 10_000,
  maxMembers: 100,
  maxStringLength: 10_000,
  maxNumberLength: 100,
}
const version = 'session-public/1'
const operation = 'read-session-diagnostics'
const tenantText = JSON.stringify({
  organization: 'org_00000000000000000000000000',
  account: 'acc_00000000000000000000000000',
})
const session = 'abcdef0123456789'.repeat(4)
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))
const decode = (encoded: Uint8Array): unknown => JSON.parse(new TextDecoder().decode(encoded))
const omit = (value: object, key: string) =>
  Object.fromEntries(Object.entries(value).filter(([name]) => name !== key))

const firstPage = {
  protocolVersion: version,
  messageId: 'm',
  operation,
  loginProof: 'proof',
  body: { tenant: tenantText, session, cursor: null, run: null, pageBytes: '4096' },
}
const nextPage = { ...firstPage, body: { tenant: tenantText, session, cursor: 'opaque' } }
const readRequest = (wire: unknown) => readSessionRequest({ bytes: bytes(wire), limits })

const adoption = { owner: 'model', name: 'adapter', revision: '1', digest: 'sha256:a' }
const account = {
  kind: 'account',
  usage: [{ name: 'input_tokens', unit: 'token', state: 'known', lexeme: '12' }],
  cost: [{ source: 'provider', unit: 'USD', state: 'unknown', lexeme: null }],
  duration: { kind: 'known', value: 'PT1.5S' },
  receipt: 'received',
} as const
const unsupported = { kind: 'unknown', reason: 'unsupported' } as const
const toolDiagnostic = { operation: 'shell', phase: 'execute', code: 'exit-1' } as const
const noAttempts = {
  started: '0',
  released: { ended: '0', bounded: '0', cancelled: '0', released: '0', superseded: '0' },
  exited: '0',
} as const
const page: SessionDiagnosticsPage = {
  runs: [
    {
      run: 'run-2',
      entry: 'interactive',
      execution: 'exec-2',
      started: { position: 'e10', at: { kind: 'unknown' } },
      attempts: {
        started: '2',
        released: { ended: '0', bounded: '0', cancelled: '1', released: '0', superseded: '1' },
        exited: '1',
      },
      controls: [
        {
          position: 'e14',
          kind: 'requested',
          target: 'run',
          intent: 'control',
          state: 'committed',
        },
        { position: 'e15', kind: 'progress', target: null, intent: null, state: null },
      ],
      terminal: {
        outcome: 'failed',
        cause: {
          record: 'no-reply: upstream-unavailable',
          structured: { kind: 'no-reply', cause: 'upstream-unavailable', upstreamStatus: '504' },
        },
      },
      calls: { registered: '3', projected: '2' },
      modelCalls: [
        {
          reference: 'model-ref-1',
          purpose: 'main',
          call: { kind: 'found', call: 'call-1', phase: 'settled' },
          dispatches: [
            {
              dispatch: 'd1',
              revision: '3',
              adapter: adoption,
              send: 'sent',
              firstContent: 'none-proven',
              outcome: { kind: 'failed', cause: 'upstream-unavailable', upstreamStatus: '504' },
              timing: {
                materialize: { kind: 'unknown' },
                sendToFirstContent: { kind: 'known', milliseconds: '120' },
                execution: { kind: 'unknown' },
              },
              account,
            },
            {
              dispatch: 'd2',
              revision: '4',
              adapter: adoption,
              send: 'not-sent',
              firstContent: 'uncertain',
              outcome: { kind: 'completed', reason: 'stop' },
              timing: {
                materialize: { kind: 'unknown' },
                sendToFirstContent: { kind: 'unknown' },
                execution: { kind: 'unknown' },
              },
              account: { kind: 'unknown', reason: 'not-recorded' },
            },
          ],
          coverage: 'complete-through-snapshot',
          facts: [{ kind: 'sent', count: '2' }],
        },
        {
          reference: 'model-ref-2',
          purpose: 'compaction',
          call: { kind: 'unknown', reason: 'not-accepted' },
          dispatches: [],
          coverage: 'unknown',
          facts: [],
        },
      ],
      toolCalls: [
        {
          reference: 'tool-ref-1',
          state: {
            kind: 'found',
            call: 'tool-1',
            phase: 'settled',
            relation: 'foreground',
            terminal: { kind: 'failed', cause: 'executor' },
          },
          account,
          facts: [{ kind: 'settled', count: '1' }],
          diagnostics: [toolDiagnostic, { operation: 'shell', phase: 'release', code: 'released' }],
        },
        {
          reference: 'tool-ref-2',
          state: { kind: 'unknown', reason: 'denied' },
          account: { kind: 'unknown', reason: 'denied' },
          facts: [],
          diagnostics: unsupported,
        },
      ],
      messages: [
        { kind: 'message.user', count: '1' },
        { kind: 'message.assistant', count: '2' },
      ],
      facts: [{ kind: 'account.linked', count: '1' }],
    },
    {
      run: 'run-1',
      entry: 'dispatch',
      execution: 'exec-1',
      started: { position: 'e1', at: { kind: 'known', instant: '2026-11-05T00:00:00Z' } },
      attempts: { ...noAttempts, started: '1' },
      controls: [],
      terminal: {
        outcome: 'failed',
        cause: { record: null, structured: { kind: 'model-refused', failure: 'capacity' } },
      },
      calls: { registered: '0', projected: '0' },
      modelCalls: [],
      toolCalls: [],
      messages: [],
      facts: [],
    },
    {
      run: 'run-0',
      entry: 'interactive',
      execution: 'exec-0',
      started: { position: 'e0', at: { kind: 'unknown' } },
      attempts: { ...noAttempts, started: '1' },
      controls: [],
      terminal: null,
      calls: { registered: '0', projected: '0' },
      modelCalls: [],
      toolCalls: [],
      messages: [],
      facts: [],
    },
  ],
  next: 'cursor-2',
  exhausted: false,
  scannedThrough: 'e0',
  basis: { upper: '41' },
  gaps: [
    { source: 'model', subject: 'model-ref-2', reason: 'not-accepted' },
    { source: 'tool', subject: 'tool-ref-2', reason: 'denied' },
    { source: 'session', subject: 'run-2', reason: 'truncated' },
    { source: 'session', subject: 'call.execution-fact', reason: 'not-disclosed' },
    { source: 'agent', subject: 'exec-0', reason: 'unsupported' },
  ],
}
const structuredCauses = [
  { kind: 'unknown', reason: 'unsupported' },
  { kind: 'unknown', reason: 'not-recorded' },
  { kind: 'none' },
  { kind: 'no-failure', conclusion: 'cancelled' },
  { kind: 'model-refused', failure: 'denied' },
  { kind: 'model-refused', failure: unsupported },
  { kind: 'no-reply', cause: null, upstreamStatus: null },
  { kind: 'request-rejected' },
  { kind: 'cannot-fit', reason: 'after-compaction' },
  { kind: 'cannot-fit', reason: { kind: 'unknown', reason: 'not-recorded' } },
  { kind: 'compaction-invalid' },
  { kind: 'message-rejected' },
  { kind: 'extension-stop' },
  { kind: 'guard' },
] as const

const wireOf = (outcome: string, body: unknown) => ({
  protocolVersion: version,
  messageId: 'm',
  outcome,
  body,
})
const readResponse = (wire: unknown) =>
  readSessionResponse({ bytes: bytes(wire), operation, expectedMessageId: 'm', limits })
const encodeSuccess = (body: unknown) =>
  encodeSessionResponse({
    operation,
    response: wireOf('succeeded', body),
    limits,
  } as SessionResponseEncodeInput)
const withRun = (overrides: Record<string, unknown>) => ({
  ...page,
  runs: [{ ...page.runs[0], ...overrides }],
})
const run = page.runs[0]!
const modelCall = run.modelCalls[0]!
const dispatch = modelCall.dispatches[0]!
const toolCall = run.toolCalls[0]!
const withDispatch = (overrides: Record<string, unknown>) =>
  withRun({ modelCalls: [{ ...modelCall, dispatches: [{ ...dispatch, ...overrides }] }] })
const withTerminalCause = (structured: unknown) =>
  withRun({ terminal: { outcome: 'failed', cause: { record: null, structured } } })

describe('read-session-diagnostics requests', () => {
  it.each([
    ['the first page', firstPage],
    ['a next page', nextPage],
    ['one Run', { ...firstPage, body: { ...firstPage.body, run: 'run-1' } }],
  ])('reads %s and re-encodes the same wire', (_name, wire) => {
    const result = readRequest(wire)
    expect(result.kind).toBe('request')
    if (result.kind !== 'request') return
    expect(result.request.operation).toBe(operation)
    const encoded = encodeSessionRequest({ request: result.request, limits })
    expect(encoded.kind).toBe('encoded')
    if (encoded.kind === 'encoded') expect(decode(encoded.bytes)).toEqual(wire)
  })

  it.each([
    ['a null cursor without run', omit(firstPage.body, 'run')],
    ['a null cursor without pageBytes', omit(firstPage.body, 'pageBytes')],
    ['a string cursor beside run', { ...nextPage.body, run: null }],
    ['a string cursor beside pageBytes', { ...nextPage.body, pageBytes: '1' }],
    ['a numeric run', { ...firstPage.body, run: 1 }],
    ['an empty run', { ...firstPage.body, run: '' }],
    ['a direction', { ...firstPage.body, direction: 'backward' }],
    ['pageBytes with a leading zero', { ...firstPage.body, pageBytes: '0' }],
    ['an empty cursor', { ...nextPage.body, cursor: '' }],
  ])('rejects %s', (_name, body) => {
    expect(readRequest({ ...firstPage, body })).toMatchObject({
      kind: 'protocol-rejected',
      diagnostic: { code: 'field' },
    })
  })
})

describe('read-session-diagnostics responses', () => {
  it('round trips the success page with every union branch', () => {
    const wire = wireOf('succeeded', page)
    const read = readResponse(wire)
    expect(read.kind).toBe('response')
    if (read.kind !== 'response' || read.response.outcome !== 'succeeded') return
    expect(read.response.body).toEqual(page)
    const encoded = encodeSuccess(page)
    expect(encoded.kind).toBe('encoded')
    if (encoded.kind === 'encoded') expect(decode(encoded.bytes)).toEqual(wire)
  })

  it.each(structuredCauses)('accepts the structured cause %j', structured => {
    const body = withRun({
      terminal: { outcome: 'cancelled', cause: { record: null, structured } },
    })
    expect(readResponse(wireOf('succeeded', body)).kind).toBe('response')
    expect(encodeSuccess(body).kind).toBe('encoded')
  })

  it('round trips a tool diagnostics entry whose phase and code are empty', () => {
    // Tool's DiagnosticPage gives phase and code as plain strings; an empty one is a value.
    const body = withRun({
      toolCalls: [{ ...toolCall, diagnostics: [{ ...toolDiagnostic, phase: '', code: '' }] }],
    })
    const wire = wireOf('succeeded', body)
    const read = readResponse(wire)
    expect(read.kind).toBe('response')
    if (read.kind !== 'response' || read.response.outcome !== 'succeeded') return
    expect(read.response.body).toEqual(body)
    const encoded = encodeSuccess(body)
    expect(encoded.kind).toBe('encoded')
    if (encoded.kind === 'encoded') expect(decode(encoded.bytes)).toEqual(wire)
  })

  it.each(['succeeded', 'denied', 'invalid', 'basis-unavailable'])(
    'has the %s outcome',
    outcome => {
      const body = outcome === 'succeeded' ? page : {}
      expect(readResponse(wireOf(outcome, body)).kind).toBe('response')
    },
  )

  it.each(['unknown', 'not-found', 'unsupported', 'conflict', 'archived'])(
    'has no %s outcome',
    outcome => {
      expect(readResponse(wireOf(outcome, {}))).toEqual({
        kind: 'unreadable',
        diagnostic: { code: 'field' },
      })
    },
  )

  it.each([
    ['a page without basis', omit(page, 'basis')],
    ['a page without gaps', omit(page, 'gaps')],
    ['a gap with an unknown reason', { ...page, gaps: [{ ...page.gaps[0], reason: 'lost' }] }],
    ['a gap with an unknown source', { ...page, gaps: [{ ...page.gaps[0], source: 'cli' }] }],
    ['the attempts as one count text', withRun({ attempts: '2' })],
    ['a numeric attempts count', withRun({ attempts: { ...noAttempts, started: 2 } })],
    [
      'attempts without a released kind',
      withRun({ attempts: { ...noAttempts, released: omit(noAttempts.released, 'superseded') } }),
    ],
    ['a Run without facts', { ...page, runs: [omit(run, 'facts')] }],
    ['a fact with an empty kind', withRun({ facts: [{ kind: '', count: '1' }] })],
    ['a fact with a numeric count', withRun({ facts: [{ kind: 'sent', count: 1 }] })],
    ['a fact with an empty count', withRun({ facts: [{ kind: 'sent', count: '' }] })],
    [
      'a structured cause that carries a diagnostic text',
      withTerminalCause({
        kind: 'no-reply',
        cause: 'upstream-unavailable',
        upstreamStatus: null,
        diagnostic: 'in-band-error',
      }),
    ],
    [
      'a model-refused cause outside the closed set',
      withTerminalCause({ kind: 'model-refused', failure: 'capacityy' }),
    ],
    [
      'a model-refused unknown failure whose reason is not-disclosed',
      withTerminalCause({
        kind: 'model-refused',
        failure: { kind: 'unknown', reason: 'not-disclosed' },
      }),
    ],
    [
      'a cannot-fit reason outside the closed set',
      withTerminalCause({ kind: 'cannot-fit', reason: 'fixedd' }),
    ],
    [
      'a model call that still carries usage',
      withRun({ modelCalls: [{ ...modelCall, usage: unsupported }] }),
    ],
    ['a model call without facts', withRun({ modelCalls: [omit(modelCall, 'facts')] })],
    [
      'a dispatch without an account',
      withRun({ modelCalls: [{ ...modelCall, dispatches: [omit(dispatch, 'account')] }] }),
    ],
    ['a dispatch whose account is a text', withDispatch({ account: 'unsupported' })],
    [
      'the old unsupported tool diagnostics literal',
      withRun({ toolCalls: [{ ...toolCall, diagnostics: 'unsupported' }] }),
    ],
    [
      'a tool diagnostics entry with evidence',
      withRun({
        toolCalls: [
          { ...toolCall, diagnostics: [{ ...toolDiagnostic, evidence: { digest: 'x' } }] },
        ],
      }),
    ],
    [
      'a tool diagnostics entry with an empty operation',
      withRun({
        toolCalls: [{ ...toolCall, diagnostics: [{ ...toolDiagnostic, operation: '' }] }],
      }),
    ],
    [
      'a tool diagnostics entry with a numeric code',
      withRun({
        toolCalls: [{ ...toolCall, diagnostics: [{ ...toolDiagnostic, code: 1 }] }],
      }),
    ],
    [
      'a tool diagnostics entry without a code',
      withRun({
        toolCalls: [{ ...toolCall, diagnostics: [omit(toolDiagnostic, 'code')] }],
      }),
    ],
    ['a tool call without facts', withRun({ toolCalls: [omit(toolCall, 'facts')] })],
    [
      'a model call whose unknown reason is truncated',
      withRun({
        modelCalls: [{ ...run.modelCalls[1], call: { kind: 'unknown', reason: 'truncated' } }],
      }),
    ],
  ])('rejects %s on both sides', (_name, body) => {
    expect(readResponse(wireOf('succeeded', body))).toEqual({
      kind: 'unreadable',
      diagnostic: { code: 'field' },
    })
    expect(encodeSuccess(body)).toEqual({ kind: 'invalid', diagnostic: { code: 'field' } })
  })
})
