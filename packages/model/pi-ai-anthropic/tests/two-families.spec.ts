// @module-tag slow — starts an openssl child process and a real local HTTPS server, and sends the
// record fixtures of two families through the real shared transport.
//
// The two-family integration (spec D9): the OpenAI and the Anthropic family go through one
// `composeFamilies` into one `createPiTransport`. The local server answers each request with the
// recorded stream of the model that the body names. For every record of both families, the body
// that leaves the transport is the fixture body, and the facts that come back are the fixture
// facts. The transport group of the model-contract conformance suite passes against the composed
// transport for a record of each family. HTTP refusals, rate limits and stream loss are mapped by
// the shared transport, which tests them itself; they are not tested here again per family.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  judgeFixedModelRequest,
  type FixedModelRequest,
  type TransportFact,
} from '@omne-harness/model-contract'
import {
  checkModelProviderConformance,
  type ConformanceSubject,
} from '@omne-harness/model-contract/conformance'
import {
  createScriptedConformanceSubject,
  type ScriptedPrincipal,
} from '@omne-harness/model-contract/testing'
import {
  composeFamilies,
  createNetworkResources,
  createPiTransport,
  type NetworkResources,
  type PiTransport,
} from '@omne-harness/pi-ai-transport'
import { fixtureDirectory, GATEWAY_END_MARKER } from '@omne-harness/pi-ai-transport/testing'
import {
  createOpenAiFamily,
  OPENAI_RECORDS,
  openAiTokenizerResources,
} from '@omne-harness/pi-ai-openai'
import { ANTHROPIC_RECORDS } from '@omne-harness/pi-ai-anthropic'
import { CONFIG, FAMILY as ANTHROPIC_FAMILY, MARGIN_SOURCE } from './support/anthropic.ts'
import { FIXTURES_ROOT, RECORDS_DIRECTORY } from './support/fixture-files.ts'
import { createCertificate, startHttpsServer, type HttpsFixture } from './support/https-server.ts'

/** The OpenAI fixtures, read through the declared dev dependency on the OpenAI family. */
const OPENAI_FIXTURES = fileURLToPath(
  new URL('../node_modules/@omne-harness/pi-ai-openai/tests/fixtures/records/', import.meta.url),
)
const ANTHROPIC_FIXTURES = join(fileURLToPath(FIXTURES_ROOT), RECORDS_DIRECTORY)

const OPENAI_FAMILY = createOpenAiFamily({
  tokenizer: openAiTokenizerResources(),
  limits: CONFIG.limits,
  margin: { percent: '10', source: MARGIN_SOURCE },
})
const FAMILIES = composeFamilies([OPENAI_FAMILY, ANTHROPIC_FAMILY])

/** The placeholder secret of the test; the server does not check it. */
const PLACEHOLDER = 'placeholder-credential'
const ROUTE_PATH = '/api/v1/chat/completions'

const LIMITS = {
  connectTimeoutMs: 5_000,
  maxErrorBodyBytes: 4_096,
  maxEventBytes: 1_048_576,
  json: {
    maxBytes: 1_048_576,
    maxDepth: 64,
    maxItems: 4_096,
    maxMembers: 1_024,
    maxStringLength: 1_048_576,
    maxNumberLength: 64,
  },
}

type RecordFixture = Readonly<{
  family: 'openai' | 'anthropic'
  name: string
  model: string
  request: FixedModelRequest
  body: unknown
  stream: string
  facts: unknown
}>

function readFixture(
  family: RecordFixture['family'],
  root: string,
  record: Readonly<{ name: string; revision: string; route: Readonly<{ model: string }> }>,
): RecordFixture {
  const directory = join(root, fixtureDirectory(record))
  const parsed: unknown = JSON.parse(readFileSync(join(directory, 'request.json'), 'utf8'))
  const request = judgeFixedModelRequest(Reflect.get(Object(parsed), 'request'))
  if (!('ok' in request)) throw new Error(`${record.name}: ${JSON.stringify(request.failure)}`)
  return {
    family,
    name: record.name,
    model: record.route.model,
    request: request.ok,
    body: Reflect.get(Object(parsed), 'body'),
    stream: readFileSync(join(directory, 'stream.sse'), 'utf8'),
    facts: JSON.parse(readFileSync(join(directory, 'facts.json'), 'utf8')),
  }
}

const FIXTURES: readonly RecordFixture[] = [
  ...OPENAI_RECORDS.map(record => readFixture('openai', OPENAI_FIXTURES, record)),
  ...ANTHROPIC_RECORDS.map(record => readFixture('anthropic', ANTHROPIC_FIXTURES, record)),
]

const certificate = createCertificate()
let server: HttpsFixture
beforeAll(async () => {
  const streams = new Map(FIXTURES.map(item => [item.model, item.stream]))
  server = await startHttpsServer(certificate, (res, request) => {
    const model: unknown = Reflect.get(Object(JSON.parse(request.body)), 'model')
    const stream = typeof model === 'string' ? streams.get(model) : undefined
    if (request.path !== ROUTE_PATH || stream === undefined) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.end(stream)
  })
})
afterAll(async () => {
  await server.close()
  certificate.dispose()
})

type Built = Readonly<{
  transport: PiTransport
  network: NetworkResources
  /** How many sends started: the transport reads the credential once per send, inside `start`. */
  sends(): number
}>

function buildTransport(): Built {
  const network = createNetworkResources({
    maxConnections: 2,
    idleConnectionTimeoutMs: 60_000,
    tls: { ca: certificate.cert },
  })
  let reads = 0
  const transport = createPiTransport({
    network,
    families: FAMILIES,
    routes: {
      openrouter: { url: new URL(ROUTE_PATH, server.url).href, endMarker: GATEWAY_END_MARKER },
    },
    credential: {
      read: () => {
        reads += 1
        return PLACEHOLDER
      },
    },
    limits: LIMITS,
  })
  return { transport, network, sends: () => reads }
}

async function send(built: Built, request: FixedModelRequest): Promise<readonly TransportFact[]> {
  const prepared = await built.transport.transport.prepare(request, request.suppliers[0], {
    resent: [],
  })
  if (!('ok' in prepared)) throw new Error(`prepare: ${JSON.stringify(prepared.failure)}`)
  try {
    const materialized = await prepared.ok.materialize(new AbortController().signal)
    if (!('ok' in materialized))
      throw new Error(`materialize: ${JSON.stringify(materialized.failure)}`)
    try {
      const facts: TransportFact[] = []
      for await (const fact of materialized.ok.start(new AbortController().signal)) facts.push(fact)
      return facts
    } finally {
      await materialized.ok.close()
    }
  } finally {
    await prepared.ok.close()
  }
}

describe('the record fixtures of both families through one composed transport', () => {
  it('covers every record of both families', () => {
    expect(FIXTURES.filter(item => item.family === 'openai')).toHaveLength(OPENAI_RECORDS.length)
    expect(FIXTURES.filter(item => item.family === 'anthropic')).toHaveLength(
      ANTHROPIC_RECORDS.length,
    )
  })

  it.each(FIXTURES.map(item => [item.name, item] as const))(
    '%s: the sent body and the facts equal the fixture',
    async (_name, fixture) => {
      const built = buildTransport()
      try {
        const before = server.requests.length
        const facts = await send(built, fixture.request)
        expect(JSON.parse(JSON.stringify(facts))).toEqual(fixture.facts)
        expect(facts.filter(fact => fact.kind === 'ended')).toHaveLength(1)
        expect(built.sends()).toBe(1)
        const received = server.requests.slice(before)
        expect(received).toHaveLength(1)
        expect(JSON.parse(received[0]?.body ?? 'null')).toEqual(fixture.body)
      } finally {
        await built.transport.close()
        await built.network.close()
      }
    },
  )
})

const TRANSPORT_OBLIGATIONS = [
  'transport-sends-only-at-start',
  'repeated-transport-step-sends-nothing',
  'materialization-receipt-matches-request',
  'fact-stream-ends-once',
  'interruption-is-confirmed',
  'transport-close-is-idempotent',
] as const

/** The first record fixture of each family. */
const CONFORMANCE_FIXTURES = [
  FIXTURES.find(item => item.family === 'openai'),
  FIXTURES.find(item => item.family === 'anthropic'),
].filter(item => item !== undefined)

describe('the transport group of the conformance suite against the composed transport', () => {
  it.each(CONFORMANCE_FIXTURES.map(item => [item.name, item] as const))(
    '%s: every transport obligation passes',
    async (_name, fixture) => {
      const before = server.requests.length
      const counters: (() => number)[] = []
      function subject(): ConformanceSubject<ScriptedPrincipal> {
        const scripted = createScriptedConformanceSubject()
        const built = buildTransport()
        counters.push(built.sends)
        return {
          ...scripted,
          transport: {
            transport: built.transport.transport,
            sends: built.sends,
            request: fixture.request,
            supplier: fixture.request.suppliers[0],
          },
          async dispose() {
            await scripted.dispose?.()
            await built.transport.close()
            await built.network.close()
          },
        }
      }
      const report = await checkModelProviderConformance({ subject, waitMs: 5_000 })
      const results = TRANSPORT_OBLIGATIONS.map(name => {
        const result = report.results.find(entry => entry.obligation === name)
        return { obligation: name, status: result?.status, detail: result?.detail }
      })
      expect(results).toEqual(
        TRANSPORT_OBLIGATIONS.map(obligation => ({ obligation, status: 'pass', detail: '' })),
      )
      // Every counted send reached the server, and nothing else did.
      const counted = counters.reduce((total, sends) => total + sends(), 0)
      expect(counted).toBeGreaterThan(0)
      await expect.poll(() => server.requests.length - before).toBe(counted)
    },
  )
})
