// @module-tag slow — starts an openssl child process and a real local HTTPS server, and waits for
// real connect timeouts and physical socket closure.
import type { ServerResponse } from 'node:http'
import type { TransportFact } from '@omne-harness/model-contract'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { NetworkInternals } from '../src/network.ts'
import { network, settle, watch } from './support/exchange.ts'
import {
  createCertificate,
  startBlackHole,
  startHttpsServer,
  type Certificate,
  type HttpsFixture,
  type RequestHandler,
} from './support/https-server.ts'
import { LIMITS, sseBody } from './support/test-family.ts'
import { collect, slotFree, transportOver, type TransportUnderTest } from './support/transport.ts'

const PATH = '/api/v1/chat/completions'
const TEXT = (value: string): string => JSON.stringify({ kind: 'text', value })
const STOP = JSON.stringify({ kind: 'stop' })
const COMPLETED: TransportFact = {
  kind: 'ended',
  termination: { kind: 'completed', reason: 'stop' },
}
const INTERRUPTED: TransportFact = {
  kind: 'ended',
  termination: { kind: 'interrupted', stop: 'confirmed' },
}

let certificate: Certificate
beforeAll(() => {
  certificate = createCertificate()
})
afterAll(() => certificate.dispose())

type Scene = Readonly<{
  server: HttpsFixture
  resources: NetworkInternals
  transport: TransportUnderTest
}>

async function withTransport(
  handler: RequestHandler,
  body: (scene: Scene) => Promise<void>,
  options: Readonly<{ maxConnections?: number }> = {},
): Promise<void> {
  const server = await startHttpsServer(certificate, handler)
  const resources = network(server.ca, { maxConnections: options.maxConnections ?? 1 })
  const transport = transportOver(resources, { url: new URL(PATH, server.url).href })
  try {
    await body({ server, resources, transport })
  } finally {
    await transport.close()
    await resources.close()
    await server.close()
  }
}

function answerSse(res: ServerResponse, text: string): void {
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  res.end(text)
}

function failedWith(cause: string, diagnostic: string, upstreamStatus: string | null) {
  return {
    kind: 'ended',
    termination: { kind: 'failed', fault: { cause, diagnostic, upstreamStatus } },
  }
}

describe('a start that sends', () => {
  it('sends once inside start, with the bearer credential and the fixed body, and ends with the decoder termination', async () => {
    await withTransport(
      res => answerSse(res, sseBody(TEXT('hel'), TEXT('lo'), STOP)),
      async ({ server, resources, transport }) => {
        const materialized = await transport.materialize()
        const arrival = server.nextRequest()
        const stream = materialized.start(new AbortController().signal)
        expect(transport.sends()).toBe(1)
        const request = await arrival
        expect(request).toMatchObject({ method: 'POST', path: PATH })
        expect(request.headers).toMatchObject({
          authorization: 'Bearer test-secret',
          'content-type': 'application/json',
          accept: 'text/event-stream',
        })
        expect(Buffer.from(request.body).toString()).toBe('{"model":"test-model","messages":0}')
        expect(await collect(stream)).toEqual([
          { kind: 'block-open', index: '0', mode: 'append', content: 'text' },
          { kind: 'block-delta', index: '0', delta: 'hel' },
          { kind: 'block-delta', index: '0', delta: 'lo' },
          COMPLETED,
        ])
        expect(resources.inFlight.size).toBe(0)
        expect(await slotFree(resources)).toBe(true)
        expect(server.requests).toHaveLength(1)
      },
    )
  })

  it('keeps the decoder termination last when the decoder gives facts after it', async () => {
    await withTransport(
      res => answerSse(res, sseBody(STOP, TEXT('tail'))),
      async ({ transport }) => {
        const facts = await collect(
          (await transport.materialize()).start(new AbortController().signal),
        )
        expect(facts.at(-1)).toEqual(COMPLETED)
        expect(facts.filter(fact => fact.kind === 'ended')).toHaveLength(1)
      },
    )
  })

  it('fails as upstream-protocol when the body ends without a termination of the decoder', async () => {
    await withTransport(
      res => answerSse(res, sseBody(TEXT('only'))),
      async ({ transport }) => {
        const facts = await collect(
          (await transport.materialize()).start(new AbortController().signal),
        )
        expect(facts.at(-1)).toEqual(failedWith('upstream-protocol', 'no-termination', null))
      },
    )
  })

  it('fails as upstream-protocol when the decoder gives a second termination', async () => {
    await withTransport(
      res => answerSse(res, sseBody(STOP, STOP)),
      async ({ transport }) => {
        const facts = await collect(
          (await transport.materialize()).start(new AbortController().signal),
        )
        expect(facts).toEqual([failedWith('upstream-protocol', 'decoder-ended-twice', null)])
      },
    )
  })
})

describe('the failures after the send', () => {
  it.each([
    [401, 'credential'],
    [403, 'credential'],
    [429, 'upstream-unavailable'],
    [500, 'upstream-unavailable'],
    [503, 'upstream-unavailable'],
    [400, 'input-rejected'],
    [422, 'input-rejected'],
  ])(
    'HTTP %i ends failed as %s with the status, without the error body or a header',
    async (status, cause) => {
      await withTransport(
        res => {
          res.writeHead(status, { 'x-upstream-secret': 'header-secret' })
          res.end('{"error":"body-secret"}')
        },
        async ({ resources, transport }) => {
          const facts = await collect(
            (await transport.materialize()).start(new AbortController().signal),
          )
          expect(facts).toEqual([failedWith(cause, `http-${status}`, String(status))])
          expect(JSON.stringify(facts)).not.toMatch(/secret/)
          expect(await slotFree(resources)).toBe(true)
        },
      )
    },
  )

  it('a redirect ends failed as upstream-protocol and is not followed', async () => {
    await withTransport(
      res => {
        res.writeHead(302, { location: '/elsewhere' })
        res.end()
      },
      async ({ server, transport }) => {
        const facts = await collect(
          (await transport.materialize()).start(new AbortController().signal),
        )
        expect(facts).toEqual([failedWith('upstream-protocol', 'http-302', '302')])
        expect(server.requests).toHaveLength(1)
      },
    )
  })

  it('a refused connection ends failed as upstream-unavailable without a status', async () => {
    const server = await startHttpsServer(certificate, () => {})
    const url = new URL(PATH, server.url).href
    await server.close()
    const resources = network(certificate.cert)
    const transport = transportOver(resources, { url })
    try {
      const facts = await collect(
        (await transport.materialize()).start(new AbortController().signal),
      )
      expect(facts).toEqual([failedWith('upstream-unavailable', 'connect-failed', null)])
      expect(transport.sends()).toBe(1)
    } finally {
      await transport.close()
      await resources.close()
    }
  })

  it('a connection that does not complete in time ends failed as upstream-unavailable', async () => {
    const hole = await startBlackHole()
    const resources = network(certificate.cert)
    const transport = transportOver(resources, {
      url: new URL(PATH, hole.url).href,
      limits: { ...LIMITS, connectTimeoutMs: 200 },
    })
    try {
      const facts = await collect(
        (await transport.materialize()).start(new AbortController().signal),
      )
      expect(facts).toEqual([failedWith('upstream-unavailable', 'connect-timeout', null)])
    } finally {
      await transport.close()
      await resources.close()
      await hole.close()
    }
  })

  it('a body cut by the other side ends failed as stream-lost after the facts already read', async () => {
    await withTransport(
      res => {
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        res.write(`data: ${TEXT('part')}\n\n`, () => res.socket?.destroy())
      },
      async ({ resources, transport }) => {
        const facts = await collect(
          (await transport.materialize()).start(new AbortController().signal),
        )
        expect(facts).toEqual([
          { kind: 'block-open', index: '0', mode: 'append', content: 'text' },
          { kind: 'block-delta', index: '0', delta: 'part' },
          failedWith('stream-lost', 'response-body-lost', null),
        ])
        expect(resources.inFlight.size).toBe(0)
      },
    )
  })

  it('an SSE event beyond the limit ends failed as upstream-protocol', async () => {
    await withTransport(
      res => answerSse(res, sseBody(TEXT('x'.repeat(LIMITS.maxEventBytes)))),
      async ({ resources, transport }) => {
        const facts = await collect(
          (await transport.materialize()).start(new AbortController().signal),
        )
        expect(facts).toEqual([failedWith('upstream-protocol', 'sse-event-too-large', null)])
        expect(resources.inFlight.size).toBe(0)
      },
    )
  })

  it('event data that is not JSON ends failed as upstream-protocol', async () => {
    await withTransport(
      res => answerSse(res, sseBody('not json')),
      async ({ transport }) => {
        const facts = await collect(
          (await transport.materialize()).start(new AbortController().signal),
        )
        expect(facts).toEqual([failedWith('upstream-protocol', 'frame-invalid-json', null)])
      },
    )
  })

  it('a fault of the decoder ends the stream with that fault', async () => {
    await withTransport(
      res => answerSse(res, sseBody(JSON.stringify({ kind: 'fault' }))),
      async ({ transport }) => {
        const facts = await collect(
          (await transport.materialize()).start(new AbortController().signal),
        )
        expect(facts).toEqual([failedWith('input-rejected', 'test-fault', null)])
      },
    )
  })
})

describe('stopping a started send', () => {
  /** Writes one text frame and keeps the response open. */
  const streamForever: RequestHandler = res => {
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write(`data: ${TEXT('first')}\n\n`)
  }

  async function readTwo(iterator: AsyncIterator<TransportFact>): Promise<void> {
    expect((await iterator.next()).value).toMatchObject({ kind: 'block-open' })
    expect((await iterator.next()).value).toMatchObject({ kind: 'block-delta' })
  }

  it('a cancel ends the stream interrupted and confirmed, after the physical stop', async () => {
    await withTransport(streamForever, async ({ resources, transport }) => {
      const controller = new AbortController()
      const iterator = (await transport.materialize())
        .start(controller.signal)
        [Symbol.asyncIterator]()
      await readTwo(iterator)
      controller.abort()
      const step = await iterator.next()
      expect(step.value).toEqual(INTERRUPTED)
      expect(resources.inFlight.size).toBe(0)
      expect(await slotFree(resources)).toBe(true)
      expect((await iterator.next()).done).toBe(true)
    })
  })

  it('a cancel before the response ends the stream interrupted and confirmed', async () => {
    await withTransport(
      () => {}, // Never answers.
      async ({ server, resources, transport }) => {
        const controller = new AbortController()
        const arrival = server.nextRequest()
        const stream = (await transport.materialize()).start(controller.signal)
        await arrival
        controller.abort()
        expect(await collect(stream)).toEqual([INTERRUPTED])
        expect(resources.inFlight.size).toBe(0)
      },
    )
  })

  it('the close of the materialization stops the exchange and resolves after the physical stop', async () => {
    await withTransport(streamForever, async ({ resources, transport }) => {
      const materialized = await transport.materialize()
      const iterator = materialized.start(new AbortController().signal)[Symbol.asyncIterator]()
      await readTwo(iterator)
      await materialized.close()
      expect(resources.inFlight.size).toBe(0)
      expect(await slotFree(resources)).toBe(true)
      expect((await iterator.next()).value).toEqual(INTERRUPTED)
      await materialized.close()
    })
  })

  it('a reader that ends the stream early stops the exchange', async () => {
    await withTransport(streamForever, async ({ resources, transport }) => {
      const iterator = (await transport.materialize())
        .start(new AbortController().signal)
        [Symbol.asyncIterator]()
      await readTwo(iterator)
      await iterator.return?.()
      expect(resources.inFlight.size).toBe(0)
      expect(await slotFree(resources)).toBe(true)
    })
  })

  it('a reader that ends the stream before its first read stops the exchange', async () => {
    await withTransport(streamForever, async ({ server, resources, transport }) => {
      const arrival = server.nextRequest()
      const iterator = (await transport.materialize())
        .start(new AbortController().signal)
        [Symbol.asyncIterator]()
      await arrival
      await iterator.return?.()
      expect(resources.inFlight.size).toBe(0)
      expect(await slotFree(resources)).toBe(true)
    })
  })

  it('the close of the transport stops the exchange, releases the binding and leaves the network open', async () => {
    await withTransport(streamForever, async ({ resources, transport }) => {
      const iterator = (await transport.materialize())
        .start(new AbortController().signal)
        [Symbol.asyncIterator]()
      await readTwo(iterator)
      await transport.close()
      expect(resources.inFlight.size).toBe(0)
      expect(transport.probe.released).toBe(1)
      expect(resources.closed).toBe(false)
      expect((await iterator.next()).value).toEqual(INTERRUPTED)
    })
  })
})

describe('capacity across real sends', () => {
  /** Answers the first request only when `release` is called; every later one at once. */
  function heldFirstAnswer(): { handler: RequestHandler; release: () => void } {
    const first = Promise.withResolvers<void>()
    let seen = 0
    return {
      handler: async res => {
        seen += 1
        if (seen === 1) await first.promise
        answerSse(res, sseBody(STOP))
      },
      release: () => first.resolve(),
    }
  }

  it('a materialize waits while a send holds the only slot, and its start sends at once when it gets the slot', async () => {
    const answer = heldFirstAnswer()
    await withTransport(answer.handler, async ({ server, transport }) => {
      const first = (await transport.materialize()).start(new AbortController().signal)
      expect(transport.sends()).toBe(1)
      const waiting = watch((await transport.prepare()).materialize(new AbortController().signal))
      await settle()
      expect(waiting.done).toBe(false)
      answer.release()
      expect(await collect(first)).toEqual([COMPLETED])
      await expect.poll(() => waiting.done).toBe(true)
      const second = waiting.value
      if (second === undefined || !('ok' in second)) throw new Error('expected a materialization')
      const stream = second.ok.start(new AbortController().signal)
      expect(transport.sends()).toBe(2)
      expect(await collect(stream)).toEqual([COMPLETED])
      expect(server.requests).toHaveLength(transport.sends())
    })
  })

  it('a cancel ends a materialize that waits behind a send, and leaves no reservation behind', async () => {
    const answer = heldFirstAnswer()
    await withTransport(answer.handler, async ({ resources, transport }) => {
      const first = (await transport.materialize()).start(new AbortController().signal)
      const controller = new AbortController()
      const waiting = (await transport.prepare()).materialize(controller.signal)
      controller.abort()
      expect(await waiting).toEqual({
        failure: {
          kind: 'unavailable',
          dependency: 'connection-capacity',
          diagnostic: 'cancelled',
        },
      })
      answer.release()
      await collect(first)
      expect(await slotFree(resources)).toBe(true)
      expect(transport.sends()).toBe(1)
    })
  })

  it('the close of a materialization before start returns its slot and sends nothing', async () => {
    await withTransport(
      res => answerSse(res, sseBody(STOP)),
      async ({ server, transport }) => {
        const held = await transport.materialize()
        const waiting = (await transport.prepare()).materialize(new AbortController().signal)
        await held.close()
        const next = await waiting
        if (!('ok' in next)) throw new Error('expected a materialization')
        expect(await collect(next.ok.start(new AbortController().signal))).toEqual([COMPLETED])
        expect(transport.sends()).toBe(1)
        expect(server.requests).toHaveLength(1)
      },
    )
  })
})
