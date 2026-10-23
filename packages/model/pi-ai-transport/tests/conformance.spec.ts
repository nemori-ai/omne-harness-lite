// @module-tag slow — starts an openssl child process and a real local HTTPS server, and sends
// real requests for every transport obligation of the conformance suite.
import {
  checkModelProviderConformance,
  createScriptedConformanceSubject,
  type ConformanceSubject,
  type ScriptedPrincipal,
} from '@omne-harness/model-contract/testing'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { network } from './support/exchange.ts'
import { createCertificate, startHttpsServer, type HttpsFixture } from './support/https-server.ts'
import { REQUEST, sseBody, SUPPLIER } from './support/test-family.ts'
import { transportOver } from './support/transport.ts'

const TRANSPORT_OBLIGATIONS = [
  'transport-sends-only-at-start',
  'repeated-transport-step-sends-nothing',
  'materialization-receipt-matches-request',
  'fact-stream-ends-once',
  'interruption-is-confirmed',
  'transport-close-is-idempotent',
] as const

const certificate = createCertificate()
let server: HttpsFixture
beforeAll(async () => {
  server = await startHttpsServer(certificate, res => {
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.end(
      sseBody(JSON.stringify({ kind: 'text', value: 'hi' }), JSON.stringify({ kind: 'stop' })),
    )
  })
})
afterAll(async () => {
  await server.close()
  certificate.dispose()
})

/** The send counters of every subject built so far. */
const counters: (() => number)[] = []

/** The scripted provider, with the real transport over a fresh network for every check. */
function subject(): ConformanceSubject<ScriptedPrincipal> {
  const scripted = createScriptedConformanceSubject()
  const resources = network(server.ca, { maxConnections: 2 })
  const built = transportOver(resources, { url: new URL('/v1/chat', server.url).href })
  counters.push(built.sends)
  return {
    ...scripted,
    transport: {
      transport: built.transport,
      sends: built.sends,
      request: REQUEST,
      supplier: SUPPLIER,
    },
    async dispose() {
      await scripted.dispose?.()
      await built.close()
      await resources.close()
    },
  }
}

it('the real transport passes every transport obligation of the conformance suite', async () => {
  const before = server.requests.length
  const report = await checkModelProviderConformance({ subject, waitMs: 5_000 })
  const results = TRANSPORT_OBLIGATIONS.map(name => {
    const result = report.results.find(entry => entry.obligation === name)
    return { obligation: name, status: result?.status, detail: result?.detail }
  })
  expect(results).toEqual(
    TRANSPORT_OBLIGATIONS.map(obligation => ({ obligation, status: 'pass', detail: '' })),
  )
  // The package count agrees with the server: every counted send arrived, and nothing else did.
  const counted = counters.reduce((total, sends) => total + sends(), 0)
  expect(counted).toBeGreaterThan(0)
  await expect.poll(() => server.requests.length - before).toBe(counted)
})
