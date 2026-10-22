// @module-tag slow — starts an openssl child process and talks to a real local HTTPS server,
// with real waiting for connect timeouts and physical socket closure.
import type { ClientRequest } from 'node:http'
import type { RequestOptions } from 'node:https'
import { createServer as createTcpServer } from 'node:net'
import type { JsonLimits } from '@omne-harness/json-text'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { TransportDiagnostic } from '../src/diagnostics.ts'
import { readProtocolFrames } from '../src/frames.ts'
import {
  ResponseBodyReadError,
  ResponseBodyStoppedError,
  startExchange,
  type ExchangeResult,
  type HttpExchange,
} from '../src/http.ts'
import type { NetworkResources } from '../src/network.ts'
import { readSseEvents } from '../src/sse.ts'
import {
  activeTimers,
  claimed,
  clientSockets,
  decoder,
  encoder,
  expectCleanedUp,
  held,
  input,
  network,
  readToEnd,
  REQUEST_BODY,
  REQUEST_HEADERS,
  REQUEST_PATH,
  settle,
  sleep,
  started,
  watch,
} from './support/exchange.ts'
import {
  createCertificate,
  startBlackHole,
  startHttpsServer,
  type Certificate,
  type HttpsFixture,
  type RequestHandler,
} from './support/https-server.ts'

/** Every request Node built for this file, recorded by a delegate of the real `https.request`. */
const built = vi.hoisted((): { readonly requests: ClientRequest[] } => ({ requests: [] }))
vi.mock('node:https', async importOriginal => {
  const actual = await importOriginal<typeof import('node:https')>()
  const request = (url: URL, options: RequestOptions): ClientRequest => {
    const req = actual.request(url, options)
    built.requests.push(req)
    return req
  }
  return { ...actual, request }
})

const JSON_LIMITS: JsonLimits = {
  maxBytes: 4096,
  maxDepth: 16,
  maxItems: 256,
  maxMembers: 64,
  maxStringLength: 1024,
  maxNumberLength: 64,
}

let certificate: Certificate
beforeAll(() => {
  certificate = createCertificate()
})
afterAll(() => certificate.dispose())

/** A server and a network bound to it; both are closed after `run`. */
async function withServer(
  handler: RequestHandler,
  run: (server: HttpsFixture, resources: NetworkResources) => Promise<void>,
  observed?: TransportDiagnostic[],
): Promise<void> {
  const server = await startHttpsServer(certificate, handler)
  const resources = network(server.ca, {}, observed)
  try {
    await run(server, resources)
  } finally {
    await resources.close()
    await server.close()
  }
}

function okOf(result: ExchangeResult) {
  if (result.kind !== 'ok') throw new Error(`expected a 2xx result, got ${result.kind}`)
  return result
}

function httpErrorOf(result: ExchangeResult) {
  if (result.kind !== 'http-error') throw new Error(`expected an HTTP error, got ${result.kind}`)
  return result
}

/** Waits until the exchange's client socket has read at least one byte of the response. */
async function responseArrived(resources: NetworkResources): Promise<void> {
  await expect
    .poll(() => clientSockets(resources).some(socket => socket.bytesRead > 0), { timeout: 5_000 })
    .toBe(true)
}

describe('starting an exchange', () => {
  it('the request is written out when startExchange returns, before the caller awaits', async () => {
    await withServer(
      res => res.end('done'),
      async (server, resources) => {
        const reservation = await held(resources)
        const signal = new AbortController().signal
        const arrival = server.nextRequest()
        const before = built.requests.length

        const start = startExchange(resources, input(server.url, reservation), signal)
        expect(start.kind).toBe('started')
        expect(Object.getPrototypeOf(startExchange)).toBe(Function.prototype)
        // In the same tick: Node holds one new request and its end() was called.
        expect(built.requests).toHaveLength(before + 1)
        expect(built.requests.at(-1)?.writableEnded).toBe(true)
        // Nothing of the exchange is touched before the server reports the request.
        const request = await arrival
        expect(request).toMatchObject({ method: 'POST', path: REQUEST_PATH })
        expect(request.headers).toMatchObject({
          ...REQUEST_HEADERS,
          'content-length': String(REQUEST_BODY.byteLength),
        })
        expect(Buffer.from(request.body).equals(REQUEST_BODY)).toBe(true)
        expect(reservation.state).toBe('consumed')

        const exchange = started(start)
        const result = okOf(await exchange.result)
        expect(result.status).toBe(200)
        expect(await readToEnd(claimed(result))).toBe('done')
        await exchange.stopped
        expect(reservation.state).toBe('released')
        expectCleanedUp(resources, signal)
      },
    )
  })

  it('the headers reach the wire as given and the diagnostics carry only kind and level', async () => {
    const observed: TransportDiagnostic[] = []
    await withServer(
      res => res.end(),
      async (server, resources) => {
        const exchange = started(
          startExchange(
            resources,
            input(server.url, await held(resources)),
            new AbortController().signal,
          ),
        )
        expect(await readToEnd(claimed(await exchange.result))).toBe('')
        await exchange.stopped
        expect(server.requests[0]?.headers.authorization).toBe(REQUEST_HEADERS.authorization)
        expect(observed.map(event => event.kind)).toEqual(['exchange-started', 'exchange-stopped'])
        for (const event of observed) expect(Object.keys(event).sort()).toEqual(['kind', 'level'])
      },
      observed,
    )
  })

  it('a signal already aborted sends nothing and returns the held reservation', async () => {
    await withServer(
      res => res.end(),
      async (server, resources) => {
        const reservation = await held(resources)
        const controller = new AbortController()
        controller.abort()

        const start = startExchange(resources, input(server.url, reservation), controller.signal)
        expect(start).toEqual({ kind: 'refused', reason: 'cancelled' })
        expect(reservation.state).toBe('released')
        expect((await held(resources)).state).toBe('held')
        await settle()
        expect(server.requests).toHaveLength(0)
        expect(server.openedSockets()).toBe(0)
      },
    )
  })
})

describe('stopping an exchange', () => {
  it('abort before the response closes the socket; the slot returns only after stopped', async () => {
    await withServer(
      () => {}, // Receives the request and never answers.
      async (server, resources) => {
        const reservation = await held(resources)
        const controller = new AbortController()
        const exchange = started(
          startExchange(resources, input(server.url, reservation), controller.signal),
        )
        await server.nextRequest()
        const next = watch(resources.capacity.reserve(new AbortController().signal))

        controller.abort()
        await settle()
        expect(reservation.state).toBe('consumed')
        expect(next.done).toBe(false)

        expect(await exchange.result).toEqual({ kind: 'stopped', responded: false })
        await exchange.stopped
        expect(reservation.state).toBe('released')
        await settle()
        expect(next.value?.state).toBe('held')
        await expect.poll(() => server.closedSockets()).toBe(1)
      },
    )
  })

  it('stop() on the handle ends the exchange like the signal does, idempotently', async () => {
    await withServer(
      () => {},
      async (server, resources) => {
        const signal = new AbortController().signal
        const exchange = started(
          startExchange(resources, input(server.url, await held(resources)), signal),
        )
        await server.nextRequest()
        exchange.stop()
        exchange.stop()
        expect(await exchange.result).toEqual({ kind: 'stopped', responded: false })
        await exchange.stopped
        expectCleanedUp(resources, signal)
        exchange.stop()
        await expect.poll(() => server.closedSockets()).toBe(1)
      },
    )
  })

  it('abort while a 2xx body streams fails the reader as stopped; the slot returns after the physical close', async () => {
    await withServer(
      res => {
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        res.write('data: first\n\n') // Never ends.
      },
      async (server, resources) => {
        const reservation = await held(resources)
        const controller = new AbortController()
        const exchange = started(
          startExchange(resources, input(server.url, reservation), controller.signal),
        )
        const body = okOf(await exchange.result).body.claim()
        if (body === undefined) throw new Error('expected the body')
        const reader = body[Symbol.asyncIterator]()
        const first = await reader.next()
        expect(first.done).toBe(false)
        expect(decoder.decode(first.value)).toBe('data: first\n\n')

        controller.abort()
        await expect(reader.next()).rejects.toBeInstanceOf(ResponseBodyStoppedError)
        await exchange.stopped
        expect(reservation.state).toBe('released')
        await expect.poll(() => server.closedSockets()).toBe(1)
      },
    )
  })

  it('abort while the error body is being read wins with responded: true', async () => {
    await withServer(
      res => {
        res.writeHead(503, { 'content-length': '64' })
        res.write('{"error":"partial') // Never completes the declared length.
      },
      async (server, resources) => {
        const reservation = await held(resources)
        const controller = new AbortController()
        const exchange = started(
          startExchange(resources, input(server.url, reservation), controller.signal),
        )
        await responseArrived(resources)
        const result = watch(exchange.result)
        await settle()
        expect(result.done).toBe(false)

        controller.abort()
        expect(await exchange.result).toEqual({ kind: 'stopped', responded: true })
        await exchange.stopped
        expect(reservation.state).toBe('released')
        await expect.poll(() => server.closedSockets()).toBe(1)
      },
    )
  })
})

describe('a 2xx body that ends before its end', () => {
  type Ending = Readonly<{
    name: string
    end: (exchange: HttpExchange, resources: NetworkResources, server: HttpsFixture) => void
    error: typeof ResponseBodyStoppedError | typeof ResponseBodyReadError
  }>
  const endings: readonly Ending[] = [
    {
      name: 'stop() on the handle',
      end: exchange => exchange.stop(),
      error: ResponseBodyStoppedError,
    },
    {
      name: 'close() of the network resources',
      end: (_exchange, resources) => watch(resources.close()),
      error: ResponseBodyStoppedError,
    },
    {
      name: 'a reset by the server',
      end: (_exchange, _resources, server) => server.resetConnections(),
      error: ResponseBodyReadError,
    },
  ]

  it.each(endings)(
    'after $name the reader sees a typed error and the result stays ok',
    async ending => {
      await withServer(
        res => {
          res.writeHead(200)
          res.write('first') // Never ends.
        },
        async (server, resources) => {
          const reservation = await held(resources)
          const signal = new AbortController().signal
          const exchange = started(startExchange(resources, input(server.url, reservation), signal))
          const reader = claimed(await exchange.result)[Symbol.asyncIterator]()
          expect(decoder.decode((await reader.next()).value)).toBe('first')

          ending.end(exchange, resources, server)
          const failure = await reader.next().then(
            () => undefined,
            (error: unknown) => error,
          )
          expect(failure).toBeInstanceOf(ending.error)
          if (failure instanceof ResponseBodyReadError) expect(failure.cause).toBeInstanceOf(Error)
          await exchange.stopped
          expect((await exchange.result).kind).toBe('ok')
          expect(reservation.state).toBe('released')
          expectCleanedUp(resources, signal)
        },
      )
    },
  )
})

describe('a 2xx response', () => {
  it('the body is claimed once; the slot returns after it is read to the end on a kept-alive socket', async () => {
    await withServer(
      res => {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'x-request-id': 'r-1' })
        res.write('data: {"a":1}\n\n')
        res.end('data: [DONE]\n\n')
      },
      async (server, resources) => {
        const reservation = await held(resources)
        const exchange = started(
          startExchange(resources, input(server.url, reservation), new AbortController().signal),
        )
        const result = okOf(await exchange.result)
        expect(result.headers['x-request-id']).toBe('r-1')
        expect(reservation.state).toBe('consumed')

        const body = result.body.claim()
        if (body === undefined) throw new Error('expected the body')
        expect(result.body.claim()).toBeUndefined()
        expect(await readToEnd(body)).toBe('data: {"a":1}\n\ndata: [DONE]\n\n')
        await exchange.stopped
        expect(reservation.state).toBe('released')
        expect(server.closedSockets()).toBe(0)
      },
    )
  })

  it('a reader that stops early closes the response and the exchange', async () => {
    await withServer(
      res => {
        res.writeHead(200)
        res.write('first')
        res.write('second') // Never ends.
      },
      async (server, resources) => {
        const reservation = await held(resources)
        const exchange = started(
          startExchange(resources, input(server.url, reservation), new AbortController().signal),
        )
        const body = okOf(await exchange.result).body.claim()
        if (body === undefined) throw new Error('expected the body')
        for await (const chunk of body) {
          expect(chunk.byteLength).toBeGreaterThan(0)
          break
        }
        await exchange.stopped
        expect(reservation.state).toBe('released')
        await expect.poll(() => server.closedSockets()).toBe(1)
      },
    )
  })

  it('a reader that ends the body before its first next() still closes the response and returns the slot', async () => {
    await withServer(
      res => {
        res.writeHead(200)
        res.write('chunk') // Never ends.
      },
      async (server, resources) => {
        const reservation = await held(resources)
        const exchange = started(
          startExchange(resources, input(server.url, reservation), new AbortController().signal),
        )
        const reader = claimed(await exchange.result)[Symbol.asyncIterator]()
        await reader.return?.()
        await exchange.stopped
        expect(reservation.state).toBe('released')
        await expect.poll(() => server.closedSockets()).toBe(1)
      },
    )
  })

  it('ending the frames before the first one closes the SSE layer, the body, the response and the exchange', async () => {
    await withServer(
      res => {
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        res.write('data: {}\n\n') // Never ends.
      },
      async (server, resources) => {
        const reservation = await held(resources)
        const exchange = started(
          startExchange(resources, input(server.url, reservation), new AbortController().signal),
        )
        const frames = readProtocolFrames(readSseEvents(claimed(await exchange.result), 1024), {
          endMarker: '[DONE]',
          json: JSON_LIMITS,
        })
        await frames.return()
        await exchange.stopped
        expect(reservation.state).toBe('released')
        await expect.poll(() => server.closedSockets()).toBe(1)
      },
    )
  })
})

describe('a non-2xx response', () => {
  it.each([429, 503])(
    '%s is one request with its status, raw headers and complete error body',
    async status => {
      await withServer(
        res => {
          res.setHeader('set-cookie', ['a=1', 'b=2'])
          res.writeHead(status, { 'retry-after': '7', 'content-type': 'application/json' })
          res.end('{"error":{"message":"busy"}}')
        },
        async (server, resources) => {
          const reservation = await held(resources)
          const signal = new AbortController().signal
          const exchange = started(startExchange(resources, input(server.url, reservation), signal))
          const result = httpErrorOf(await exchange.result)
          expect(result.status).toBe(status)
          expect(result.headers).toMatchObject({ 'retry-after': '7', 'set-cookie': ['a=1', 'b=2'] })
          expect(Object.isFrozen(result.headers)).toBe(true)
          expect(Object.values(result.headers).every(value => value !== undefined)).toBe(true)
          expect(result.errorBody).toEqual({
            kind: 'complete',
            bytes: encoder.encode('{"error":{"message":"busy"}}'),
          })
          await exchange.stopped
          expect(reservation.state).toBe('released')
          expectCleanedUp(resources, signal)
          await sleep(50)
          expect(server.requests).toHaveLength(1)
        },
      )
    },
  )

  it('302 is an HTTP error with its location; the redirect is not followed', async () => {
    await withServer(
      (res, request) => {
        if (request.path === REQUEST_PATH) {
          res.writeHead(302, { location: '/elsewhere' })
          res.end('moved')
          return
        }
        res.end('followed')
      },
      async (server, resources) => {
        const exchange = started(
          startExchange(
            resources,
            input(server.url, await held(resources)),
            new AbortController().signal,
          ),
        )
        const result = httpErrorOf(await exchange.result)
        expect(result.status).toBe(302)
        expect(result.headers.location).toBe('/elsewhere')
        expect(result.errorBody).toEqual({ kind: 'complete', bytes: encoder.encode('moved') })
        await exchange.stopped
        await sleep(50)
        expect(server.requests.map(request => request.path)).toEqual([REQUEST_PATH])
      },
    )
  })

  it('an error body over the limit is dropped as a whole and the connection is closed', async () => {
    const observed: TransportDiagnostic[] = []
    await withServer(
      res => {
        res.writeHead(500, { 'content-type': 'text/plain' })
        for (let index = 0; index < 8; index += 1) res.write('0123456789')
        res.end()
      },
      async (server, resources) => {
        const reservation = await held(resources)
        const exchange = started(
          startExchange(
            resources,
            input(server.url, reservation, { maxErrorBodyBytes: 32 }),
            new AbortController().signal,
          ),
        )
        const result = httpErrorOf(await exchange.result)
        expect(result.status).toBe(500)
        expect(result.errorBody).toEqual({ kind: 'too-large' })
        await exchange.stopped
        expect(reservation.state).toBe('released')
        await expect.poll(() => server.closedSockets()).toBe(1)
        expect(observed.map(event => event.kind)).toContain('error-body-too-large')
      },
      observed,
    )
  })

  it('an error body exactly at the limit is complete', async () => {
    await withServer(
      res => {
        res.writeHead(400)
        res.end('0123456789')
      },
      async (server, resources) => {
        const exchange = started(
          startExchange(
            resources,
            input(server.url, await held(resources), { maxErrorBodyBytes: 10 }),
            new AbortController().signal,
          ),
        )
        expect(httpErrorOf(await exchange.result).errorBody).toEqual({
          kind: 'complete',
          bytes: encoder.encode('0123456789'),
        })
        await exchange.stopped
      },
    )
  })

  it('a connection lost inside the error body is a read failure, not a complete body', async () => {
    await withServer(
      res => {
        res.writeHead(500, { 'content-length': '40' })
        res.write('only the start', () => res.destroy())
      },
      async (server, resources) => {
        const reservation = await held(resources)
        const exchange = started(
          startExchange(resources, input(server.url, reservation), new AbortController().signal),
        )
        const result = httpErrorOf(await exchange.result)
        expect(result.status).toBe(500)
        expect(result.errorBody).toEqual({ kind: 'read-failed' })
        await exchange.stopped
        expect(reservation.state).toBe('released')
      },
    )
  })
})

describe('connecting', () => {
  it('a new connection that never completes its TLS handshake times out', async () => {
    const hole = await startBlackHole()
    const observed: TransportDiagnostic[] = []
    const resources = network(certificate.cert, {}, observed)
    try {
      const reservation = await held(resources)
      const begun = Date.now()
      const exchange = started(
        startExchange(
          resources,
          input(hole.url, reservation, { connectTimeoutMs: 300 }),
          new AbortController().signal,
        ),
      )
      expect(await exchange.result).toEqual({ kind: 'connect-failed', timeout: true })
      expect(Date.now() - begun).toBeGreaterThanOrEqual(290)
      await exchange.stopped
      expect(reservation.state).toBe('released')
      expect(observed.map(event => event.kind)).toEqual([
        'exchange-started',
        'connect-failed',
        'exchange-stopped',
      ])
    } finally {
      await resources.close()
      await hole.close()
    }
  })

  it('a stop before the TLS handshake clears the connect timer together with the exchange', async () => {
    const hole = await startBlackHole()
    const resources = network(certificate.cert)
    try {
      const reservation = await held(resources)
      const timersBefore = activeTimers()
      const exchange = started(
        startExchange(
          resources,
          input(hole.url, reservation, { connectTimeoutMs: 60_000 }),
          new AbortController().signal,
        ),
      )
      await settle() // The pool hands the socket over on a later tick; the timer starts then.
      expect(activeTimers()).toBe(timersBefore + 1)

      exchange.stop()
      expect(await exchange.result).toEqual({ kind: 'stopped', responded: false })
      await exchange.stopped
      expect(activeTimers()).toBe(timersBefore)
      expect(reservation.state).toBe('released')
    } finally {
      await resources.close()
      await hole.close()
    }
  })

  it('the connect timeout does not apply to a reused connection', async () => {
    await withServer(
      async (res, request) => {
        if (request.headers['x-turn'] === 'second') await sleep(500)
        res.end(String(request.headers['x-turn']))
      },
      async (server, resources) => {
        for (const turn of ['first', 'second']) {
          const exchange = started(
            startExchange(
              resources,
              input(server.url, await held(resources), {
                headers: { ...REQUEST_HEADERS, 'x-turn': turn },
                connectTimeoutMs: 200,
              }),
              new AbortController().signal,
            ),
          )
          expect(await readToEnd(claimed(await exchange.result))).toBe(turn)
          await exchange.stopped
        }
        expect(server.openedSockets()).toBe(1)
        expect(server.closedSockets()).toBe(0)
      },
    )
  })

  it('a refused connection fails without a timeout and returns the slot', async () => {
    const probe = createTcpServer()
    await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve))
    const address = probe.address()
    if (address === null || typeof address === 'string') throw new Error('no port')
    await new Promise<void>(resolve => probe.close(() => resolve()))
    const resources = network(certificate.cert)
    try {
      const reservation = await held(resources)
      const signal = new AbortController().signal
      const exchange = started(
        startExchange(
          resources,
          input(new URL(`https://127.0.0.1:${address.port}/`), reservation),
          signal,
        ),
      )
      expect(await exchange.result).toEqual({ kind: 'connect-failed', timeout: false })
      await exchange.stopped
      expect(reservation.state).toBe('released')
      expectCleanedUp(resources, signal)
    } finally {
      await resources.close()
    }
  })

  it('the largest delay a Node timer takes is accepted as the connect timeout', async () => {
    await withServer(
      res => res.end('fine'),
      async (server, resources) => {
        const exchange = started(
          startExchange(
            resources,
            input(server.url, await held(resources), { connectTimeoutMs: 2_147_483_647 }),
            new AbortController().signal,
          ),
        )
        expect(await readToEnd(claimed(await exchange.result))).toBe('fine')
        await exchange.stopped
      },
    )
  })
})

describe('the diagnostic observer', () => {
  it('an observer that throws, rejects or hangs changes no exchange result', async () => {
    const behaviours = [
      () => {
        throw new Error('observer broke')
      },
      () => Promise.reject(new Error('observer rejected')),
      () => new Promise<void>(() => {}),
    ]
    for (const observer of behaviours) {
      const server = await startHttpsServer(certificate, res => res.end('fine'))
      const resources = network(server.ca, { diagnostics: { observer, maxPending: 1 } })
      try {
        const exchange = started(
          startExchange(
            resources,
            input(server.url, await held(resources)),
            new AbortController().signal,
          ),
        )
        const result = okOf(await exchange.result)
        expect(await readToEnd(claimed(result))).toBe('fine')
        await exchange.stopped
        await settle()
        const counters = resources.diagnostics.counters()
        expect(counters.failed + counters.pending + counters.dropped).toBe(2)
      } finally {
        await resources.close()
        await server.close()
      }
    }
  })
})
