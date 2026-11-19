// @module-tag slow — starts an openssl child process and talks to a real local HTTPS server.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { lookupGenerationCost } from '../src/cost-lookup.ts'
import { openNetwork, type NetworkInternals } from '../src/network.ts'
import { network } from './support/exchange.ts'
import { providerName, SUPPLIER } from './support/test-family.ts'
import { transportOver } from './support/transport.ts'
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
const STOPPED = {
  data: {
    total_cost: 9.16e-5,
    cancelled: true,
    native_tokens_completion: 179,
    provider_name: 'OpenAI',
  },
}

let certificate: Certificate
let server: HttpsFixture
let resources: NetworkInternals
/** What the server does next: answer whole, never answer, or cut the body after its first bytes. */
let answer: { status: number; body: string; mode?: 'hold' | 'cut' } = { status: 200, body: '' }

beforeAll(async () => {
  certificate = createCertificate()
  server = await startHttpsServer(certificate, res => {
    if (answer.mode === 'hold') return
    res.writeHead(answer.status, { 'content-type': 'application/json', 'content-length': '4096' })
    if (answer.mode === 'cut') {
      res.write(answer.body)
      setTimeout(() => res.destroy(), 20)
      return
    }
    res.end(answer.body.padEnd(4096, ' '))
  })
  resources = network(server.ca)
})

afterAll(async () => {
  await resources.close()
  await server.close()
  certificate.dispose()
})

function lookup(
  signal = new AbortController().signal,
  over: Readonly<{ url?: URL; timeoutMs?: number; maxBodyBytes?: number }> = {},
  through: NetworkInternals = resources,
) {
  return lookupGenerationCost(
    through,
    {
      url: over.url ?? new URL('/api/v1/generation', server.url),
      request: 'gen-17950-abc',
      secret: 'sk-test-secret',
      place: 'openrouter',
      costUnit: 'openrouter-credit',
      timeoutMs: over.timeoutMs ?? 5000,
      maxBodyBytes: over.maxBodyBytes ?? 65_536,
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
      place: 'openrouter/OpenAI',
    })
    const seen = await pending
    expect(seen.method).toBe('GET')
    expect(seen.path).toBe('/api/v1/generation?id=gen-17950-abc')
    expect(seen.headers.authorization).toBe('Bearer sk-test-secret')
    expect(seen.headers.accept).toBe('application/json')
    expect(seen.body.byteLength).toBe(0)
    answer = { status: 200, body: JSON.stringify(WHOLE) }
    expect(await lookup()).toMatchObject({
      kind: 'found',
      cost: [{ lexeme: '0.0002522' }],
      place: 'openrouter',
    })
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

describe('the cost lookup over a network that fails', () => {
  it('answers unavailable for a reply that does not come in time, and for one stopped while asked', async () => {
    answer = { status: 200, body: '', mode: 'hold' }
    const started = Date.now()
    expect(await lookup(undefined, { timeoutMs: 100 })).toEqual({
      kind: 'unavailable',
      diagnostic: 'timeout',
    })
    expect(Date.now() - started).toBeLessThan(3000)
    const stopping = new AbortController()
    const asked = lookup(stopping.signal)
    await server.nextRequest()
    stopping.abort()
    expect(await asked).toEqual({ kind: 'unavailable', diagnostic: 'stopped' })
    server.resetConnections()
  })

  it('answers unavailable for a body past the bound, a body cut short, and a server it cannot reach', async () => {
    answer = { status: 200, body: JSON.stringify(WHOLE) }
    expect(await lookup(undefined, { maxBodyBytes: 4095 })).toEqual({
      kind: 'unavailable',
      diagnostic: 'body-too-large',
    })
    expect(await lookup(undefined, { maxBodyBytes: 4096 })).toMatchObject({ kind: 'found' })
    answer = { status: 200, body: '{"data":', mode: 'cut' }
    expect(await lookup()).toEqual({ kind: 'unavailable', diagnostic: 'body-read' })
    const closed = new URL('/api/v1/generation', 'https://127.0.0.1:1')
    expect(await lookup(undefined, { url: closed })).toEqual({
      kind: 'unavailable',
      diagnostic: 'network',
    })
    const untrusting = openNetwork({ maxConnections: 1, idleConnectionTimeoutMs: 60_000 })
    answer = { status: 200, body: JSON.stringify(WHOLE) }
    expect(await lookup(undefined, {}, untrusting)).toEqual({
      kind: 'unavailable',
      diagnostic: 'network',
    })
    await untrusting.close()
  })
})

describe('the cost lookup of a transport', () => {
  it('asks the generation endpoint on the origin of an OpenRouter route, with the secret of the route', async () => {
    answer = { status: 200, body: JSON.stringify(WHOLE) }
    const transport = transportOver(resources, {
      url: new URL('/api/v1/chat/completions', server.url).href,
    })
    const pending = server.nextRequest()
    expect(
      await transport.lookupCost(SUPPLIER, 'gen-route-1', new AbortController().signal),
    ).toMatchObject({ kind: 'found', place: 'openrouter' })
    const seen = await pending
    expect(seen.path).toBe('/api/v1/generation?id=gen-route-1')
    expect(seen.headers.authorization).toBe('Bearer test-secret')
    await transport.close()
  })

  it('answers unsupported for a supplier with no route or a route not accounted at OpenRouter, and unavailable without a secret or once closed', async () => {
    const url = new URL('/api/v1/chat/completions', server.url).href
    const signal = new AbortController().signal
    const transport = transportOver(resources, { url })
    expect(
      await transport.lookupCost({ ...SUPPLIER, provider: providerName('elsewhere') }, 'g', signal),
    ).toEqual({ kind: 'unsupported' })
    await transport.close()
    expect(await transport.lookupCost(SUPPLIER, 'g', signal)).toEqual({
      kind: 'unavailable',
      diagnostic: 'credential-missing',
    })
    for (const options of [
      { credential: { read: () => new Map<string, string>() } },
      { credential: { read: () => undefined } },
      { auth: null },
    ]) {
      const secretless = transportOver(resources, { url, ...options })
      expect(await secretless.lookupCost(SUPPLIER, 'g', signal)).toEqual({
        kind: 'unavailable',
        diagnostic: 'credential-missing',
      })
      await secretless.close()
    }
    const elsewhere = transportOver(resources, {
      url,
      accounting: { place: 'gateway', costUnit: 'usd' },
    })
    expect(await elsewhere.lookupCost(SUPPLIER, 'g', signal)).toEqual({ kind: 'unsupported' })
    await elsewhere.close()
  })
})
