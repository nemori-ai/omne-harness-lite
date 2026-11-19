import { setFlagsFromString } from 'node:v8'
import { runInNewContext } from 'node:vm'
import { MessageChannel } from 'node:worker_threads'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createPortFetch,
  type PortFetchClient,
  type PortFetchOptions,
} from '../../src/port-fetch/client.ts'
import { PortBusyError, RemoteFetchError } from '../../src/port-fetch/errors.ts'
import { fromNodePort, type Port } from '../../src/port-fetch/ports.ts'
import {
  isPortMessage,
  LIMITS,
  PROTOCOL_VERSION,
  type PortMessage,
} from '../../src/port-fetch/protocol.ts'
import { servePort, type ServePortOptions } from '../../src/port-fetch/server.ts'

const channels: MessageChannel[] = []
afterEach(() => {
  for (const channel of channels.splice(0)) {
    channel.port1.close()
    channel.port2.close()
  }
})

const tick = (ms = 20) => new Promise(resolve => setTimeout(resolve, ms))
const noop = () => {}
const encoder = new TextEncoder()

async function until(condition: () => boolean, ms = 1000): Promise<void> {
  const deadline = Date.now() + ms
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('condition not met in time')
    await tick(2)
  }
}

/** A `Port` that records what each side sends, for assertions about the wire. */
function recording(port: Port): Port & { sent: PortMessage[] } {
  const sent: PortMessage[] = []
  return {
    ...port,
    sent,
    postMessage(message) {
      sent.push(message)
      port.postMessage(message)
    },
  }
}

function connect(
  handler: (request: Request) => Response | Promise<Response>,
  {
    server: serverOptions,
    ...clientOptions
  }: PortFetchOptions & { server?: ServePortOptions } = {},
) {
  const channel = new MessageChannel()
  channels.push(channel)
  const clientPort = recording(fromNodePort(channel.port1))
  const serverPort = recording(fromNodePort(channel.port2))
  const server = servePort(serverPort, handler, serverOptions)
  const fetch = createPortFetch(clientPort, clientOptions)
  return { fetch, server, clientPort, serverPort, channel }
}

/** One end driven by hand: frames it receives are collected, frames are sent as given (any shape). */
function rawPeer() {
  const channel = new MessageChannel()
  channels.push(channel)
  const received: PortMessage[] = []
  channel.port2.on('message', (message: unknown) => {
    if (isPortMessage(message)) received.push(message)
  })
  return {
    port: recording(fromNodePort(channel.port1)),
    send: (message: unknown) => channel.port2.postMessage(message),
    received,
    channel,
  }
}

function manualStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const stream = new ReadableStream<Uint8Array>({ start: c => (controller = c) })
  return {
    stream,
    write: (bytes: Uint8Array | string) =>
      controller.enqueue(typeof bytes === 'string' ? encoder.encode(bytes) : bytes),
    close: () => controller.close(),
  }
}

const remoteError = (code: string) => expect.objectContaining({ name: 'RemoteFetchError', code })

describe('client: frame and state validation', () => {
  it('rejects with a protocol error when a body chunk arrives before the head, and cancels it on the server', async () => {
    const peer = rawPeer()
    const fetch = createPortFetch(peer.port)
    const pending = fetch(new Request('http://app.desktop/'))
    await until(() => peer.received.length > 0)

    peer.send({ type: 'response-chunk', id: 1, chunk: new Uint8Array(1) })

    const err = await pending.catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RemoteFetchError)
    expect(err).toEqual(remoteError('protocol'))
    await until(() => peer.received.some(m => m.type === 'cancel'))
    expect(fetch.stats().protocolErrors).toBe(1)
  })

  it('rejects a response head the parser refuses (status out of range)', async () => {
    const peer = rawPeer()
    const fetch = createPortFetch(peer.port)
    const pending = fetch(new Request('http://app.desktop/'))
    await until(() => peer.received.length > 0)

    peer.send({ type: 'response', id: 1, status: 99, statusText: '', headers: [], hasBody: false })

    await expect(pending).rejects.toEqual(remoteError('protocol'))
    expect(fetch.stats()).toMatchObject({ invalidFrames: 1, protocolErrors: 1, activeRequests: 0 })
  })

  it('errors the body when a second head arrives for a request that already has one', async () => {
    const peer = rawPeer()
    const fetch = createPortFetch(peer.port)
    const pending = fetch(new Request('http://app.desktop/'))
    await until(() => peer.received.length > 0)
    const responseHead = {
      type: 'response',
      id: 1,
      status: 200,
      statusText: '',
      headers: [],
      hasBody: true,
    }

    peer.send(responseHead)
    const response = await pending
    peer.send(responseHead)

    await expect(response.text()).rejects.toEqual(remoteError('protocol'))
    await until(() => peer.received.some(m => m.type === 'cancel'))
  })

  it('errors the body when a chunk is not a Uint8Array', async () => {
    const peer = rawPeer()
    const fetch = createPortFetch(peer.port)
    const pending = fetch(new Request('http://app.desktop/'))
    await until(() => peer.received.length > 0)
    peer.send({ type: 'response', id: 1, status: 200, statusText: '', headers: [], hasBody: true })
    const response = await pending

    peer.send({ type: 'response-chunk', id: 1, chunk: [104, 105] })

    await expect(response.text()).rejects.toEqual(remoteError('protocol'))
  })

  it('ignores late and unknown frames silently, nothing thrown', async () => {
    const peer = rawPeer()
    const fetch = createPortFetch(peer.port)
    const pending = fetch(new Request('http://app.desktop/'))
    await until(() => peer.received.length > 0)
    peer.send({ type: 'response', id: 1, status: 204, statusText: '', headers: [], hasBody: false })
    expect((await pending).status).toBe(204)

    // Request 1 is over; request 5 never existed; the rest is not ours.
    peer.send({ type: 'response-chunk', id: 1, chunk: new Uint8Array(1) })
    peer.send({ type: 'response-end', id: 1 })
    peer.send({ type: 'error', id: 1, message: 'late' })
    peer.send({ type: 'response', id: 5, status: 0 })
    peer.send({ type: 'telemetry', id: 1 })
    peer.send('hello')
    await tick()

    expect(fetch.stats()).toMatchObject({
      protocolErrors: 0,
      invalidFrames: 1,
      ignoredFrames: 2,
      activeRequests: 0,
    })
    expect(peer.received.map(m => m.type)).toEqual(['request'])
  })

  it('clamps and counts an ack for more than is outstanding; it adds no credit', async () => {
    const peer = rawPeer()
    const fetch = createPortFetch(peer.port, { windowBytes: 4 })
    const body = new Uint8Array(16)
    void fetch(new Request('http://app.desktop/up', { method: 'POST', body })).catch(noop)
    const sentBytes = () =>
      peer.received.reduce((n, m) => n + (m.type === 'request-chunk' ? m.chunk.byteLength : 0), 0)
    await until(() => sentBytes() === 4)

    // Frees the 4 bytes outstanding, no more: one more window's worth goes out, not the whole body.
    peer.send({ type: 'ack', id: 1, bytes: 1_000_000 })
    await tick(30)

    expect(sentBytes()).toBe(8)
    expect(fetch.stats().acksClamped).toBe(1)
  })

  it("sends the protocol version in every head and surfaces a server's protocol error", async () => {
    const peer = rawPeer()
    const fetch = createPortFetch(peer.port)
    const pending = fetch(new Request('http://app.desktop/'))
    await until(() => peer.received.length > 0)
    expect(peer.received[0]).toMatchObject({ type: 'request', v: PROTOCOL_VERSION })

    peer.send({
      type: 'error',
      id: 1,
      message: 'Unsupported protocol version 1',
      code: 'protocol',
      name: 'ProtocolError',
    })

    await expect(pending).rejects.toEqual(
      expect.objectContaining({
        code: 'protocol',
        remoteName: 'ProtocolError',
        message: 'Unsupported protocol version 1',
      }),
    )
  })

  it('fails one response that queues more than maxQueuedBytes unread (a sender ignoring flow control)', async () => {
    const peer = rawPeer()
    const fetch = createPortFetch(peer.port, { maxQueuedBytes: 2048 })
    const pending = fetch(new Request('http://app.desktop/'))
    await until(() => peer.received.length > 0)
    peer.send({ type: 'response', id: 1, status: 200, statusText: '', headers: [], hasBody: true })
    const response = await pending

    for (let i = 0; i < 3; i++)
      peer.send({ type: 'response-chunk', id: 1, chunk: new Uint8Array(1024) })
    await until(() => peer.received.some(m => m.type === 'cancel'))

    await expect(response.text()).rejects.toEqual(remoteError('protocol'))
    expect(fetch.stats()).toMatchObject({
      protocolErrors: 1,
      queuedBytes: 0,
      peakQueuedBytes: 2048,
    })
  })
})

function head(id: number, extra: Record<string, unknown> = {}) {
  return {
    type: 'request',
    id,
    v: PROTOCOL_VERSION,
    method: 'POST',
    url: 'http://app.desktop/',
    headers: [],
    hasBody: true,
    ...extra,
  }
}

/** A real server on a port whose client side is driven by hand. */
function serve(
  handler: (request: Request) => Response | Promise<Response>,
  options?: ServePortOptions,
) {
  const peer = rawPeer()
  const server = servePort(peer.port, handler, options)
  const errors = () => peer.received.filter(m => m.type === 'error')
  return { ...peer, server, errors }
}

const chunkSizes = (port: { sent: PortMessage[] }, type: string) =>
  port.sent.flatMap(m => (m.type === type && 'chunk' in m ? [m.chunk.byteLength] : []))

describe('server: frame and state validation', () => {
  it('answers a head of another protocol version with a protocol error, without calling fetch', async () => {
    let calls = 0
    const { send, errors, server } = serve(() => {
      calls++
      return new Response('x')
    })

    send(head(1, { v: PROTOCOL_VERSION + 1 }))
    await until(() => errors().length > 0)

    expect(errors()[0]).toMatchObject({
      id: 1,
      code: 'protocol',
      message: expect.stringMatching(/version/),
    })
    expect(calls).toBe(0)
    expect(server.stats()).toMatchObject({ invalidFrames: 1, protocolErrors: 1, activeRequests: 0 })
  })

  it('answers a malformed head (too many headers) with a protocol error', async () => {
    const { send, errors } = serve(() => new Response('x'))
    const headers = Array.from({ length: LIMITS.headerCount + 1 }, (_, i) => [`x-${i}`, 'v'])

    send(head(1, { headers }))
    await until(() => errors().length > 0)

    expect(errors()[0]).toMatchObject({ id: 1, code: 'protocol' })
  })

  it('aborts the request when its id is reused while in flight', async () => {
    const signals: AbortSignal[] = []
    const { send, errors, server } = serve(
      request =>
        new Promise<Response>(() => {
          signals.push(request.signal)
        }),
    )

    send(head(1, { hasBody: false }))
    await until(() => signals.length === 1)
    send(head(1, { hasBody: false }))
    await until(() => errors().length > 0)

    expect(signals).toHaveLength(1)
    expect(signals[0]!.aborted).toBe(true)
    expect(errors()).toEqual([expect.objectContaining({ id: 1, code: 'protocol' })])
    expect(server.stats().activeRequests).toBe(0)
  })

  it.each([
    // What the handler's pending `request.body` read ends with: it fails with the request if still waiting.
    ['a chunk for a request without a body', [{ hasBody: false }, 'chunk'], 'pending'],
    ['a chunk after the body ended', [{}, 'end', 'chunk'], 'read'],
    ['a second body end', [{}, 'end', 'end'], 'read'],
    ['a chunk that is not a Uint8Array', [{}, 'bad-chunk'], 'errored'],
    ['a frame only servers send', [{}, 'response'], 'errored'],
  ] as const)(
    'aborts the request with a protocol error on %s',
    async (_, [extra, ...frames], outcome) => {
      let signal: AbortSignal | undefined
      let bodyOutcome = 'pending'
      const { send, errors } = serve(request => {
        signal = request.signal
        void request.body
          ?.getReader()
          .read()
          .then(
            () => (bodyOutcome = 'read'),
            () => (bodyOutcome = 'errored'),
          )
        return new Promise<Response>(noop)
      })

      send(head(1, extra))
      await until(() => signal !== undefined)
      for (const frame of frames) {
        if (frame === 'chunk') send({ type: 'request-chunk', id: 1, chunk: new Uint8Array(1) })
        if (frame === 'bad-chunk') send({ type: 'request-chunk', id: 1, chunk: 'x' })
        if (frame === 'end') send({ type: 'request-end', id: 1 })
        if (frame === 'response') send({ type: 'response-end', id: 1 })
      }
      await until(() => errors().length > 0)

      expect(errors()).toEqual([expect.objectContaining({ id: 1, code: 'protocol' })])
      expect(signal?.aborted).toBe(true)
      await tick()
      expect(bodyOutcome).toBe(outcome)
    },
  )

  it('ignores late frames for a finished request', async () => {
    const { send, received, server } = serve(() => new Response('done'))

    send(head(1, { hasBody: false }))
    await until(() => received.some(m => m.type === 'response-end'))
    const before = received.length
    send({ type: 'request-chunk', id: 1, chunk: new Uint8Array(1) })
    send({ type: 'request-end', id: 1 })
    send({ type: 'ack', id: 1, bytes: 4 })
    send({ type: 'cancel', id: 1 })
    send({ type: 'error', id: 1, message: 'late' })
    await tick()

    expect(received.length).toBe(before)
    expect(server.stats()).toMatchObject({ protocolErrors: 0, activeRequests: 0 })
  })
})

// `gc()` without `--expose-gc` on the command line: the flag applies to contexts created after it.
setFlagsFromString('--expose_gc')
const exposedGc: unknown = runInNewContext('gc')
if (typeof exposedGc !== 'function') throw new Error('gc() could not be exposed')
const gc = () => void exposedGc()

/** Collects garbage and lets finalizers run until `condition` holds, a bounded number of times. */
async function collectUntil(condition: () => boolean, rounds = 50): Promise<boolean> {
  for (let round = 0; round < rounds && !condition(); round++) {
    gc()
    await tick(5)
  }
  return condition()
}

/** Fetches `path` and waits until the response has ended (left `pending`), leaving its body unread. */
async function finished(fetch: PortFetchClient, path: string): Promise<Response> {
  const response = await fetch(new Request(`http://app.desktop/${path}`))
  await until(() => fetch.stats().activeRequests === 0)
  return response
}

describe('connection budgets', () => {
  it('rejects a fetch beyond maxConcurrentRequests at once with PortBusyError', async () => {
    const releases: (() => void)[] = []
    const { fetch } = connect(
      () => new Promise<Response>(resolve => releases.push(() => resolve(new Response('ok')))),
      { maxConcurrentRequests: 2 },
    )

    const a = fetch(new Request('http://app.desktop/a'))
    const b = fetch(new Request('http://app.desktop/b'))
    await expect(fetch(new Request('http://app.desktop/c'))).rejects.toBeInstanceOf(PortBusyError)
    expect(fetch.stats()).toMatchObject({ busyRejections: 1, activeRequests: 2 })

    await until(() => releases.length === 2)
    releases[0]!()
    expect(await (await a).text()).toBe('ok')
    const d = fetch(new Request('http://app.desktop/d'))
    await until(() => releases.length === 3)
    releases[1]!()
    releases[2]!()
    expect(await (await b).text()).toBe('ok')
    expect(await (await d).text()).toBe('ok')
  })

  it("answers a request beyond the server's maxConcurrentRequests with code busy, without calling fetch", async () => {
    let calls = 0
    const { fetch, server } = connect(
      () => {
        calls++
        return new Promise<Response>(noop)
      },
      { server: { maxConcurrentRequests: 1 } },
    )

    void fetch(new Request('http://app.desktop/a')).catch(noop)
    await until(() => calls === 1)
    const err = await fetch(new Request('http://app.desktop/b')).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(RemoteFetchError)
    expect(err).toMatchObject({ code: 'busy' })
    expect(calls).toBe(1)
    expect(server.stats()).toMatchObject({ busyRejections: 1, activeRequests: 1 })
  })

  it('holds back acks of a backlogged body while the connection is over maxQueuedBytes, then completes', async () => {
    const big = new Uint8Array(4096)
    const { fetch } = connect(() => new Response(big), {
      maxQueuedBytes: 1024,
      server: { windowBytes: 1024, maxChunkBytes: 256 },
    })

    // An unread body keeps 1024 bytes queued: the whole budget.
    const unread = await fetch(new Request('http://app.desktop/unread'))
    await until(() => fetch.stats().queuedBytes === 1024)
    // A second body queues its window too, then is read slowly.
    const slow = await fetch(new Request('http://app.desktop/slow'))
    await until(() => fetch.stats().queuedBytes === 2048)
    const reader = slow.body!.getReader()
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      await tick(1)
    }

    expect(total).toBe(4096)
    const stats = fetch.stats()
    expect(stats.acksWithheld).toBeGreaterThan(0)
    expect(stats.peakQueuedBytes).toBe(2048)
    expect(stats.queuedBytes).toBe(1024)
    await unread.body!.cancel()
    expect(fetch.stats().queuedBytes).toBe(0)
  })

  describe('finished but unread responses', () => {
    // Each response fits the server's window, so it arrives whole with its end and leaves `pending`.
    const options = {
      maxQueuedBytes: 1024,
      maxConcurrentRequests: 1,
      server: { windowBytes: 1024, maxChunkBytes: 256 },
    }

    it('refuse new fetches once they hold more than maxQueuedBytes, keeping the backlog bounded', async () => {
      const { fetch } = connect(() => new Response(new Uint8Array(1024)), options)
      const kept: Response[] = []
      const refused: unknown[] = []
      for (let i = 0; i < 32; i++) {
        try {
          kept.push(await finished(fetch, String(i)))
        } catch (err) {
          refused.push(err)
        }
      }

      // The second one is admitted at exactly the budget; from then on every fetch is refused.
      expect(kept).toHaveLength(2)
      expect(refused).toHaveLength(30)
      expect(refused[0]).toBeInstanceOf(PortBusyError)
      expect(refused[0]).toMatchObject({ budget: 'unread' })
      // At most maxQueuedBytes + maxConcurrentRequests × the server's window.
      expect(fetch.stats()).toMatchObject({
        queuedBytes: 2048,
        peakQueuedBytes: 2048,
        busyRejections: 30,
      })
      await Promise.all(kept.map(response => response.body!.cancel()))
      expect(fetch.stats().queuedBytes).toBe(0)
      expect((await finished(fetch, 'after')).status).toBe(200)
    })

    it('admit again once enough of the backlog was read, not after a partial read', async () => {
      const { fetch } = connect(() => new Response(new Uint8Array(1024)), options)
      const a = await finished(fetch, 'a')
      const b = await finished(fetch, 'b')
      const reader = a.body!.getReader()
      expect((await reader.read()).value).toHaveLength(256)
      // 1792 bytes are still unread: over the budget.
      await expect(fetch(new Request('http://app.desktop/c'))).rejects.toMatchObject({
        budget: 'unread',
      })

      let read = 256
      for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read())
        read += chunk.value.byteLength
      expect(read).toBe(1024)
      expect(fetch.stats().queuedBytes).toBe(1024)
      const c = await finished(fetch, 'c')
      expect((await b.arrayBuffer()).byteLength).toBe(1024)
      expect((await c.arrayBuffer()).byteLength).toBe(1024)
      expect(fetch.stats().queuedBytes).toBe(0)
    })

    it('admit again as they are cancelled one by one', async () => {
      const { fetch } = connect(() => new Response(new Uint8Array(1024)), {
        ...options,
        maxConcurrentRequests: 4,
      })
      const kept = [await finished(fetch, 'a'), await finished(fetch, 'b')]
      await expect(fetch(new Request('http://app.desktop/c'))).rejects.toBeInstanceOf(PortBusyError)

      // Each cancel makes room for exactly one more finished response.
      for (let round = 0; round < 4; round++) {
        await kept.shift()!.body!.cancel()
        kept.push(await finished(fetch, `next-${round}`))
        expect(fetch.stats().queuedBytes).toBe(2048)
        await expect(fetch(new Request('http://app.desktop/refused'))).rejects.toBeInstanceOf(
          PortBusyError,
        )
      }
      await Promise.all(kept.map(response => response.body!.cancel()))
      expect(fetch.stats()).toMatchObject({ queuedBytes: 0, busyRejections: 5 })
    })

    it('give their bytes back once dropped unread and garbage-collected', async () => {
      const { fetch } = connect(() => new Response(new Uint8Array(1024)), options)
      // Neither response, stream nor reader outlives these calls.
      await finished(fetch, 'a').then(noop)
      await finished(fetch, 'b').then(noop)
      expect(fetch.stats().queuedBytes).toBe(2048)
      await expect(fetch(new Request('http://app.desktop/refused'))).rejects.toMatchObject({
        budget: 'unread',
      })

      expect(await collectUntil(() => fetch.stats().queuedBytes === 0)).toBe(true)
      const after = await finished(fetch, 'after')
      expect((await after.arrayBuffer()).byteLength).toBe(1024)
      expect(fetch.stats()).toMatchObject({ queuedBytes: 0, busyRejections: 1 })
    })

    it('keep the bytes of a body whose reader is still held, even once its Response is collected', async () => {
      const { fetch } = connect(() => new Response(new Uint8Array(1024)), options)
      const collected: string[] = []
      const registry = new FinalizationRegistry<string>(label => collected.push(label))
      const keepReader = async (path: string) => {
        const response = await finished(fetch, path)
        registry.register(response, path)
        return response.body!.getReader()
      }
      const reader = await keepReader('kept')
      await finished(fetch, 'dropped').then(noop)
      expect(fetch.stats().queuedBytes).toBe(2048)

      // The dropped body gives its bytes back; the kept Response goes too, but its reader keeps the queue.
      expect(
        await collectUntil(() => fetch.stats().queuedBytes === 1024 && collected.includes('kept')),
      ).toBe(true)
      expect(await collectUntil(() => fetch.stats().queuedBytes < 1024, 10)).toBe(false)
      let read = 0
      for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read())
        read += chunk.value.byteLength
      expect(read).toBe(1024)
      expect(fetch.stats().queuedBytes).toBe(0)
    })

    it('do not include bodies still streaming: a slow reader never blocks new fetches', async () => {
      const { fetch } = connect(() => new Response(new Uint8Array(4096)), {
        ...options,
        maxConcurrentRequests: 4,
      })
      const a = await fetch(new Request('http://app.desktop/a'))
      const b = await fetch(new Request('http://app.desktop/b'))
      await until(() => fetch.stats().queuedBytes === 2048)

      const c = await fetch(new Request('http://app.desktop/c'))
      expect((await c.arrayBuffer()).byteLength).toBe(4096)
      expect(fetch.stats().busyRejections).toBe(0)
      await a.body!.cancel()
      await b.body!.cancel()
    })
  })

  it('server: an upload the handler never read is dropped when its response completes', async () => {
    let handled = 0
    const { fetch, server } = connect(
      () => {
        handled++
        return new Response('ignored')
      },
      { windowBytes: 1024, server: { maxQueuedBytes: 1024 } },
    )
    for (let i = 0; i < 8; i++) {
      const response = await fetch(
        new Request('http://app.desktop/upload', { method: 'POST', body: new Uint8Array(1024) }),
      )
      expect(await response.text()).toBe('ignored')
    }
    await until(() => server.stats().activeRequests === 0)
    expect(handled).toBe(8)
    expect(server.stats()).toMatchObject({ queuedBytes: 0, busyRejections: 0 })
  })

  it('does not stall a body that keeps up because another body is unread', async () => {
    const { fetch } = connect(() => new Response(new Uint8Array(8192)), {
      maxQueuedBytes: 1024,
      server: { windowBytes: 1024, maxChunkBytes: 256 },
    })
    const unread = await fetch(new Request('http://app.desktop/unread'))
    await until(() => fetch.stats().queuedBytes === 1024)

    const response = await fetch(new Request('http://app.desktop/read'))
    expect((await response.arrayBuffer()).byteLength).toBe(8192)
    await unread.body!.cancel()
  })
})

describe('structured errors', () => {
  it('carries code and remote name, and caps the message', async () => {
    const { fetch } = connect(() => {
      throw new TypeError('z'.repeat(10_000))
    })

    const err = await fetch(new Request('http://app.desktop/')).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(RemoteFetchError)
    expect(err).toMatchObject({
      name: 'RemoteFetchError',
      code: 'fetch-failed',
      remoteName: 'TypeError',
    })
    expect(err).toMatchObject({ message: 'z'.repeat(LIMITS.messageLength) })
  })

  it('uses invalid-status, body-failed and closed where they apply', async () => {
    const invalid = connect(() => Response.error())
    await expect(invalid.fetch(new Request('http://app.desktop/'))).rejects.toMatchObject({
      code: 'invalid-status',
    })

    const failing = connect(
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            pull: controller => controller.error(new RangeError('disk gone')),
          }),
        ),
    )
    const failed = await failing.fetch(new Request('http://app.desktop/'))
    await expect(failed.text()).rejects.toMatchObject({
      code: 'body-failed',
      remoteName: 'RangeError',
    })

    const hanging = connect(() => new Promise<Response>(noop))
    const pending = hanging.fetch(new Request('http://app.desktop/'))
    await tick()
    hanging.server.close()
    await expect(pending).rejects.toMatchObject({ code: 'closed' })
  })

  it('tells the server with code body-failed when the upload source fails', async () => {
    let fail!: (err: Error) => void
    const source = new ReadableStream<Uint8Array>({ start: c => (fail = err => c.error(err)) })
    const { fetch, clientPort } = connect(() => new Promise<Response>(noop))

    const pending = fetch(
      new Request('http://app.desktop/up', { method: 'POST', body: source, duplex: 'half' }),
    )
    await tick()
    fail(new Error('upload broke'))

    await expect(pending).rejects.toThrow('upload broke')
    expect(clientPort.sent.find(m => m.type === 'error')).toMatchObject({
      code: 'body-failed',
      name: 'Error',
    })
  })
})

describe('tuning options', () => {
  it('maxChunkBytes splits bodies below the window, both directions', async () => {
    const { fetch, clientPort, serverPort } = connect(
      async request => new Response(new Uint8Array((await request.arrayBuffer()).byteLength)),
      { maxChunkBytes: 300, server: { maxChunkBytes: 256 } },
    )

    const response = await fetch(
      new Request('http://app.desktop/', { method: 'POST', body: new Uint8Array(1000) }),
    )
    expect((await response.arrayBuffer()).byteLength).toBe(1000)

    expect(chunkSizes(clientPort, 'request-chunk')).toEqual([300, 300, 300, 100])
    expect(chunkSizes(serverPort, 'response-chunk')).toEqual([256, 256, 256, 232])
  })

  it('ackCoalesce sends one ack per `bytes` consumed and never acks more than was read', async () => {
    const chunks = Array.from({ length: 16 }, () => new Uint8Array(256))
    const { fetch, clientPort } = connect(
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              for (const chunk of chunks) controller.enqueue(chunk)
            },
          }),
        ),
      { ackCoalesce: { bytes: 1024, delayMs: 1000 } },
    )

    const response = await fetch(new Request('http://app.desktop/'))
    const reader = response.body!.getReader()
    let read = 0
    for (let i = 0; i < 16; i++) {
      read += (await reader.read()).value!.byteLength
      const acked = clientPort.sent.reduce((n, m) => n + (m.type === 'ack' ? m.bytes : 0), 0)
      expect(acked).toBeLessThanOrEqual(read)
    }
    await tick()

    expect(
      clientPort.sent.filter(m => m.type === 'ack').map(m => (m.type === 'ack' ? m.bytes : 0)),
    ).toEqual([1024, 1024, 1024, 1024])
    expect(fetch.stats().acksCoalesced).toBe(12)
    await reader.cancel()
  })

  it('ackCoalesce flushes a small tail after delayMs, and never acks bytes not yet read', async () => {
    const { stream, write } = manualStream()
    const { fetch, clientPort } = connect(() => new Response(stream), {
      ackCoalesce: { bytes: 1024 * 1024, delayMs: 20 },
    })
    const response = await fetch(new Request('http://app.desktop/'))
    const reader = response.body!.getReader()
    const acks = () => clientPort.sent.filter(m => m.type === 'ack')

    write('x'.repeat(100))
    write('y'.repeat(50))
    await tick(50)
    expect(acks()).toEqual([]) // received, not read

    await reader.read()
    expect(acks()).toEqual([])
    await until(() => acks().length === 1)
    expect(acks()[0]).toMatchObject({ bytes: 100 })
    await reader.cancel()
  })

  it('ackCoalesce drops pending acks and their timer when the body is cancelled', async () => {
    const { stream, write } = manualStream()
    const { fetch, clientPort } = connect(() => new Response(stream), {
      ackCoalesce: { bytes: 1024 * 1024, delayMs: 20 },
    })
    const response = await fetch(new Request('http://app.desktop/'))
    const reader = response.body!.getReader()
    write('x'.repeat(100))
    await reader.read()

    await reader.cancel()
    await tick(50)

    expect(clientPort.sent.filter(m => m.type === 'ack')).toEqual([])
    expect(clientPort.sent.map(m => m.type)).toEqual(['request', 'cancel'])
  })

  it("ackCoalesce works on the server's upload receiver too", async () => {
    const { fetch, serverPort, server } = connect(
      async request => new Response(String((await request.arrayBuffer()).byteLength)),
      { maxChunkBytes: 128, server: { ackCoalesce: { bytes: 512, delayMs: 1000 } } },
    )

    const response = await fetch(
      new Request('http://app.desktop/', { method: 'POST', body: new Uint8Array(1024 + 64) }),
    )

    expect(await response.text()).toBe('1088')
    expect(serverPort.sent.flatMap(m => (m.type === 'ack' ? [m.bytes] : []))).toEqual([512, 512])
    expect(server.stats().acksCoalesced).toBe(6)
  })
})

describe('ackCoalesce timers', () => {
  afterEach(() => {
    // Spies first: they wrap the fake timers, which `useRealTimers()` then replaces.
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('small responses share one connection timer: none armed or cleared per request, none left once it ran', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
    const { fetch, clientPort } = connect(() => new Response('x'.repeat(4096)), {
      ackCoalesce: { bytes: 256 * 1024, delayMs: 1 },
    })

    for (let i = 0; i < 20; i++) {
      const response = await fetch(new Request('http://app.desktop/'))
      expect((await response.text()).length).toBe(4096)
    }

    // At most the connection's one timer, armed by the first body that had bytes to acknowledge.
    expect(setTimeoutSpy.mock.calls.length).toBeLessThanOrEqual(1)
    expect(clearTimeoutSpy).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(vi.getTimerCount()).toBe(0)
    // Each body ended before its ack was due: the server needs no credit after its last chunk.
    expect(clientPort.sent.filter(m => m.type === 'ack')).toEqual([])
    expect(fetch.stats().activeRequests).toBe(0)
  })

  it('a request body that ended drops its pending ack at once instead of sending it after delayMs', async () => {
    const { fetch, serverPort } = connect(
      async request => {
        const length = (await request.arrayBuffer()).byteLength
        await tick(60)
        return new Response(String(length))
      },
      { maxChunkBytes: 128, server: { ackCoalesce: { bytes: 1024 * 1024, delayMs: 10 } } },
    )

    const response = await fetch(
      new Request('http://app.desktop/', { method: 'POST', body: new Uint8Array(300) }),
    )

    expect(await response.text()).toBe('300')
    expect(serverPort.sent.filter(m => m.type === 'ack')).toEqual([])
  })

  it('a long body still gets its coalesced acks while it streams', async () => {
    const { stream, write, close } = manualStream()
    const { fetch, clientPort } = connect(() => new Response(stream), {
      ackCoalesce: { bytes: 1024 * 1024, delayMs: 5 },
    })
    const response = await fetch(new Request('http://app.desktop/'))
    const reader = response.body!.getReader()
    const acks = () => clientPort.sent.filter(m => m.type === 'ack')

    write('x'.repeat(100))
    await reader.read()
    await until(() => acks().length === 1)
    write('y'.repeat(50))
    await reader.read()
    await until(() => acks().length === 2)
    expect(acks().map(m => (m.type === 'ack' ? m.bytes : 0))).toEqual([100, 50])
    close()
    expect((await reader.read()).done).toBe(true)
  })
})

describe('stats', () => {
  it('counts frames, bytes and credit waits on both sides', async () => {
    const { fetch, server } = connect(() => new Response(new Uint8Array(4096)), {
      server: { windowBytes: 1024 },
    })
    expect(fetch.stats().framesSent.request).toBe(0)

    const response = await fetch(new Request('http://app.desktop/'))
    const reader = response.body!.getReader()
    for (;;) {
      await tick(5)
      if ((await reader.read()).done) break
    }
    await tick()

    const client = fetch.stats()
    const served = server.stats()
    // The last chunk is read after `response-end`: the server is done, so it gets no ack.
    expect(client.framesSent).toMatchObject({ request: 1, ack: 3, cancel: 0 })
    expect(client.framesReceived).toMatchObject({
      response: 1,
      'response-chunk': 4,
      'response-end': 1,
    })
    expect(client.bodyBytesReceived).toBe(4096)
    expect(served.framesSent).toMatchObject({ response: 1, 'response-chunk': 4, 'response-end': 1 })
    expect(served.framesReceived).toMatchObject({ request: 1, ack: 3 })
    expect(served.bodyBytesSent).toBe(4096)
    expect(served.creditWaitMs).toBeGreaterThan(0)
    expect([client.activeRequests, served.activeRequests, client.queuedBytes]).toEqual([0, 0, 0])
  })
})
