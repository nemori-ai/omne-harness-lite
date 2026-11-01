// The stream stall timeout: the longest gap between two response bytes. The configuration checks
// run in the fast layer. Every other case sends over a real local HTTPS server, so it is slow
// (openssl child process, real sockets); the stall timer itself runs on fake timers, and the real
// network is awaited through the facts and results that it produces, never through a real wait of
// the stall length.
import type { ClientRequest, IncomingMessage, ServerResponse } from 'node:http'
import type { RequestOptions } from 'node:https'
import type { TransportFact } from '@omne-harness/model-contract/provider'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TransportDiagnostic } from '../src/diagnostics.ts'
import {
  ResponseBodyStalledError,
  startExchange,
  type ExchangeInput,
  type HttpExchange,
} from '../src/http.ts'
import { openNetwork, type NetworkInternals } from '../src/network.ts'
import { createPiTransport } from '../src/transport.ts'
import {
  claimed,
  held,
  input,
  network,
  readToEnd,
  settle,
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
import { createTestFamily, END_MARKER, LIMITS, SUPPLIER, sseBody } from './support/test-family.ts'
import { slotFree, transportOver } from './support/transport.ts'

/** Every response Node received for this file: a delegate of the real `https.request` records it. */
const built = vi.hoisted((): { readonly responses: IncomingMessage[] } => ({ responses: [] }))
vi.mock('node:https', async importOriginal => {
  const actual = await importOriginal<typeof import('node:https')>()
  const request = (url: URL, options: RequestOptions): ClientRequest => {
    const req = actual.request(url, options)
    req.once('response', response => built.responses.push(response))
    return req
  }
  return { ...actual, request }
})

const STALL = 1_000
const PATH = '/api/v1/chat/completions'
const TEXT = (value: string): string => JSON.stringify({ kind: 'text', value })
const STOP = JSON.stringify({ kind: 'stop' })
const COMMENT = ': keepalive\n\n'

let certificate: Certificate
beforeAll(() => {
  certificate = createCertificate()
})
afterAll(() => certificate.dispose())

beforeEach(() => {
  built.responses.length = 0
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})
afterEach(() => {
  vi.useRealTimers()
})

/** The real timer of the test process, for a wait that no fake clock may advance. */
const realSetTimeout = setTimeout

describe('the configuration of the stall timeout', () => {
  const networks: NetworkInternals[] = []
  afterEach(async () => {
    await Promise.all(networks.splice(0).map(resources => resources.close()))
  })

  function construct(limits: Readonly<Record<string, unknown>>): void {
    const resources = openNetwork({ maxConnections: 1, idleConnectionTimeoutMs: 1_000 })
    networks.push(resources)
    // The cast stands for a caller without the types: the limit object is checked at run time.
    const config = {
      network: resources.handle,
      families: createTestFamily().families,
      routes: { [SUPPLIER.recipient]: { url: 'https://127.0.0.1:9/', endMarker: END_MARKER } },
      credential: { read: () => 'test-secret' },
      limits: { ...LIMITS, ...limits },
    }
    createPiTransport(config)
  }

  it.each([
    ['zero', 0],
    ['negative', -1],
    ['fractional', 1.5],
    ['past the timer limit', 2_147_483_648],
    ['infinite', Number.POSITIVE_INFINITY],
    ['not a number', Number.NaN],
    ['a string', '1000'],
    ['null', null],
  ])('rejects %s and names the field', (_name, value) => {
    expect(() => construct({ streamStallTimeoutMs: value })).toThrow(RangeError)
    expect(() => construct({ streamStallTimeoutMs: value })).toThrow(/limits\.streamStallTimeoutMs/)
  })

  it.each([
    ['absent', {}],
    ['one', { streamStallTimeoutMs: 1 }],
    ['the timer limit', { streamStallTimeoutMs: 2_147_483_647 }],
  ])('accepts %s', (_name, limits) => {
    expect(() => construct(limits)).not.toThrow()
  })
})

describe('an exchange that is given an invalid stall limit', () => {
  it.each([[0], [-1], [1.5], [Number.NaN], [2_147_483_648], [null]])(
    'refuses %j as invalid-limit, returns the slot and sends nothing',
    async value => {
      const resources = openNetwork({ maxConnections: 1, idleConnectionTimeoutMs: 1_000 })
      try {
        const reservation = await held(resources)
        const limits: Partial<ExchangeInput> = {}
        // @ts-expect-error The runtime boundary must hold for a caller without the types.
        limits.streamStallTimeoutMs = value
        const start = startExchange(
          resources,
          input(new URL('https://127.0.0.1:9/'), reservation, limits),
          new AbortController().signal,
        )
        expect(start).toEqual({ kind: 'refused', reason: 'invalid-limit' })
        expect(reservation.state).toBe('released')
        expect(resources.agent.sockets).toEqual({})
      } finally {
        await resources.close()
      }
    },
  )
})

type Scene = Readonly<{ server: HttpsFixture; resources: NetworkInternals }>

/** A server and a network bound to it; both are closed after `run`. */
async function withScene(
  handler: RequestHandler,
  run: (scene: Scene) => Promise<void>,
  observed?: TransportDiagnostic[],
): Promise<void> {
  const server = await startHttpsServer(certificate, handler)
  const resources = network(server.ca, {}, observed)
  try {
    await run({ server, resources })
  } finally {
    await resources.close()
    await server.close()
  }
}

/** A handler that sends nothing at all and never ends the exchange. */
const SILENT: RequestHandler = () => new Promise<void>(() => {})

/** Answers 200 with the given first chunk, keeps the response open, and hands it to the test. */
function opening(first: string): { handler: RequestHandler; response: () => ServerResponse } {
  let current: ServerResponse | undefined
  return {
    handler: res => {
      current = res
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write(first)
      return new Promise<void>(() => {})
    },
    response: () => {
      if (current === undefined) throw new Error('the server has not answered yet')
      return current
    },
  }
}

function start(
  scene: Scene,
  reservation: Awaited<ReturnType<typeof held>>,
  overrides: Partial<ExchangeInput> = {},
  signal: AbortSignal = new AbortController().signal,
): HttpExchange {
  return started(
    startExchange(
      scene.resources,
      input(scene.server.url, reservation, {
        connectTimeoutMs: null,
        streamStallTimeoutMs: STALL,
        ...overrides,
      }),
      signal,
    ),
  )
}

/** Waits, in real time, until Node holds the head of the latest response and the given bytes of its body. */
async function untilResponse(minimumBuffered = 0): Promise<void> {
  for (let turns = 0; turns < 2_000; turns += 1) {
    const response = built.responses.at(-1)
    if (response !== undefined && response.readableLength >= minimumBuffered) return
    await new Promise<void>(resolve => realSetTimeout(resolve, 5))
  }
  throw new Error('the response did not arrive')
}

describe('a stalled exchange', () => {
  it(
    'ends as stalled when no byte comes after the request, and returns the slot only after the physical stop',
    { tags: ['slow'] },
    async () => {
      await withScene(SILENT, async scene => {
        const reservation = await held(scene.resources)
        const exchange = start(scene, reservation)
        expect(vi.getTimerCount()).toBe(1)
        const result = watch(exchange.result)

        vi.advanceTimersByTime(STALL - 1)
        await settle()
        expect(result.done).toBe(false)

        vi.advanceTimersByTime(1)
        expect(await exchange.result).toEqual({ kind: 'stalled' })
        // The result is given after the physical stop: the request is closed and the slot is back.
        expect(reservation.state).toBe('released')
        await exchange.stopped
        expect(vi.getTimerCount()).toBe(0)
      })
    },
  )

  it(
    'fails the body read of a 2xx response that stops sending, after the content before it',
    { tags: ['slow'] },
    async () => {
      const { handler } = opening('data: first\n\n')
      await withScene(handler, async scene => {
        const reservation = await held(scene.resources)
        const exchange = start(scene, reservation)
        const body = claimed(await exchange.result)[Symbol.asyncIterator]()
        expect(Buffer.from((await body.next()).value as Uint8Array).toString()).toBe(
          'data: first\n\n',
        )

        const next = watch(body.next().catch((error: unknown) => error))
        vi.advanceTimersByTime(STALL - 1)
        await settle()
        expect(next.done).toBe(false)

        vi.advanceTimersByTime(1)
        await settle()
        await exchange.stopped
        expect(next.value).toBeInstanceOf(ResponseBodyStalledError)
        expect(reservation.state).toBe('released')
        expect(vi.getTimerCount()).toBe(0)
      })
    },
  )

  it(
    'does not fail a stream whose byte gaps stay below the limit, comment lines included',
    { tags: ['slow'] },
    async () => {
      const { handler, response } = opening(COMMENT)
      await withScene(handler, async scene => {
        const reservation = await held(scene.resources)
        const exchange = start(scene, reservation)
        const body = claimed(await exchange.result)[Symbol.asyncIterator]()
        await body.next()
        for (let gap = 0; gap < 4; gap += 1) {
          vi.advanceTimersByTime(STALL - 100)
          response().write(COMMENT)
          expect((await body.next()).done).toBe(false)
        }
        response().end()
        expect((await body.next()).done).toBe(true)
        await exchange.stopped
        expect(reservation.state).toBe('released')
        expect(vi.getTimerCount()).toBe(0)
      })
    },
  )

  it(
    'does not count the time that the reader leaves bytes unread as a stall',
    { tags: ['slow'] },
    async () => {
      await withScene(
        res => {
          res.writeHead(200)
          res.end(Buffer.alloc(512 * 1024, 0x61))
          return Promise.resolve()
        },
        async scene => {
          const reservation = await held(scene.resources)
          const exchange = start(scene, reservation)
          const result = await exchange.result
          await untilResponse(1)
          vi.advanceTimersByTime(STALL * 5)
          await settle()
          // Only now does the reader take the bytes: nothing was lost to the stall timer.
          expect((await readToEnd(claimed(result))).length).toBe(512 * 1024)
          await exchange.stopped
          expect(vi.getTimerCount()).toBe(0)
        },
      )
    },
  )

  it(
    'ends the error body of a non-2xx response that stops sending, keeping the status',
    { tags: ['slow'] },
    async () => {
      await withScene(
        res => {
          res.writeHead(500)
          res.write('partial')
          return new Promise<void>(() => {})
        },
        async scene => {
          const reservation = await held(scene.resources)
          const exchange = start(scene, reservation)
          await untilResponse()
          vi.advanceTimersByTime(STALL)
          const result = await exchange.result
          expect(result).toMatchObject({
            kind: 'http-error',
            status: 500,
            errorBody: { kind: 'read-failed' },
          })
          await exchange.stopped
          expect(reservation.state).toBe('released')
          expect(vi.getTimerCount()).toBe(0)
        },
      )
    },
  )

  it('arms no timer when the limit is absent', { tags: ['slow'] }, async () => {
    const { handler, response } = opening('data: first\n\n')
    await withScene(handler, async scene => {
      const reservation = await held(scene.resources)
      const exchange = start(scene, reservation, {
        streamStallTimeoutMs: undefined,
      })
      expect(vi.getTimerCount()).toBe(0)
      const body = claimed(await exchange.result)[Symbol.asyncIterator]()
      await body.next()
      vi.advanceTimersByTime(60 * 60 * 1000)
      response().end()
      expect((await body.next()).done).toBe(true)
      await exchange.stopped
    })
  })
})

describe('the timer of a stall limit is cleared when the exchange ends', () => {
  it('after a complete 2xx body', { tags: ['slow'] }, async () => {
    await withScene(
      res => {
        res.writeHead(200)
        res.end('complete')
        return Promise.resolve()
      },
      async scene => {
        const reservation = await held(scene.resources)
        const exchange = start(scene, reservation)
        expect(vi.getTimerCount()).toBe(1)
        expect(await readToEnd(claimed(await exchange.result))).toBe('complete')
        await exchange.stopped
        expect(vi.getTimerCount()).toBe(0)
      },
    )
  })

  it('after a complete non-2xx body', { tags: ['slow'] }, async () => {
    await withScene(
      res => {
        res.writeHead(503)
        res.end('busy')
        return Promise.resolve()
      },
      async scene => {
        const exchange = start(scene, await held(scene.resources))
        expect(await exchange.result).toMatchObject({ kind: 'http-error', status: 503 })
        await exchange.stopped
        expect(vi.getTimerCount()).toBe(0)
      },
    )
  })

  it('after stop() and after a cancel signal', { tags: ['slow'] }, async () => {
    await withScene(SILENT, async scene => {
      const stopped = start(scene, await held(scene.resources))
      stopped.stop()
      expect(vi.getTimerCount()).toBe(0)
      expect(await stopped.result).toEqual({ kind: 'stopped', responded: false })
      await stopped.stopped

      const controller = new AbortController()
      const cancelled = start(scene, await held(scene.resources), {}, controller.signal)
      expect(vi.getTimerCount()).toBe(1)
      controller.abort()
      expect(vi.getTimerCount()).toBe(0)
      expect(await cancelled.result).toEqual({ kind: 'stopped', responded: false })
      await cancelled.stopped
    })
  })

  it('after the connect timeout', { tags: ['slow'] }, async () => {
    const hole = await startBlackHole()
    const resources = network(certificate.cert)
    try {
      const exchange = started(
        startExchange(
          resources,
          input(hole.url, await held(resources), {
            connectTimeoutMs: 300,
            streamStallTimeoutMs: 5_000,
          }),
          new AbortController().signal,
        ),
      )
      expect(vi.getTimerCount()).toBe(2)
      await settle() // The pool hands the socket over on a later tick; the connect timer is armed.
      vi.advanceTimersByTime(300)
      expect(await exchange.result).toEqual({ kind: 'connect-failed', timeout: true })
      await exchange.stopped
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      await resources.close()
      await hole.close()
    }
  })

  it('after the network resources close', { tags: ['slow'] }, async () => {
    const { handler } = opening('data: first\n\n')
    await withScene(handler, async scene => {
      const exchange = start(scene, await held(scene.resources))
      const body = claimed(await exchange.result)[Symbol.asyncIterator]()
      await body.next()
      expect(vi.getTimerCount()).toBe(1)
      const failure = body.next().catch((error: unknown) => error)
      await scene.resources.close()
      expect(vi.getTimerCount()).toBe(0)
      expect(await failure).toBeInstanceOf(Error)
      await exchange.stopped
    })
  })
})

type Stage = 'before the response' | 'after the response began'

/** A transport over a server that answers by `stage`, with the stall limit on. */
async function withStalledTransport(
  stage: Stage,
  run: (scene: {
    stream: AsyncIterable<TransportFact>
    abort: () => void
    resources: NetworkInternals
    observed: TransportDiagnostic[]
  }) => Promise<void>,
): Promise<void> {
  const observed: TransportDiagnostic[] = []
  const opened = opening(`data: ${TEXT('hel')}\n\n`)
  const server = await startHttpsServer(
    certificate,
    stage === 'before the response' ? SILENT : opened.handler,
  )
  const resources = network(server.ca, {}, observed)
  const transport = transportOver(resources, {
    url: new URL(PATH, server.url).href,
    limits: { ...LIMITS, connectTimeoutMs: null, streamStallTimeoutMs: STALL },
  })
  try {
    const controller = new AbortController()
    const materialized = await transport.materialize(controller.signal)
    const stream = materialized.start(controller.signal)
    await run({
      stream,
      abort: () => controller.abort(),
      resources,
      observed,
    })
  } finally {
    await transport.close()
    await resources.close()
    await server.close()
  }
}

function failedWith(
  cause: 'upstream-unavailable' | 'stream-lost',
  diagnostic: string,
): TransportFact {
  return {
    kind: 'ended',
    termination: { kind: 'failed', fault: { cause, diagnostic, upstreamStatus: null } },
  }
}

const HEL: readonly TransportFact[] = [
  { kind: 'block-open', index: '0', mode: 'append', content: 'text' },
  { kind: 'block-delta', index: '0', delta: 'hel' },
]

describe('the termination of a stalled send', () => {
  it(
    'before any response byte: failed as upstream-unavailable, stream-stall, after the physical stop',
    { tags: ['slow'] },
    async () => {
      await withStalledTransport('before the response', async ({ stream, resources, observed }) => {
        let stoppedBeforeEnd = false
        const facts: TransportFact[] = []
        const reading = (async () => {
          for await (const fact of stream) {
            if (fact.kind === 'ended')
              stoppedBeforeEnd = observed.some(event => event.kind === 'exchange-stopped')
            facts.push(fact)
          }
        })()
        vi.advanceTimersByTime(STALL)
        await reading
        expect(facts).toEqual([failedWith('upstream-unavailable', 'stream-stall')])
        expect(stoppedBeforeEnd).toBe(true)
        expect(await slotFree(resources)).toBe(true)
        expect(vi.getTimerCount()).toBe(0)
      })
    },
  )

  it(
    'after the response began: failed as stream-lost, stream-stall, with the content that arrived',
    { tags: ['slow'] },
    async () => {
      await withStalledTransport(
        'after the response began',
        async ({ stream, resources, observed }) => {
          let stoppedBeforeEnd = false
          const facts: TransportFact[] = []
          const iterator = stream[Symbol.asyncIterator]()
          for (let step = await iterator.next(); !step.done; step = await iterator.next()) {
            facts.push(step.value)
            if (facts.length === HEL.length) break
          }
          expect(facts).toEqual(HEL)
          const rest = (async () => {
            for (let step = await iterator.next(); !step.done; step = await iterator.next()) {
              if (step.value.kind === 'ended')
                stoppedBeforeEnd = observed.some(event => event.kind === 'exchange-stopped')
              facts.push(step.value)
            }
          })()
          vi.advanceTimersByTime(STALL)
          await rest
          expect(facts).toEqual([...HEL, failedWith('stream-lost', 'stream-stall')])
          expect(stoppedBeforeEnd).toBe(true)
          expect(await slotFree(resources)).toBe(true)
          expect(vi.getTimerCount()).toBe(0)
        },
      )
    },
  )

  it(
    'a send that keeps receiving bytes completes, whatever its total length',
    { tags: ['slow'] },
    async () => {
      const opened = opening(`data: ${TEXT('a')}\n\n`)
      const server = await startHttpsServer(certificate, opened.handler)
      const resources = network(server.ca)
      const transport = transportOver(resources, {
        url: new URL(PATH, server.url).href,
        limits: { ...LIMITS, connectTimeoutMs: null, streamStallTimeoutMs: STALL },
      })
      try {
        const stream = (await transport.materialize()).start(new AbortController().signal)
        const iterator = stream[Symbol.asyncIterator]()
        const facts: TransportFact[] = []
        const take = async (): Promise<void> => {
          const step = await iterator.next()
          if (step.done) throw new Error('the stream ended early')
          facts.push(step.value)
        }
        await take() // block-open
        await take() // block-delta 'a'
        for (const piece of ['b', 'c', 'd']) {
          vi.advanceTimersByTime(STALL - 100)
          opened.response().write(`data: ${TEXT(piece)}\n\n`)
          await take()
        }
        vi.advanceTimersByTime(STALL - 100)
        opened.response().end(sseBody(STOP))
        for (let step = await iterator.next(); !step.done; step = await iterator.next())
          facts.push(step.value)
        expect(facts.at(-1)).toEqual({
          kind: 'ended',
          termination: { kind: 'completed', reason: 'stop' },
        })
        expect(facts.map(fact => fact.kind)).not.toContain('diagnostic')
      } finally {
        await transport.close()
        await resources.close()
        await server.close()
      }
    },
  )
})

describe('a stall racing a cancel', () => {
  it.each<Stage>(['before the response', 'after the response began'])(
    'a cancel that arrives first wins and clears the timer (%s)',
    { tags: ['slow'] },
    async stage => {
      await withStalledTransport(stage, async ({ stream, abort }) => {
        const iterator = stream[Symbol.asyncIterator]()
        if (stage === 'after the response began') {
          await iterator.next()
          await iterator.next()
        }
        const facts: TransportFact[] = []
        const rest = (async () => {
          for (let step = await iterator.next(); !step.done; step = await iterator.next())
            facts.push(step.value)
        })()
        abort()
        expect(vi.getTimerCount()).toBe(0)
        vi.advanceTimersByTime(STALL * 2)
        await rest
        expect(facts).toEqual([
          { kind: 'ended', termination: { kind: 'interrupted', stop: 'confirmed' } },
        ])
      })
    },
  )

  it.each<readonly [Stage, 'upstream-unavailable' | 'stream-lost', string]>([
    ['before the response', 'upstream-unavailable', 'stream-stall'],
    ['after the response began', 'stream-lost', 'stream-stall'],
  ])(
    'an expiry that arrives first wins over a cancel before the physical stop (%s)',
    { tags: ['slow'] },
    async (stage, cause, diagnostic) => {
      await withStalledTransport(stage, async ({ stream, abort }) => {
        const iterator = stream[Symbol.asyncIterator]()
        if (stage === 'after the response began') {
          await iterator.next()
          await iterator.next()
        }
        const facts: TransportFact[] = []
        const rest = (async () => {
          for (let step = await iterator.next(); !step.done; step = await iterator.next())
            facts.push(step.value)
        })()
        vi.advanceTimersByTime(STALL)
        abort() // The physical stop has not completed: the cancel comes second.
        await rest
        expect(facts).toEqual([failedWith(cause, diagnostic)])
      })
    },
  )
})
