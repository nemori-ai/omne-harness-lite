// @module-tag slow — starts an openssl child process, a real local HTTPS server and a real local
// CONNECT proxy, and waits for real connect timeouts, proxy resets and socket closure.
import { createServer as createTcpServer } from 'node:net'
import type { JsonLimits } from '@omne-harness/json-text'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { TransportDiagnostic } from '../src/diagnostics.ts'
import { readProtocolFrames } from '../src/frames.ts'
import { startExchange, type ExchangeResult } from '../src/http.ts'
import type { NetworkConfig, NetworkResources } from '../src/network.ts'
import { readSseEvents } from '../src/sse.ts'
import { startConnectProxy, type ConnectProxy, type ProxyMode } from './support/connect-proxy.ts'
import {
  claimed,
  expectCleanedUp,
  held,
  input,
  network,
  readToEnd,
  sleep,
  started,
} from './support/exchange.ts'
import {
  createCertificate,
  startBlackHole,
  startHttpsServer,
  type Certificate,
  type RequestHandler,
} from './support/https-server.ts'

const JSON_LIMITS: JsonLimits = {
  maxBytes: 4096,
  maxDepth: 16,
  maxItems: 256,
  maxMembers: 64,
  maxStringLength: 1024,
  maxNumberLength: 64,
}

/** Far beyond every bound below: Node's own tunnel timeout never decides an outcome here. */
const IDLE_MS = 60_000
/** What "promptly" means for a stop, a close or a connect timeout: well under `IDLE_MS`. */
const PROMPT_MS = 1_000

let certificate: Certificate
beforeAll(() => {
  certificate = createCertificate()
})
afterAll(() => certificate.dispose())

/** Network resources whose exchanges go through `proxyUrl`, unless `bypass` matches the host. */
function proxied(
  proxyUrl: URL | string,
  overrides: Partial<NetworkConfig> = {},
  observed?: TransportDiagnostic[],
): NetworkResources {
  return network(
    certificate.cert,
    {
      idleConnectionTimeoutMs: IDLE_MS,
      proxy: { url: String(proxyUrl), bypass: [] },
      ...overrides,
    },
    observed,
  )
}

/** The promise's value, or a failure when it does not settle within `ms`. */
async function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const bound = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`not settled within ${ms} ms`)), ms)
  })
  try {
    return await Promise.race([promise, bound])
  } finally {
    clearTimeout(timer)
  }
}

/** A proxy and its resources; the proxy closes first, so a hung tunnel cannot hold `close()`. */
async function withProxy(
  mode: ProxyMode,
  run: (proxy: ConnectProxy) => Promise<NetworkResources | undefined>,
): Promise<void> {
  const proxy = await startConnectProxy(mode)
  let resources: NetworkResources | undefined
  try {
    resources = await run(proxy)
  } finally {
    await proxy.close()
    await resources?.close()
  }
}

/** A port on 127.0.0.1 that nothing listens on. */
async function closedPort(): Promise<number> {
  const probe = createTcpServer()
  await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve))
  const address = probe.address()
  if (address === null || typeof address === 'string') throw new Error('no port')
  await new Promise<void>(resolve => probe.close(() => resolve()))
  return address.port
}

const sse: RequestHandler = res => {
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  res.end('data: {"n":1}\n\ndata: [DONE]\n\n')
}

describe('connecting through a proxy', () => {
  it('a tunnel carries the exchange: the proxy sees one CONNECT and the SSE body reaches its end-marker', async () => {
    const server = await startHttpsServer(certificate, sse)
    try {
      await withProxy('tunnel', async proxy => {
        const resources = proxied(proxy.url)
        const exchange = started(
          startExchange(
            resources,
            input(server.url, await held(resources)),
            new AbortController().signal,
          ),
        )
        const result = await exchange.result
        expect(result).toMatchObject({ kind: 'ok', status: 200 })
        const kinds: string[] = []
        for await (const frame of readProtocolFrames(readSseEvents(claimed(result), 1024), {
          endMarker: '[DONE]',
          json: JSON_LIMITS,
        }))
          kinds.push('ok' in frame ? frame.ok.kind : frame.failure)
        expect(kinds).toEqual(['data', 'end-marker'])
        await exchange.stopped
        expect(proxy.connects).toEqual([server.url.host])
        expect(server.requests).toHaveLength(1)
        return resources
      })
    } finally {
      await server.close()
    }
  })

  it('a host on the bypass list is reached directly: the proxy sees no CONNECT', async () => {
    const server = await startHttpsServer(certificate, res => res.end('direct'))
    try {
      await withProxy('tunnel', async proxy => {
        const resources = network(certificate.cert, {
          proxy: { url: String(proxy.url), bypass: ['127.0.0.1'] },
        })
        const exchange = started(
          startExchange(
            resources,
            input(server.url, await held(resources)),
            new AbortController().signal,
          ),
        )
        expect(await readToEnd(claimed(await exchange.result))).toBe('direct')
        await exchange.stopped
        expect(proxy.connects).toEqual([])
        return resources
      })
    } finally {
      await server.close()
    }
  })

  it('the connect timeout ends when the tunnel hands over a connected socket, not at the response', async () => {
    const server = await startHttpsServer(certificate, async res => {
      await sleep(600)
      res.end('late')
    })
    try {
      await withProxy('tunnel', async proxy => {
        const resources = proxied(proxy.url)
        const exchange = started(
          startExchange(
            resources,
            input(server.url, await held(resources), { connectTimeoutMs: 300 }),
            new AbortController().signal,
          ),
        )
        expect(await readToEnd(claimed(await exchange.result))).toBe('late')
        await exchange.stopped
        return resources
      })
    } finally {
      await server.close()
    }
  })
})

describe('a proxy that fails the connection', () => {
  it('a proxy that refuses with 403 and then resets the connection gives connect-failed, and the process survives the reset', async () => {
    await withProxy('refuse-then-reset', async proxy => {
      const resources = proxied(proxy.url)
      const reservation = await held(resources)
      const signal = new AbortController().signal
      const exchange = started(
        startExchange(resources, input(new URL('https://127.0.0.1:1/'), reservation), signal),
      )
      expect(await exchange.result).toEqual({ kind: 'connect-failed', timeout: false })
      await exchange.stopped
      // Without the pool's workaround, Node leaves the proxy socket without an error listener, and
      // the reset below surfaces as an uncaught ECONNRESET that fails this run.
      await expect.poll(() => proxy.resets()).toBe(1)
      await sleep(100)
      expect(reservation.state).toBe('released')
      expectCleanedUp(resources, signal)
      return resources
    })
  })

  it('an unreachable proxy gives connect-failed without a timeout', async () => {
    const resources = proxied(`http://127.0.0.1:${await closedPort()}`)
    try {
      const reservation = await held(resources)
      const exchange = started(
        startExchange(
          resources,
          input(new URL('https://127.0.0.1:1/'), reservation),
          new AbortController().signal,
        ),
      )
      expect(await exchange.result).toEqual({ kind: 'connect-failed', timeout: false })
      await exchange.stopped
      expect(reservation.state).toBe('released')
    } finally {
      await resources.close()
    }
  })

  it('a proxy that never answers CONNECT ends at the connect timeout, not at the pool idle timeout', async () => {
    await withProxy('silent', async proxy => {
      const observed: TransportDiagnostic[] = []
      const resources = proxied(proxy.url, {}, observed)
      const reservation = await held(resources)
      const begun = Date.now()
      const exchange = started(
        startExchange(
          resources,
          input(new URL('https://127.0.0.1:1/'), reservation, { connectTimeoutMs: 300 }),
          new AbortController().signal,
        ),
      )
      expect(await within(exchange.result, PROMPT_MS + 300)).toEqual({
        kind: 'connect-failed',
        timeout: true,
      })
      expect(Date.now() - begun).toBeGreaterThanOrEqual(290)
      await within(exchange.stopped, PROMPT_MS)
      expect(proxy.connects).toEqual(['127.0.0.1:1'])
      expect(reservation.state).toBe('released')
      expect(observed.map(event => event.kind)).toEqual([
        'exchange-started',
        'connect-failed',
        'exchange-stopped',
      ])
      return resources
    })
  })

  it('a tunnel whose target never completes TLS ends at the connect timeout', async () => {
    const hole = await startBlackHole()
    try {
      await withProxy('tunnel', async proxy => {
        const resources = proxied(proxy.url)
        const exchange = started(
          startExchange(
            resources,
            input(hole.url, await held(resources), { connectTimeoutMs: 300 }),
            new AbortController().signal,
          ),
        )
        expect(await within(exchange.result, PROMPT_MS + 300)).toEqual({
          kind: 'connect-failed',
          timeout: true,
        })
        await within(exchange.stopped, PROMPT_MS)
        expect(proxy.tunnels()).toBe(1)
        return resources
      })
    } finally {
      await hole.close()
    }
  })
})

describe('stopping while a connection is built through a proxy', () => {
  it('stop() during CONNECT settles promptly with stopped and returns the slot', async () => {
    await withProxy('silent', async proxy => {
      const resources = proxied(proxy.url)
      const reservation = await held(resources)
      const signal = new AbortController().signal
      const exchange = started(
        startExchange(
          resources,
          input(new URL('https://127.0.0.1:1/'), reservation, { connectTimeoutMs: null }),
          signal,
        ),
      )
      await expect.poll(() => proxy.connects.length).toBe(1)
      exchange.stop()
      expect(await within(exchange.result, PROMPT_MS)).toEqual({
        kind: 'stopped',
        responded: false,
      })
      await within(exchange.stopped, PROMPT_MS)
      expect(reservation.state).toBe('released')
      expectCleanedUp(resources, signal)
      return resources
    })
  })

  it('close() of the resources during the TLS handshake through the tunnel resolves promptly', async () => {
    const hole = await startBlackHole()
    try {
      await withProxy('tunnel', async proxy => {
        const resources = proxied(proxy.url)
        const exchange = started(
          startExchange(
            resources,
            input(hole.url, await held(resources), { connectTimeoutMs: null }),
            new AbortController().signal,
          ),
        )
        await expect.poll(() => proxy.tunnels()).toBe(1)
        await within(resources.close(), PROMPT_MS)
        expect(await exchange.result).toEqual({ kind: 'stopped', responded: false })
        expect(resources.inFlight.size).toBe(0)
        return resources
      })
    } finally {
      await hole.close()
    }
  })
})

describe('the proxy URL as a secret', () => {
  const SECRET = 'proxy-secret-value'

  function leaks(value: ExchangeResult | readonly TransportDiagnostic[], proxy: ConnectProxy) {
    const text = JSON.stringify(value)
    return text.includes(SECRET) || text.includes(proxy.url.port)
  }

  it.each(['refuse-then-reset', 'silent'] as const)(
    'with a %s proxy, neither the result nor the diagnostics carry the proxy URL',
    async mode => {
      await withProxy(mode, async proxy => {
        const url = new URL(proxy.url)
        url.username = 'proxy-user'
        url.password = SECRET
        const observed: TransportDiagnostic[] = []
        const resources = proxied(url, {}, observed)
        const exchange = started(
          startExchange(
            resources,
            input(new URL('https://127.0.0.1:1/'), await held(resources), {
              connectTimeoutMs: 300,
            }),
            new AbortController().signal,
          ),
        )
        const result = await within(exchange.result, PROMPT_MS + 300)
        expect(result.kind).toBe('connect-failed')
        await exchange.stopped
        expect(leaks(result, proxy)).toBe(false)
        expect(leaks(observed, proxy)).toBe(false)
        return resources
      })
    },
  )
})
