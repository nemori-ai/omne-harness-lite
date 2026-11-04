// @module-tag slow — starts an openssl child process and a real local HTTPS server, and connects to
// a closed local port and a server that resets after the request, with real (short) backoffs.
import type { TransportFact } from '@omne-harness/model-contract/provider'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PiTransportLimits } from '../src/index.ts'
import type { TransportDiagnostic } from '../src/diagnostics.ts'
import { network } from './support/exchange.ts'
import {
  createCertificate,
  startHttpsServer,
  type Certificate,
  type HttpsFixture,
} from './support/https-server.ts'
import { LIMITS } from './support/test-family.ts'
import { collect, slotFree, transportOver } from './support/transport.ts'

const PATH = '/api/v1/chat/completions'
const CONNECT_FAILED: TransportFact = {
  kind: 'ended',
  termination: {
    kind: 'failed',
    fault: { cause: 'upstream-unavailable', diagnostic: 'connect-failed', upstreamStatus: null },
  },
}

let certificate: Certificate
beforeAll(() => {
  certificate = createCertificate()
})
afterAll(() => certificate.dispose())

function limitsWith(backoffMs: readonly number[]): PiTransportLimits {
  return { ...LIMITS, connectRetry: { backoffMs } }
}

function retries(observed: readonly TransportDiagnostic[]): TransportDiagnostic[] {
  return observed.filter(event => event.kind === 'connect-retry')
}

/** A URL on which nothing listens: a server that has been started and closed. */
async function refusedUrl(): Promise<{ url: string; server: HttpsFixture }> {
  const server = await startHttpsServer(certificate, () => {})
  const url = new URL(PATH, server.url).href
  await server.close()
  return { url, server }
}

describe('retry of a send over real sockets', () => {
  it('a refused connection is retried with the backoff, then ends with the original fault', async () => {
    const { url } = await refusedUrl()
    const observed: TransportDiagnostic[] = []
    const resources = network(certificate.cert, {}, observed)
    const transport = transportOver(resources, { url, limits: limitsWith([20, 40]) })
    try {
      const started = Date.now()
      const facts = await collect(
        (await transport.materialize()).start(new AbortController().signal),
      )
      expect(facts).toEqual([CONNECT_FAILED])
      expect(transport.sends()).toBe(3)
      expect(Date.now() - started).toBeGreaterThanOrEqual(55)
      expect(retries(observed)).toEqual([
        { kind: 'connect-retry', level: 'info', attempt: 1, delayMs: 20, reason: 'connect-failed' },
        { kind: 'connect-retry', level: 'info', attempt: 2, delayMs: 40, reason: 'connect-failed' },
      ])
      expect(await slotFree(resources)).toBe(true)
    } finally {
      await transport.close()
      await resources.close()
    }
  })

  it('tells the observer of the transport before each retry, and a throwing observer changes nothing', async () => {
    const { url } = await refusedUrl()
    const told: unknown[] = []
    const resources = network(certificate.cert)
    const transport = transportOver(resources, {
      url,
      limits: limitsWith([20, 40]),
      onConnectRetry: event => {
        told.push(event)
        throw new Error('the observer broke')
      },
    })
    try {
      const facts = await collect(
        (await transport.materialize()).start(new AbortController().signal),
      )
      expect(facts).toEqual([CONNECT_FAILED])
      expect(transport.sends()).toBe(3)
      expect(told).toEqual([
        { kind: 'connect-retry', level: 'info', attempt: 1, delayMs: 20, reason: 'connect-failed' },
        { kind: 'connect-retry', level: 'info', attempt: 2, delayMs: 40, reason: 'connect-failed' },
      ])
    } finally {
      await transport.close()
      await resources.close()
    }
  })

  it('without connectRetry a refused connection is sent once', async () => {
    const { url } = await refusedUrl()
    const resources = network(certificate.cert)
    const transport = transportOver(resources, { url })
    try {
      const facts = await collect(
        (await transport.materialize()).start(new AbortController().signal),
      )
      expect(facts).toEqual([CONNECT_FAILED])
      expect(transport.sends()).toBe(1)
    } finally {
      await transport.close()
      await resources.close()
    }
  })

  it('a connection that closes after the request reached the server is not retried', async () => {
    const server = await startHttpsServer(certificate, res => {
      res.socket?.destroy()
    })
    const observed: TransportDiagnostic[] = []
    const resources = network(server.ca, {}, observed)
    const transport = transportOver(resources, {
      url: new URL(PATH, server.url).href,
      limits: limitsWith([20, 40]),
    })
    try {
      const facts = await collect(
        (await transport.materialize()).start(new AbortController().signal),
      )
      expect(facts).toEqual([CONNECT_FAILED])
      expect(transport.sends()).toBe(1)
      expect(server.requests).toHaveLength(1)
      expect(retries(observed)).toEqual([])
    } finally {
      await transport.close()
      await resources.close()
      await server.close()
    }
  })

  it('the cancel signal ends a long backoff at once', async () => {
    const { url } = await refusedUrl()
    const observed: TransportDiagnostic[] = []
    const resources = network(certificate.cert, {}, observed)
    const transport = transportOver(resources, { url, limits: limitsWith([600_000]) })
    try {
      const controller = new AbortController()
      const running = collect((await transport.materialize()).start(controller.signal))
      await waitFor(() => retries(observed).length === 1)
      const started = Date.now()
      controller.abort()
      expect(await running).toEqual([
        { kind: 'ended', termination: { kind: 'interrupted', stop: 'confirmed' } },
      ])
      expect(Date.now() - started).toBeLessThan(2_000)
      expect(transport.sends()).toBe(1)
      expect(await slotFree(resources)).toBe(true)
    } finally {
      await transport.close()
      await resources.close()
    }
  })

  it('closing the materialized transport ends a long backoff at once', async () => {
    const { url } = await refusedUrl()
    const observed: TransportDiagnostic[] = []
    const resources = network(certificate.cert, {}, observed)
    const transport = transportOver(resources, { url, limits: limitsWith([600_000]) })
    try {
      const materialized = await transport.materialize()
      const running = collect(materialized.start(new AbortController().signal))
      await waitFor(() => retries(observed).length === 1)
      const started = Date.now()
      await materialized.close()
      expect(await running).toEqual([
        { kind: 'ended', termination: { kind: 'interrupted', stop: 'confirmed' } },
      ])
      expect(Date.now() - started).toBeLessThan(2_000)
      expect(transport.sends()).toBe(1)
    } finally {
      await transport.close()
      await resources.close()
    }
  })
})

async function waitFor(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 20_000
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('condition not reached in time')
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}
