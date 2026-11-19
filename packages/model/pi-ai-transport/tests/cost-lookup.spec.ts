// @module-tag slow — starts an openssl child process and talks to a real local HTTPS server.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { answerOf, lookupGenerationCost } from '../src/cost-lookup.ts'
import type { NetworkInternals } from '../src/network.ts'
import { network } from './support/exchange.ts'
import {
  createCertificate,
  startHttpsServer,
  type Certificate,
  type HttpsFixture,
} from './support/https-server.ts'

// Answers of the generation endpoint as the probe of 2026-11-19 recorded them (`probes/out/
// recheck-*.json`): a whole reply, a stream stopped after content, and a request stopped before any
// provider saw it. The bodies are rebuilt from the recorded fields.
const WHOLE = { data: { total_cost: 0.0002522, cancelled: false, native_tokens_prompt: 22 } }
const STOPPED = { data: { total_cost: 9.16e-5, cancelled: true, native_tokens_completion: 179 } }

let certificate: Certificate
let server: HttpsFixture
let resources: NetworkInternals
let answer: { status: number; body: string } = { status: 200, body: '' }

beforeAll(async () => {
  certificate = createCertificate()
  server = await startHttpsServer(certificate, res => {
    res.writeHead(answer.status, { 'content-type': 'application/json' })
    res.end(answer.body)
  })
  resources = network(server.ca)
})

afterAll(async () => {
  await resources.close()
  await server.close()
  certificate.dispose()
})

function lookup(signal = new AbortController().signal) {
  return lookupGenerationCost(
    resources,
    {
      url: new URL('/api/v1/generation', server.url),
      request: 'gen-17950-abc',
      secret: 'sk-test-secret',
      costUnit: 'openrouter-credit',
      timeoutMs: 5000,
      maxBodyBytes: 65_536,
    },
    signal,
  )
}

describe('the cost lookup of an OpenRouter route', () => {
  it('reads a known total cost as a plain decimal, asking only with a GET that carries the id and the secret in the header', async () => {
    answer = { status: 200, body: JSON.stringify(STOPPED) }
    const pending = server.nextRequest()
    expect(await lookup()).toEqual({
      kind: 'found',
      cost: [
        { state: 'known', lexeme: '0.0000916', unit: 'openrouter-credit', source: 'billable' },
      ],
    })
    const seen = await pending
    expect(seen.method).toBe('GET')
    expect(seen.path).toBe('/api/v1/generation?id=gen-17950-abc')
    expect(seen.headers.authorization).toBe('Bearer sk-test-secret')
    expect(seen.body.byteLength).toBe(0)
    answer = { status: 200, body: JSON.stringify(WHOLE) }
    expect(await lookup()).toMatchObject({ kind: 'found', cost: [{ lexeme: '0.0002522' }] })
  })

  it('answers missed for a request the upstream does not know, and for a generation with no cost yet', async () => {
    answer = { status: 404, body: '{"error":{"message":"Generation not found","code":404}}' }
    expect(await lookup()).toEqual({ kind: 'missed' })
    answer = { status: 200, body: JSON.stringify({ data: { total_cost: null } }) }
    expect(await lookup()).toEqual({ kind: 'missed' })
  })

  it('answers unavailable, which does not count, for a server error, a body that is not JSON and a stopped lookup', async () => {
    answer = { status: 502, body: 'bad gateway' }
    expect(await lookup()).toEqual({ kind: 'unavailable', diagnostic: 'status-502' })
    answer = { status: 200, body: 'not json' }
    expect(await lookup()).toEqual({ kind: 'unavailable', diagnostic: 'body-not-json' })
    const stopped = new AbortController()
    stopped.abort()
    expect(await lookup(stopped.signal)).toEqual({ kind: 'unavailable', diagnostic: 'stopped' })
  })
})

describe('the answer of the generation endpoint', () => {
  it('never turns an unknown cost into zero', () => {
    expect(answerOf(JSON.stringify({ data: {} }), 'openrouter-credit')).toEqual({ kind: 'missed' })
    expect(answerOf(JSON.stringify({ data: { total_cost: 'n/a' } }), 'u')).toEqual({
      kind: 'unavailable',
      diagnostic: 'cost-not-a-number',
    })
  })
})
