// @module-tag slow — starts an openssl child process and a real local HTTPS server
import {
  decisionAnswersOf,
  type DecisionAsk,
  type DecisionsModelRequest,
  type FixedModelRequest,
  type Supplier,
} from '@omne-harness/model-contract'
import type { TransportFact } from '@omne-harness/model-contract/provider'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { defineDecisionsFamily } from '../src/family-kit/index.ts'
import { composeFamilies, recordAdoption, recordProvider } from '../src/family-table.ts'
import type { PiTransportLimits } from '../src/index.ts'
import { createPiTransport } from '../src/transport.ts'
import { network } from './support/exchange.ts'
import {
  createCertificate,
  startHttpsServer,
  type Certificate,
  type RequestHandler,
} from './support/https-server.ts'
import { LIMITS, REQUEST } from './support/test-family.ts'
import { collect, countSends } from './support/transport.ts'

const MODEL = 'openai/gpt-6-luna-decisions'
const OWNER = 'test-decisions'
const RECORD = {
  name: MODEL,
  revision: '1',
  route: { provider: 'openrouter', model: MODEL },
  status: 'current',
  decisions: { maxQuestions: '200' },
  profile: { input: ['text'], output: ['text'], evidence: 'a test record' },
} as const
const SUPPLIER: Supplier = {
  adoption: recordAdoption(OWNER, RECORD),
  provider: recordProvider(RECORD),
  model: MODEL,
  credential: { layer: 'official' },
}
const ask: DecisionAsk = {
  state: { goal: 'faster home page' },
  questions: {
    A1: { type: 'choice', criteria: { holds: 'it holds', fails: 'it does not' } },
    X1: { type: 'noul', instructions: 'Did the exit come about?' },
  },
}
const answers = {
  A1: { type: 'choice', choice: 'holds', probabilities: { holds: 0.93, fails: 0.07 } },
  X1: { type: 'noul', noul: 0.1 },
}
const usage = { input_tokens: 1163, output_tokens: 0, cost: 0.0001163 }
const replied =
  (body: unknown): RequestHandler =>
  res => {
    res.writeHead(200, { 'content-type': 'application/json', 'x-generation-id': 'gen-7' })
    res.end(JSON.stringify(body))
  }
const WITH_DECISIONS: PiTransportLimits = { ...LIMITS, maxDecisionBytes: 4096 }

function requestOf(asked: DecisionAsk = ask): DecisionsModelRequest {
  return {
    kind: 'decisions',
    profile: REQUEST.profile,
    suppliers: [SUPPLIER],
    fallback: false,
    retryPolicy: REQUEST.retryPolicy,
    ask: asked,
    source: REQUEST.source,
  }
}

let certificate: Certificate
beforeAll(() => {
  certificate = createCertificate()
})
afterAll(() => certificate.dispose())

async function run(
  handler: RequestHandler,
  options: Readonly<{ request?: FixedModelRequest; limits?: PiTransportLimits }> = {},
) {
  const server = await startHttpsServer(certificate, handler)
  const bodies = () => server.requests.map(request => Buffer.from(request.body).toString('utf8'))
  const resources = network(server.ca)
  const sends = countSends(resources)
  const families = composeFamilies([
    defineDecisionsFamily({ owner: OWNER, endpoint: 'decisions', records: [RECORD] }),
  ])
  const built = createPiTransport({
    network: resources.handle,
    families,
    routes: {
      [SUPPLIER.provider]: {
        endpoints: { decisions: { url: new URL('/decisions', server.url).href, endMarker: null } },
        accounting: {
          place: 'openrouter',
          costUnit: 'openrouter-credit',
          generation: { requestHeader: 'x-generation-id', path: '/api/v1/generation' },
        },
        auth: { kind: 'bearer', item: 'apiKey' },
      },
    },
    credential: { read: () => new Map([['apiKey', 'test-secret']]) },
    limits: options.limits ?? WITH_DECISIONS,
  })
  try {
    const request = options.request ?? requestOf()
    const prepared = await built.transport.prepare(request, SUPPLIER, { resent: [] })
    if (!('ok' in prepared)) return { prepared, facts: [], bodies: bodies(), sends: sends() }
    const materialized = await prepared.ok.materialize(new AbortController().signal)
    if (!('ok' in materialized))
      return { materialized, facts: [], bodies: bodies(), sends: sends() }
    if (!('start' in materialized.ok)) throw new Error('a decision binding is not live')
    const facts = await collect(materialized.ok.start(new AbortController().signal))
    return { facts, bodies: bodies(), sends: sends(), receipt: materialized.ok.receipt }
  } finally {
    await built.close()
    await resources.close()
    await server.close()
  }
}

const kinds = (facts: readonly TransportFact[]) => facts.map(fact => fact.kind)
const ended = (facts: readonly TransportFact[]) => facts.at(-1)

describe('a decision dispatch through the transport', () => {
  it('sends the ask once as one JSON body and hands over the answers as one sealed block, then the account', async () => {
    const { facts, bodies, sends, receipt } = await run(
      replied({ model: MODEL, provider: 'OpenAI', answers, usage }),
    )
    expect(sends).toBe(1)
    expect(bodies.map(body => JSON.parse(body) as unknown)).toEqual([{ model: MODEL, ...ask }])
    expect(kinds(facts)).toEqual([
      'response',
      'block-open',
      'block-delta',
      'block-seal',
      'account',
      'ended',
    ])
    expect(facts[0]).toEqual({ kind: 'response', request: 'gen-7' })
    const sealed = facts.find(fact => fact.kind === 'block-seal')
    if (sealed?.kind !== 'block-seal') throw new Error('no sealed block')
    expect(decisionAnswersOf([{ kind: 'sealed', block: sealed.block, trims: [] }])).toEqual(answers)
    expect(facts.find(fact => fact.kind === 'account')).toEqual({
      kind: 'account',
      event: 'usage',
      value: {
        usage: [
          { name: 'input', state: 'known', lexeme: '1163', unit: 'token' },
          { name: 'output', state: 'known', lexeme: '0', unit: 'token' },
        ],
        cost: [
          { state: 'known', lexeme: '0.0001163', unit: 'openrouter-credit', source: 'billable' },
        ],
        trimmed: { state: 'unknown', unit: 'token' },
        place: 'openrouter/OpenAI',
        duration: { state: 'unknown' },
        revision: '1',
      },
    })
    expect(ended(facts)).toEqual({
      kind: 'ended',
      termination: { kind: 'completed', reason: 'stop' },
    })
    expect(receipt).toMatchObject({ supplier: SUPPLIER.adoption })
  })

  it('a cost the answer leaves out is an unknown of the account, not a zero', async () => {
    const { facts } = await run(
      replied({ model: MODEL, answers, usage: { input_tokens: 7, output_tokens: 0 } }),
    )
    const account = facts.find(fact => fact.kind === 'account')
    if (account?.kind !== 'account') throw new Error('no account')
    expect(account.value.cost).toEqual([])
    expect(account.value.place).toBe('openrouter/unknown')
  })

  it.each([
    ['an answer is missing', { A1: answers.A1 }],
    ['an option that was not asked', { ...answers, A1: { type: 'choice', choice: 'maybe' } }],
    ['the type of another question', { ...answers, X1: { type: 'choice', choice: 'holds' } }],
  ])(
    'the whole reply does not count when %s: no block, and a failure of the protocol',
    async (_, got) => {
      const { facts, sends } = await run(replied({ model: MODEL, answers: got, usage }))
      expect(sends).toBe(1)
      expect(kinds(facts)).toEqual(['response', 'ended'])
      expect(ended(facts)).toMatchObject({
        termination: {
          kind: 'failed',
          fault: { cause: 'upstream-protocol', diagnostic: 'decision-answers-do-not-match' },
        },
      })
    },
  )

  it('an HTTP failure ends the dispatch by its status and is not sent again', async () => {
    const { facts, sends } = await run(res => {
      res.writeHead(503)
      res.end('{"error":"busy"}')
    })
    expect(sends).toBe(1)
    expect(ended(facts)).toMatchObject({
      termination: {
        kind: 'failed',
        fault: { cause: 'upstream-unavailable', diagnostic: 'http-503' },
      },
    })
  })

  it('a body over the limit, or one that is no JSON, is a failure of the protocol', async () => {
    const big = await run(replied({ model: MODEL, answers, usage, pad: 'x'.repeat(5000) }))
    expect(ended(big.facts)).toMatchObject({
      termination: { kind: 'failed', fault: { diagnostic: 'frame-body-too-large' } },
    })
    const broken = await run(res => {
      res.writeHead(200)
      res.end('not json')
    })
    expect(ended(broken.facts)).toMatchObject({
      termination: { kind: 'failed', fault: { diagnostic: 'frame-invalid-json' } },
    })
  })

  it('a request of another kind than the interface of its record is refused before anything is sent', async () => {
    const chat = { ...REQUEST, suppliers: [SUPPLIER] } satisfies FixedModelRequest
    const { prepared, sends } = await run(replied({}), { request: chat })
    expect(prepared).toMatchObject({ failure: { kind: 'unsupported', field: 'request.kind' } })
    expect(sends).toBe(0)
  })

  it('a transport without a limit for decisions sends none', async () => {
    const { prepared, sends } = await run(replied({}), { limits: LIMITS })
    expect(prepared).toMatchObject({ failure: { kind: 'unsupported', field: 'limits.decisions' } })
    expect(sends).toBe(0)
  })

  it('an ask over the byte limit is refused before anything is sent', async () => {
    const large = { ...ask, state: 'x'.repeat(5000) }
    const over = await run(replied({}), { request: requestOf(large) })
    expect(over.materialized).toMatchObject({
      failure: { kind: 'invalid', field: 'request', reason: 'not-a-decision' },
    })
    expect(over.sends).toBe(0)
  })
})
