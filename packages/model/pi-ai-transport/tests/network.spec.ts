// @module-tag slow — starts an openssl child process and a real local HTTPS server, and waits
// for real idle timeouts and physical socket closure.
import type { ServerResponse } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ExchangeQueuedError, startExchange } from '../src/http.ts'
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

  it('a pool that queues a request although a slot is held is a defect: the request leaves the queue, nothing is sent for it, not even after close()', async () => {
    const server = await startHttpsServer(certificate, () => {}) // Keeps the first request pending.
    const resources = network(server.ca, { maxConnections: 2 })
    // A deliberate bypass of the configuration, which the network resources never build: the pool
    // now has one socket for the recipient and queues the second request although a slot is held.
    resources.agent.maxSockets = 1
    try {
      started(
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
      // In the same tick: the slot is back, the request is out of the queue, nothing waits.
      expect(second.state).toBe('released')
      expect(resources.agent.requests).toEqual({})
      expect(resources.inFlight.size).toBe(1)
      await server.nextRequest()
      expect(server.openedSockets()).toBe(1)

      // The close of the first socket would hand a connection to a request still in the queue.
      await resources.close()
      await expect.poll(() => server.closedSockets()).toBe(1)
      await sleep(100)
      expect(server.openedSockets()).toBe(1)
      expect(server.requests).toHaveLength(1)
    } finally {
      await resources.close()
      await server.close()
    }
  })
})

describe('the capacity as the only limit of the exchanges in flight', () => {
  // `Keep-Alive: timeout=1` is below the reuse margin of Node's agent: the pool destroys the
  // socket at the request's close and takes it out of its count only when the socket's close
  // arrives, on a later turn of the loop. The slot is back at the request's close already.
  function answerWithoutKeepingTheSocket(res: ServerResponse, body: string): void {
    res.setHeader('keep-alive', 'timeout=1')
    res.end(body)
  }

  it('the next exchange to the same recipient starts right after stopped, although the pool did not keep the socket', async () => {
    const server = await startHttpsServer(certificate, res =>
      answerWithoutKeepingTheSocket(res, 'again'),
    )
    const resources = network(server.ca, { maxConnections: 1 })
    try {
      for (let turn = 0; turn < 3; turn += 1) {
        const exchange = started(
          startExchange(
            resources,
            input(server.url, await held(resources)),
            new AbortController().signal,
          ),
        )
        expect(await readToEnd(claimed(await exchange.result))).toBe('again')
        await exchange.stopped
      }
      expect(server.requests).toHaveLength(3)
    } finally {
      await resources.close()
      await server.close()
    }
  })

  it('twelve callers through a capacity of three to one recipient all complete, never more than three at once', async () => {
    let pending = 0
    let mostPending = 0
    const answers: (() => void)[] = []
    let answering: NodeJS.Timeout | undefined
    // The server answers once the whole capacity is in use, after a pause in which one request
    // too many would still arrive and be counted; much later if fewer ever arrive together.
    const server = await startHttpsServer(certificate, res => {
      pending += 1
      mostPending = Math.max(mostPending, pending)
      answers.push(() => {
        pending -= 1
        answerWithoutKeepingTheSocket(res, 'ok')
      })
      clearTimeout(answering)
      answering = setTimeout(
        () => {
          for (const answer of answers.splice(0)) answer()
        },
        answers.length === 3 ? 50 : 500,
      )
    })
    const resources = network(server.ca, { maxConnections: 3 })
    try {
      const outcomes = await Promise.all(
        Array.from({ length: 12 }, async () => {
          const exchange = started(
            startExchange(
              resources,
              input(server.url, await held(resources)),
              new AbortController().signal,
            ),
          )
          const result = await exchange.result
          if (result.kind === 'ok') await readToEnd(claimed(result))
          await exchange.stopped
          return result.kind
        }),
      )
      expect(outcomes).toEqual(Array.from({ length: 12 }, () => 'ok'))
      expect(mostPending).toBe(3)
      expect(server.requests).toHaveLength(12)
    } finally {
      await resources.close()
      await server.close()
    }
  })
})
