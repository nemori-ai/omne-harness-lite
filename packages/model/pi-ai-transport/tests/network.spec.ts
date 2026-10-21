// @module-tag slow — starts an openssl child process and a real local HTTPS server, and waits
// for real idle timeouts and physical socket closure.
import { Agent } from 'node:https'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createConnectionCapacity, type ConnectionCapacity } from '../src/capacity.ts'
import { createDiagnosticSink } from '../src/diagnostics.ts'
import { ExchangeQueuedError, startExchange, type ExchangeResources } from '../src/http.ts'
import {
  claimed,
  held,
  input,
  network,
  queuedRequests,
  readToEnd,
  REQUEST_PATH,
  settle,
  sleep,
  started,
  watch,
} from './support/exchange.ts'
import { createCertificate, startHttpsServer, type Certificate } from './support/https-server.ts'

let certificate: Certificate
beforeAll(() => {
  certificate = createCertificate()
})
afterAll(() => certificate.dispose())

describe('closing the network resources', () => {
  it('close stops every in-flight exchange and resolves only after each has physically stopped', async () => {
    const server = await startHttpsServer(certificate, (res, request) => {
      if (request.headers['x-answer'] === 'never') return // Never answered.
      res.writeHead(200)
      res.write('streaming') // Never ends.
    })
    const resources = network(server.ca, { maxConnections: 2 })
    try {
      const streaming = started(
        startExchange(
          resources,
          input(server.url, await held(resources)),
          new AbortController().signal,
        ),
      )
      const waiting = started(
        startExchange(
          resources,
          input(server.url, await held(resources), { headers: { 'x-answer': 'never' } }),
          new AbortController().signal,
        ),
      )
      const body = claimed(await streaming.result)
      const reader = body[Symbol.asyncIterator]()
      expect((await reader.next()).done).toBe(false)
      await expect.poll(() => server.requests.length).toBe(2)
      const stops = [watch(streaming.stopped), watch(waiting.stopped)]

      const closing = resources.close()
      expect(resources.closed).toBe(true)
      await closing
      expect(stops.map(stop => stop.done)).toEqual([true, true])
      expect(await waiting.result).toEqual({ kind: 'stopped', responded: false })
      await expect(reader.next()).rejects.toThrow()
      await expect.poll(() => server.closedSockets()).toBe(2)
    } finally {
      await resources.close()
      await server.close()
    }
  })

  it('close is remembered; afterwards nothing can be reserved or started', async () => {
    const server = await startHttpsServer(certificate, res => res.end())
    const resources = network(server.ca)
    try {
      const reservation = await held(resources)
      const first = resources.close()
      expect(resources.close()).toBe(first)
      await first
      expect(resources.closed).toBe(true)

      expect(await resources.capacity.reserve(new AbortController().signal)).toBeUndefined()
      const start = startExchange(
        resources,
        input(server.url, reservation),
        new AbortController().signal,
      )
      expect(start).toEqual({ kind: 'refused', reason: 'resources-closed' })
      expect(reservation.state).toBe('released')
      await settle()
      expect(server.requests).toHaveLength(0)
    } finally {
      await server.close()
    }
  })

  it('close destroys a pooled idle socket, so nothing stays open afterwards', async () => {
    const server = await startHttpsServer(certificate, res => res.end('pooled'))
    const resources = network(server.ca)
    try {
      const exchange = started(
        startExchange(
          resources,
          input(server.url, await held(resources)),
          new AbortController().signal,
        ),
      )
      expect(await readToEnd(claimed(await exchange.result))).toBe('pooled')
      await exchange.stopped
      expect(server.closedSockets()).toBe(0)

      await resources.close()
      await expect.poll(() => server.closedSockets()).toBe(1)
    } finally {
      await server.close()
    }
  })
})

describe('the socket pool', () => {
  it('a pooled socket idle beyond the configured timeout is closed without any request', async () => {
    const server = await startHttpsServer(certificate, res => res.end('once'))
    const resources = network(server.ca, { idleConnectionTimeoutMs: 200 })
    try {
      const exchange = started(
        startExchange(
          resources,
          input(server.url, await held(resources)),
          new AbortController().signal,
        ),
      )
      expect(await readToEnd(claimed(await exchange.result))).toBe('once')
      await exchange.stopped

      await expect.poll(() => server.closedSockets(), { timeout: 5_000 }).toBe(1)
      expect(server.requests).toHaveLength(1)
    } finally {
      await resources.close()
      await server.close()
    }
  })

  it('concurrent exchanges up to the capacity each get their own socket', async () => {
    const server = await startHttpsServer(certificate, () => {}) // Keeps every request pending.
    const resources = network(server.ca, { maxConnections: 2 })
    try {
      const exchanges = [
        started(
          startExchange(
            resources,
            input(server.url, await held(resources)),
            new AbortController().signal,
          ),
        ),
        started(
          startExchange(
            resources,
            input(server.url, await held(resources)),
            new AbortController().signal,
          ),
        ),
      ]
      await expect.poll(() => server.requests.length).toBe(2)
      expect(server.openedSockets()).toBe(2)
      for (const exchange of exchanges) exchange.stop()
      await Promise.all(exchanges.map(exchange => exchange.stopped))
    } finally {
      await resources.close()
      await server.close()
    }
  })

  it('an idle socket kept for one recipient does not queue the next exchange to another recipient', async () => {
    const first = await startHttpsServer(certificate, res => res.end('first'))
    const second = await startHttpsServer(certificate, res => res.end('second'))
    const resources = network(first.ca, { maxConnections: 1 })
    try {
      const toFirst = started(
        startExchange(
          resources,
          input(first.url, await held(resources)),
          new AbortController().signal,
        ),
      )
      expect(await readToEnd(claimed(await toFirst.result))).toBe('first')
      await toFirst.stopped
      expect(first.closedSockets()).toBe(0) // The kept-alive socket stays idle in the pool.

      const arrival = second.nextRequest()
      const toSecond = started(
        startExchange(
          resources,
          input(second.url, await held(resources)),
          new AbortController().signal,
        ),
      )
      expect(queuedRequests(resources)).toBe(0)
      // The second recipient reports the request before the caller touches the exchange.
      expect((await arrival).path).toBe(REQUEST_PATH)
      expect(await readToEnd(claimed(await toSecond.result))).toBe('second')
      await toSecond.stopped
      expect(first.requests).toHaveLength(1)
      expect(second.requests).toHaveLength(1)
    } finally {
      await resources.close()
      await first.close()
      await second.close()
    }
  })

  it('a pool that queues a request although a slot is held is a defect: nothing is sent and the slot returns', async () => {
    const server = await startHttpsServer(certificate, res => res.end('one'))
    // A deliberate mismatch the network resources never build: two slots, one socket per recipient.
    const capacity = createConnectionCapacity(2)
    const resources: ExchangeResources & Readonly<{ capacity: ConnectionCapacity }> = {
      agent: new Agent({ keepAlive: true, maxSockets: 1, timeout: 60_000 }),
      tls: { ca: server.ca },
      diagnostics: createDiagnosticSink(() => undefined, { maxPending: 1 }),
      inFlight: new Set(),
      closed: false,
      capacity,
    }
    try {
      const first = started(
        startExchange(
          resources,
          input(server.url, await held(resources)),
          new AbortController().signal,
        ),
      )
      const second = await held(resources)
      expect(() =>
        startExchange(resources, input(server.url, second), new AbortController().signal),
      ).toThrow(ExchangeQueuedError)
      expect(second.state).toBe('released')
      expect(resources.inFlight.size).toBe(1)

      expect(await readToEnd(claimed(await first.result))).toBe('one')
      await first.stopped
      await expect.poll(() => queuedRequests(resources)).toBe(0)
      await sleep(50)
      expect(server.requests).toHaveLength(1)
    } finally {
      resources.agent.destroy()
      await server.close()
    }
  })
})
