import { describe, expect, it } from 'vitest'
import { sessionDiagnosticsProtocol } from '@omne-harness/session-diagnostics-protocol'
import { expectRoundTrip, readSample, session, tenant } from './fixtures/samples.ts'

const operation = sessionDiagnosticsProtocol.operations['read-session-diagnostics']
const target = { tenant, session }

const unknownValue = { kind: 'unknown', reason: 'not-found' }
const account = {
  kind: 'account',
  usage: [{ name: 'tokens', unit: 'token', state: 'known', lexeme: '12' }],
  cost: [{ source: 'adapter', unit: 'usd', state: 'provisional', lexeme: null }],
  duration: { kind: 'known', value: '30' },
  receipt: 'received',
}
const attempt = {
  dispatch: 'd-1',
  revision: '2',
  adapter: { owner: 'model', name: 'adapter', revision: '1', digest: 'sha256:a' },
  send: 'sent',
  firstContent: 'observed',
  outcome: { kind: 'completed', reason: 'stop' },
  timing: {
    materialize: { kind: 'known', milliseconds: '4' },
    sendToFirstContent: { kind: 'unknown' },
    execution: { kind: 'known', milliseconds: '99' },
  },
  account,
}
const counted = [{ kind: 'run.started', count: '1' }]
const run = {
  run: 'run-1',
  entry: 'interactive',
  execution: 'exec-1',
  started: { position: 'e1', at: { kind: 'unknown' } },
  attempts: {
    started: '1',
    released: { ended: '0', bounded: '0', cancelled: '0', released: '1', superseded: '0' },
    exited: '1',
  },
  controls: [
    { position: 'e2', kind: 'progress', target: 'run', intent: 'interrupt', state: 'reconciled' },
    { position: 'e3', kind: 'requested', target: null, intent: null, state: null },
  ],
  terminal: {
    outcome: 'failed',
    cause: { record: 'rec', structured: { kind: 'model-refused', failure: 'denied' } },
  },
  calls: { registered: '2', projected: '2' },
  modelCalls: [
    {
      reference: 'm-1',
      purpose: 'main',
      call: { kind: 'found', call: 'c-1', phase: 'settled' },
      dispatches: [
        attempt,
        {
          ...attempt,
          outcome: { kind: 'failed', cause: 'x', upstreamStatus: null },
          account: unknownValue,
        },
      ],
      coverage: 'expired-prefix',
      facts: counted,
    },
    {
      reference: 'm-2',
      purpose: 'side',
      call: unknownValue,
      dispatches: [],
      coverage: 'unknown',
      facts: [],
    },
  ],
  toolCalls: [
    {
      reference: 't-1',
      state: {
        kind: 'found',
        call: 'tc-1',
        phase: 'settled',
        relation: 'background',
        terminal: { kind: 'no-response', cause: null },
      },
      account,
      facts: counted,
      diagnostics: [{ operation: 'run', phase: 'any phase', code: 'any code' }],
    },
    {
      reference: 't-2',
      state: unknownValue,
      account: unknownValue,
      facts: [],
      diagnostics: unknownValue,
    },
  ],
  messages: [{ kind: 'message.user', count: '3' }],
  facts: counted,
}
const page = {
  runs: [run],
  next: 'cursor',
  exhausted: false,
  scannedThrough: 'pos:3',
  basis: { upper: '7' },
  gaps: [
    { source: 'session', subject: 'message.tool', reason: 'not-disclosed' },
    { source: 'agent', subject: 'exec-1', reason: 'truncated' },
  ],
}

const causes = [
  { kind: 'node-failed', node: 'n', category: 'exception', failureKind: 'k' },
  unknownValue,
  { kind: 'none' },
  { kind: 'no-failure', conclusion: 'cancelled' },
  { kind: 'model-refused', failure: unknownValue },
  { kind: 'no-reply', cause: null, upstreamStatus: '503' },
  { kind: 'request-rejected' },
  { kind: 'cannot-fit', reason: 'after-compaction' },
  { kind: 'cannot-fit', reason: unknownValue },
  { kind: 'compaction-invalid' },
  { kind: 'message-rejected' },
  { kind: 'extension-stop' },
  { kind: 'guard' },
]
const withCause = (structured: unknown) => ({
  ...page,
  runs: [{ ...run, terminal: { outcome: 'failed', cause: { record: null, structured } } }],
})

describe('read-session-diagnostics request body', () => {
  it.each([
    [{ ...target, cursor: null, run: null, pageBytes: '65536' }],
    [{ ...target, cursor: null, run: 'run-1', pageBytes: '1' }],
    [{ ...target, cursor: 'opaque-cursor' }],
  ])('reads a body and writes it back as it was', sample => {
    expectRoundTrip(operation.body, sample)
  })

  it.each([
    ['a null cursor without run', { ...target, cursor: null, pageBytes: '10' }],
    ['a null cursor without pageBytes', { ...target, cursor: null, run: null }],
    ['a cursor beside run', { ...target, cursor: 'c', run: null }],
    ['a cursor beside pageBytes', { ...target, cursor: 'c', pageBytes: '10' }],
    ['a cursor beside run and pageBytes', { ...target, cursor: 'c', run: null, pageBytes: '10' }],
    ['an empty cursor', { ...target, cursor: '' }],
    ['a page of zero bytes', { ...target, cursor: null, run: null, pageBytes: '0' }],
    ['a numeric page size', { ...target, cursor: null, run: null, pageBytes: 10 }],
    ['a tenant that is no tenant', { tenant: 'nobody', session, cursor: 'c' }],
    ['a session that is no session', { tenant, session: 'short', cursor: 'c' }],
    ['a field it does not have', { ...target, cursor: 'c', extra: 1 }],
  ])('refuses %s', (_label, sample) => {
    expect(readSample(operation.body, sample)).toEqual({ ok: false })
  })
})

describe('read-session-diagnostics outcome bodies', () => {
  it('reads a succeeded page covering every branch and writes it back as it was', () => {
    expectRoundTrip(operation.outcomes.succeeded, page)
  })

  it.each(causes)('round-trips the run cause %j', structured => {
    expectRoundTrip(operation.outcomes.succeeded, withCause(structured))
  })

  it('round-trips a page of no runs and a run without a terminal', () => {
    expectRoundTrip(operation.outcomes.succeeded, {
      ...page,
      runs: [],
      next: null,
      exhausted: true,
      gaps: [],
    })
    expectRoundTrip(operation.outcomes.succeeded, {
      ...page,
      runs: [{ ...run, terminal: null }],
    })
  })

  it.each([
    ['without basis', { ...page, basis: undefined }],
    [
      'with an instant that is not text',
      {
        ...page,
        runs: [{ ...run, started: { position: 'e1', at: { kind: 'known', instant: 5 } } }],
      },
    ],
    [
      'with another gap source',
      { ...page, gaps: [{ source: 'agentx', subject: 's', reason: 'denied' }] },
    ],
    [
      'with another gap reason',
      { ...page, gaps: [{ source: 'agent', subject: 's', reason: 'gone' }] },
    ],
    ['with another entry class', { ...page, runs: [{ ...run, entry: 'batch' }] }],
    [
      'with an unknown that cannot say not-disclosed',
      {
        ...page,
        runs: [
          {
            ...run,
            toolCalls: [
              { ...run.toolCalls[1], state: { kind: 'unknown', reason: 'not-disclosed' } },
            ],
          },
        ],
      },
    ],
    [
      'with a count that is a number',
      { ...page, runs: [{ ...run, facts: [{ kind: 'k', count: 1 }] }] },
    ],
    ['with a field it does not have', { ...page, extra: 1 }],
  ])('refuses a succeeded page %s', (_label, sample) => {
    expect(readSample(operation.outcomes.succeeded, sample)).toEqual({ ok: false })
  })

  it('writes an empty body for invalid and refuses a body with a member', () => {
    expect(expectRoundTrip(operation.outcomes.invalid, {})).toEqual({})
    expect(readSample(operation.outcomes.invalid, { reason: 'x' })).toEqual({ ok: false })
  })
})
