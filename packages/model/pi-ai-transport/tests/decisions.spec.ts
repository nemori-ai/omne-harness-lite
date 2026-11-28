// @module-tag slow — exercises the public provider against a local TLS endpoint.
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { createDecisions, type DecisionsConfig } from '@omne-harness/pi-ai-transport/decisions'
import { createNetworkResources, type NetworkResources } from '@omne-harness/pi-ai-transport'
import {
  createCertificate,
  startHttpsServer,
  type Certificate,
  type HttpsFixture,
} from './support/https-server.ts'

const responseLimits = {
  maxBytes: 8192,
  maxDepth: 12,
  maxMembers: 120,
  maxItems: 1000,
  maxNumberLength: 64,
  maxStringLength: 512,
}
let cert: Certificate
let server: HttpsFixture
let network: NetworkResources
const questions = {
  intent: { type: 'choice', criteria: { fix: 'correct a mistake', ask: 'ask for help' } },
  urgent: { type: 'noul', instructions: 'Does this block work?' },
  impact: { type: 'score', criteria: ['low', 'high'] },
} as const
const answers = {
  intent: { type: 'choice', choice: 'fix', probabilities: { fix: 0.8, ask: 0.2 } },
  urgent: { type: 'noul', noul: 0.6 },
  impact: { type: 'refusal' },
}
const request = { model: 'typesafe/jev-1.14', state: 'some text', questions } as const
let reply: unknown
let status = 200
let raw: string | undefined
let mode: 'respond' | 'hang' | 'disconnect' = 'respond'
beforeEach(() => {
  status = 200
  mode = 'respond'
  raw = undefined
  reply = { model: request.model, answers, usage: { input_tokens: 7, output_tokens: 0 } }
})
beforeAll(async () => {
  cert = createCertificate()
  server = await startHttpsServer(cert, res => {
    if (mode === 'hang') return
    if (mode === 'disconnect') {
      res.destroy()
      return
    }
    res.writeHead(status)
    res.end(raw ?? JSON.stringify(reply))
  })
  network = createNetworkResources({
    maxConnections: 1,
    idleConnectionTimeoutMs: 500,
    tls: { ca: server.ca },
  })
})
afterAll(async () => {
  await network.close()
  await server.close()
  cert.dispose()
})

function provider(options: Partial<DecisionsConfig> = {}) {
  return createDecisions({
    network,
    timeoutMs: 5000,
    maxRequestBytes: 8192,
    maxQuestions: 200,
    responseLimits,
    route: {
      endpoints: {
        decisions: { url: new URL('/api/alpha/decisions', server.url).href, endMarker: null },
      },
      auth: { kind: 'bearer', item: 'apiKey' },
      accounting: { place: 'openrouter', costUnit: 'credit' },
    },
    credential: { read: () => new Map([['apiKey', 'fixture-secret']]) },
    ...options,
  })
}

it.each(['typesafe/jev-1.13', 'typesafe/jev-1.14', 'openai/gpt-6-luna-decisions'] as const)(
  'asks %s three named questions in one Decisions POST',
  async model => {
    reply = { model, id: 'req-1', answers, usage: { input_tokens: 21, output_tokens: 0 } }
    const decisions = provider()
    const request = { model, state: { text: 'please correct this' }, questions }
    expect(await decisions.decide(request, new AbortController().signal)).toEqual({ ok: reply })
    const sent = server.requests.at(-1)!
    expect([sent.method, sent.path, sent.headers.authorization]).toEqual([
      'POST',
      '/api/alpha/decisions',
      'Bearer fixture-secret',
    ])
    expect(JSON.parse(Buffer.from(sent.body).toString())).toEqual(request)
  },
)

it('sends plain text unchanged for a single classification question', async () => {
  const state = '请先暂停后台任务。'
  const intent = {
    type: 'choice',
    criteria: { pause: '暂停', resume: '继续', other: '其他' },
  } as const
  const model = 'openai/gpt-6-luna-decisions'
  reply = {
    model,
    answers: { intent: { type: 'choice', choice: 'pause' } },
    usage: { input_tokens: 9, output_tokens: 0 },
  }
  expect(
    await provider().decide({ model, state, questions: { intent } }, new AbortController().signal),
  ).toEqual({ ok: reply })
  expect(JSON.parse(Buffer.from(server.requests.at(-1)!.body).toString()).state).toBe(state)
})

it('preserves a numeric score, its rubric distribution, concrete model identity and reported cost', async () => {
  reply = {
    model: 'typesafe/jev-1.14-20261014',
    answers: {
      impact: {
        type: 'score',
        score: 0.25,
        probabilities: { '0': 0.75, '1': 0.25 },
        legend: { '0': 'low', '1': 'high' },
      },
    },
    usage: { input_tokens: 10, output_tokens: 0, cost: 0.000003 },
  }
  expect(
    await provider().decide(
      { ...request, questions: { impact: questions.impact } },
      new AbortController().signal,
    ),
  ).toEqual({ ok: reply })
})

it.each([
  { ...answers, intent: { type: 'choice', choice: 'not-in-criteria' } },
  { ...answers, urgent: { type: 'noul', noul: 1.5 } },
  { ...answers, intent: { type: 'score', score: 2 } },
  { urgent: answers.urgent, impact: answers.impact },
  { ...answers, unasked: { type: 'refusal' } },
])('rejects an answer that does not match the questions', async invalid => {
  reply = { model: request.model, answers: invalid, usage: { input_tokens: 3, output_tokens: 0 } }
  expect(await provider().decide(request, new AbortController().signal)).toEqual({
    failure: { kind: 'invalid-response', dispatch: 'responded' },
  })
})

it('rejects duplicate response fields and bounds the response bytes', async () => {
  raw = JSON.stringify(reply).replace('"answers":', '"answers":{},"answers":')
  expect(await provider().decide(request, new AbortController().signal)).toMatchObject({
    failure: { kind: 'invalid-response' },
  })
  expect(
    await provider({ responseLimits: { ...responseLimits, maxBytes: 16 } }).decide(
      request,
      new AbortController().signal,
    ),
  ).toMatchObject({ failure: { kind: 'response-too-large' } })
})

it('rejects unavailable secrets, invalid input, and prior cancellation without a POST', async () => {
  const before = server.requests.length
  const signal = new AbortController().signal
  expect(
    await provider({ credential: { read: () => undefined } }).decide(request, signal),
  ).toMatchObject({ failure: { kind: 'credential-unavailable', dispatch: 'not-sent' } })
  expect(
    await provider({
      credential: {
        read: () => {
          throw new Error('fixture-secret')
        },
      },
    }).decide(request, signal),
  ).toMatchObject({ failure: { kind: 'credential-unavailable', dispatch: 'not-sent' } })
  expect(await provider().decide({ ...request, questions: {} }, signal)).toMatchObject({
    failure: { kind: 'invalid-request', dispatch: 'not-sent' },
  })
  expect(await provider().decide(request, AbortSignal.abort())).toMatchObject({
    failure: { kind: 'cancelled', dispatch: 'not-sent' },
  })
  expect(server.requests).toHaveLength(before)
})

it('keeps the status of a rejected request and never retries a possibly sent POST', async () => {
  const before = server.requests.length
  status = 429
  expect(await provider().decide(request, new AbortController().signal)).toEqual({
    failure: { kind: 'http-error', dispatch: 'responded', status: 429 },
  })
  mode = 'disconnect'
  expect(await provider().decide(request, new AbortController().signal)).toMatchObject({
    failure: { kind: 'unavailable', dispatch: 'possibly-sent' },
  })
  expect(server.requests).toHaveLength(before + 2)
})

it('cancels a dispatched request, times out one waiting for capacity, and returns the seat', async () => {
  mode = 'hang'
  const before = server.requests.length
  const sent = server.nextRequest()
  const controller = new AbortController()
  const sending = provider().decide(request, controller.signal)
  await sent
  try {
    expect(await provider({ timeoutMs: 30 }).decide(request, new AbortController().signal)).toEqual(
      { failure: { kind: 'timeout', dispatch: 'not-sent' } },
    )
  } finally {
    controller.abort()
  }
  expect(await sending).toEqual({ failure: { kind: 'cancelled', dispatch: 'possibly-sent' } })
  mode = 'respond'
  expect(await provider().decide(request, new AbortController().signal)).toHaveProperty('ok')
  expect(server.requests).toHaveLength(before + 2)
})

it('validates the result against the same questions it sent, even when the caller edits its input', async () => {
  const criteria = { ...questions.intent.criteria }
  const original = { ...request, questions: { intent: { type: 'choice' as const, criteria } } }
  reply = {
    model: request.model,
    answers: { intent: answers.intent },
    usage: { input_tokens: 4, output_tokens: 0 },
  }
  const reading = provider().decide(original, new AbortController().signal)
  Object.assign(criteria, { old: criteria.fix })
  Reflect.deleteProperty(criteria, 'fix')
  expect(await reading).toEqual({ ok: reply })
  const sent = JSON.parse(Buffer.from(server.requests.at(-1)!.body).toString())
  expect(sent.questions.intent.criteria).toEqual(questions.intent.criteria)
})

it('a deadline after dispatch leaves the remote effect unknown and makes no second call', async () => {
  mode = 'hang'
  const before = server.requests.length
  expect(await provider({ timeoutMs: 300 }).decide(request, new AbortController().signal)).toEqual({
    failure: { kind: 'timeout', dispatch: 'possibly-sent' },
  })
  expect(server.requests).toHaveLength(before + 1)
})

it('enforces request size before spending and refuses a missing or streaming Decisions route', async () => {
  const before = server.requests.length
  expect(
    await provider({ maxRequestBytes: 8 }).decide(request, new AbortController().signal),
  ).toMatchObject({ failure: { kind: 'invalid-request', dispatch: 'not-sent' } })
  const route = {
    endpoints: {},
    auth: { kind: 'bearer' as const, item: 'apiKey' },
    accounting: { place: 'openrouter', costUnit: 'credit' },
  }
  expect(() => provider({ route })).toThrow()
  expect(() =>
    provider({
      route: { ...route, endpoints: { decisions: { url: server.url.href, endMarker: '[DONE]' } } },
    }),
  ).toThrow()
  expect(server.requests).toHaveLength(before)
})
