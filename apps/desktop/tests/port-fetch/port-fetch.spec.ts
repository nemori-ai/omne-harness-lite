import { MessageChannel } from 'node:worker_threads'

import { afterEach, describe, expect, it } from 'vitest'

import { createPortFetch, type PortFetchOptions } from '../../src/port-fetch/client.ts'
import {
  PortClosedError,
  PortFetchTimeoutError,
  RemoteFetchError,
} from '../../src/port-fetch/errors.ts'
import { fromNodePort, type Port } from '../../src/port-fetch/ports.ts'
import { isPortMessage, type PortMessage } from '../../src/port-fetch/protocol.ts'
import { servePort } from '../../src/port-fetch/server.ts'

type Handler = (request: Request) => Response | Promise<Response>

/** A `Port` that records what each side sends, for assertions about the wire. */
function recording(port: Port): Port & { sent: PortMessage[]; received: PortMessage[] } {
  const sent: PortMessage[] = []
  const received: PortMessage[] = []
  return {
    ...port,
    sent,
    received,
    postMessage(message) {
      sent.push(message)
      port.postMessage(message)
    },
    onMessage(handler) {
      return port.onMessage(message => {
        if (isPortMessage(message)) received.push(message)
        handler(message)
      })
    },
  }
}

const channels: MessageChannel[] = []
afterEach(() => {
  for (const channel of channels.splice(0)) {
    channel.port1.close()
    channel.port2.close()
  }
})

function connect(
  handler: Handler,
  options: PortFetchOptions & { serverWindowBytes?: number } = {},
) {
  const channel = new MessageChannel()
  channels.push(channel)
  const clientPort = recording(fromNodePort(channel.port1))
  const serverPort = recording(fromNodePort(channel.port2))
  const server = servePort(serverPort, handler, { windowBytes: options.serverWindowBytes })
  const fetch = createPortFetch(clientPort, options)
  return { fetch, server, clientPort, serverPort, channel }
}

const tick = (ms = 20) => new Promise(resolve => setTimeout(resolve, ms))
const noop = () => {}
const encoder = new TextEncoder()

/** A stream the test writes to by hand. */
function manualStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const stream = new ReadableStream<Uint8Array>({
    start: c => {
      controller = c
    },
  })
  return {
    stream,
    write: (text: string) => controller.enqueue(encoder.encode(text)),
    close: () => controller.close(),
    fail: (err: Error) => controller.error(err),
  }
}

describe('round trips', () => {
  it('GET: status, status text and headers, repeated set-cookie included', async () => {
    const { fetch } = connect(request => {
      expect(request.method).toBe('GET')
      expect(request.body).toBeNull()
      const headers = new Headers({ 'x-echo': request.headers.get('x-test') ?? '' })
      headers.append('set-cookie', 'a=1; Path=/')
      headers.append('set-cookie', 'b=2; Path=/')
      return new Response('hello', { status: 201, statusText: 'Created', headers })
    })

    const response = await fetch(
      new Request('http://app.desktop/things', { headers: { 'x-test': 'yes' } }),
    )

    expect([response.status, response.statusText]).toEqual([201, 'Created'])
    expect(response.headers.get('x-echo')).toBe('yes')
    expect(response.headers.getSetCookie()).toEqual(['a=1; Path=/', 'b=2; Path=/'])
    expect(await response.text()).toBe('hello')
  })

  it('POST with a JSON body', async () => {
    const { fetch } = connect(async request => {
      const body: unknown = await request.json()
      return Response.json({ got: body, type: request.headers.get('content-type') })
    })

    const response = await fetch(
      new Request('http://app.desktop/api/items', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'x' }),
      }),
    )

    expect(await response.json()).toEqual({ got: { name: 'x' }, type: 'application/json' })
  })

  it('POST with a FormData body', async () => {
    const { fetch } = connect(async request => {
      const title = (await request.formData()).get('title')
      return new Response(typeof title === 'string' ? title : '')
    })
    const form = new FormData()
    form.set('title', 'Hello form')

    const response = await fetch(
      new Request('http://app.desktop/action', { method: 'POST', body: form }),
    )

    expect(await response.text()).toBe('Hello form')
  })

  it('responses without a body (204) and HEAD requests', async () => {
    const { fetch } = connect(request =>
      request.method === 'HEAD'
        ? new Response(null, { headers: { 'x-len': '5' } })
        : new Response(null, { status: 204 }),
    )

    const noContent = await fetch(new Request('http://app.desktop/x', { method: 'DELETE' }))
    expect([noContent.status, noContent.body]).toEqual([204, null])
    const head = await fetch(new Request('http://app.desktop/x', { method: 'HEAD' }))
    expect([head.status, head.headers.get('x-len'), head.body]).toEqual([200, '5', null])
  })

  it('drops a body a client attaches to a GET-like request', async () => {
    const { fetch, clientPort } = connect(
      request => new Response(request.body === null ? 'no body' : 'body'),
    )
    // Pretend a client sent a body with a GET: send the raw messages.
    const sendRaw = clientPort.postMessage.bind(clientPort)
    sendRaw({
      type: 'request',
      id: 99,
      method: 'GET',
      url: 'http://app.desktop/',
      headers: [],
      hasBody: true,
    })
    sendRaw({ type: 'request-chunk', id: 99, chunk: encoder.encode('x') })
    sendRaw({ type: 'request-end', id: 99 })
    await tick()

    const response = await fetch(new Request('http://app.desktop/'))

    expect(await response.text()).toBe('no body')
    expect(clientPort.received.find(m => m.type === 'response' && m.id === 99)).toBeTruthy()
  })
})

describe('streaming', () => {
  it('delivers response chunks as they are written, before the body ends', async () => {
    const { stream, write, close } = manualStream()
    const { fetch } = connect(() => new Response(stream))

    const response = await fetch(new Request('http://app.desktop/stream'))
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()

    write('one')
    expect(decoder.decode((await reader.read()).value)).toBe('one')
    write('two')
    expect(decoder.decode((await reader.read()).value)).toBe('two')
    write('three')
    expect(decoder.decode((await reader.read()).value)).toBe('three')
    close()
    expect((await reader.read()).done).toBe(true)
  })

  it('keeps a long-lived SSE-style stream open', async () => {
    let n = 0
    const { fetch } = connect(
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            pull: async controller => {
              await tick(5)
              controller.enqueue(encoder.encode(`data: ${++n}\n\n`))
            },
          }),
          { headers: { 'content-type': 'text/event-stream' } },
        ),
    )

    const response = await fetch(new Request('http://app.desktop/events'))
    const reader = response.body!.getReader()
    const events: string[] = []
    for (let i = 0; i < 5; i++) events.push(new TextDecoder().decode((await reader.read()).value))
    await reader.cancel()

    expect(events).toEqual([
      'data: 1\n\n',
      'data: 2\n\n',
      'data: 3\n\n',
      'data: 4\n\n',
      'data: 5\n\n',
    ])
  })

  it('streams the request body to the server', async () => {
    const { stream, write, close } = manualStream()
    let seen = ''
    const { fetch } = connect(async request => {
      const reader = request.body!.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        seen += new TextDecoder().decode(value)
      }
      return new Response(seen)
    })

    const pending = fetch(
      new Request('http://app.desktop/upload', { method: 'POST', body: stream, duplex: 'half' }),
    )
    write('part 1,')
    await tick()
    write('part 2')
    close()

    expect(await (await pending).text()).toBe('part 1,part 2')
  })
})

describe('cancellation', () => {
  it('cancelling the response body aborts the server request and stops the messages', async () => {
    let signal: AbortSignal | undefined
    const { fetch, serverPort } = connect(request => {
      signal = request.signal
      return new Response(
        new ReadableStream<Uint8Array>({
          pull: async controller => {
            await tick(2)
            controller.enqueue(encoder.encode('tick'))
          },
        }),
      )
    })

    const response = await fetch(new Request('http://app.desktop/forever'))
    const reader = response.body!.getReader()
    await reader.read()
    await reader.cancel('done reading')
    await tick(30)

    expect(signal?.aborted).toBe(true)
    const sentAfterCancel = serverPort.sent.length
    await tick(30)
    expect(serverPort.sent.length).toBe(sentAfterCancel)
  })

  it("aborting the request's signal before the response rejects and aborts the server", async () => {
    let signal: AbortSignal | undefined
    const { fetch } = connect(
      request =>
        new Promise<Response>(resolve => {
          signal = request.signal
          request.signal.addEventListener('abort', () => resolve(new Response('late')))
        }),
    )
    const controller = new AbortController()

    const pending = fetch(new Request('http://app.desktop/slow', { signal: controller.signal }))
    await tick()
    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await tick()
    expect(signal?.aborted).toBe(true)
  })

  it('times out both sides with timeoutMs (total)', async () => {
    let signal: AbortSignal | undefined
    const { fetch, serverPort } = connect(
      request =>
        new Promise<Response>(() => {
          signal = request.signal
        }),
      { timeoutMs: 40 },
    )

    await expect(fetch(new Request('http://app.desktop/hang'))).rejects.toBeInstanceOf(
      PortFetchTimeoutError,
    )
    await tick()
    expect(signal?.aborted).toBe(true)
    expect(serverPort.received.some(m => m.type === 'cancel')).toBe(true)
  })
})

describe('flow control', () => {
  it('never has more than the window unacknowledged when the client reads slowly', async () => {
    const windowBytes = 1024
    const chunk = new Uint8Array(256)
    const { fetch, clientPort } = connect(
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              for (let i = 0; i < 64; i++) controller.enqueue(chunk)
              controller.close()
            },
          }),
        ),
      { serverWindowBytes: windowBytes },
    )

    const response = await fetch(new Request('http://app.desktop/big'))
    const reader = response.body!.getReader()
    let total = 0
    let maxOutstanding = 0
    for (;;) {
      await tick(2)
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      const received = clientPort.received
        .filter(m => m.type === 'response-chunk')
        .reduce((sum, m) => sum + (m.type === 'response-chunk' ? m.chunk.byteLength : 0), 0)
      const acked = clientPort.sent
        .filter(m => m.type === 'ack')
        .reduce((sum, m) => sum + (m.type === 'ack' ? m.bytes : 0), 0)
      maxOutstanding = Math.max(maxOutstanding, received - acked)
    }

    expect(total).toBe(64 * 256)
    expect(maxOutstanding).toBeLessThanOrEqual(windowBytes)
  })

  it('splits a chunk larger than the window', async () => {
    const { fetch, clientPort } = connect(() => new Response(new Uint8Array(3000)), {
      serverWindowBytes: 1024,
    })

    const response = await fetch(new Request('http://app.desktop/one-chunk'))
    expect((await response.arrayBuffer()).byteLength).toBe(3000)
    const sizes = clientPort.received.flatMap(m =>
      m.type === 'response-chunk' ? [m.chunk.byteLength] : [],
    )
    expect(Math.max(...sizes)).toBeLessThanOrEqual(1024)
  })
})

describe('concurrency and failures', () => {
  it('keeps interleaved requests on one port apart', async () => {
    let releaseFirst = noop
    const { fetch } = connect(async request => {
      const url = new URL(request.url)
      if (url.pathname === '/first') await new Promise<void>(resolve => (releaseFirst = resolve))
      return new Response(`answer for ${url.pathname}`)
    })

    const first = fetch(new Request('http://app.desktop/first'))
    const second = await fetch(new Request('http://app.desktop/second'))
    expect(await second.text()).toBe('answer for /second')
    releaseFirst()
    expect(await (await first).text()).toBe('answer for /first')
  })

  it("rejects when the server's fetch throws, instead of hanging", async () => {
    const { fetch } = connect(() => {
      throw new Error('handler exploded')
    })

    await expect(fetch(new Request('http://app.desktop/boom'))).rejects.toThrow(RemoteFetchError)
    await expect(fetch(new Request('http://app.desktop/boom'))).rejects.toThrow('handler exploded')
  })

  it('errors the response body when it fails mid-stream', async () => {
    const { stream, write, fail } = manualStream()
    const { fetch } = connect(() => new Response(stream))

    const response = await fetch(new Request('http://app.desktop/broken'))
    const reader = response.body!.getReader()
    write('ok')
    await reader.read()
    fail(new Error('source broke'))

    await expect(reader.read()).rejects.toThrow('source broke')
  })

  it('fails every pending request and aborts every in-flight one when the port closes', async () => {
    const signals: AbortSignal[] = []
    const { fetch, channel } = connect(
      request =>
        new Promise<Response>(() => {
          signals.push(request.signal)
        }),
    )

    const a = fetch(new Request('http://app.desktop/a'))
    const b = fetch(new Request('http://app.desktop/b'))
    await tick()
    channel.port1.close()

    await expect(a).rejects.toBeInstanceOf(PortClosedError)
    await expect(b).rejects.toBeInstanceOf(PortClosedError)
    await tick()
    expect(signals.map(s => s.aborted)).toEqual([true, true])
  })

  it('server.close() aborts in-flight requests', async () => {
    let signal: AbortSignal | undefined
    const { fetch, server } = connect(
      request =>
        new Promise<Response>(() => {
          signal = request.signal
        }),
    )

    void fetch(new Request('http://app.desktop/a')).catch(() => {})
    await tick()
    server.close()

    expect(signal?.aborted).toBe(true)
  })
})

describe('review regressions', () => {
  it('sends chunks that own their bytes, not views of the whole body (finding 3)', async () => {
    const { fetch, clientPort } = connect(() => new Response(new Uint8Array(3 * 1024 * 1024)), {
      serverWindowBytes: 1024 * 1024,
    })

    const body = await (await fetch(new Request('http://app.desktop/big'))).arrayBuffer()

    expect(body.byteLength).toBe(3 * 1024 * 1024)
    const chunks = clientPort.received.filter(m => m.type === 'response-chunk')
    expect(chunks).toHaveLength(3)
    for (const message of chunks) {
      if (message.type !== 'response-chunk') continue
      expect(message.chunk.byteLength).toBe(1024 * 1024)
      expect(message.chunk.buffer.byteLength).toBe(message.chunk.byteLength)
    }
  })

  it('cancels a response source stuck in read() and releases its lock on client cancel (finding 6)', async () => {
    let cancelled = false
    let signal: AbortSignal | undefined
    const source = new ReadableStream<Uint8Array>({
      pull: () => new Promise<void>(() => {}),
      cancel: () => {
        cancelled = true
      },
    })
    const { fetch } = connect(request => {
      signal = request.signal
      return new Response(source)
    })

    const response = await fetch(new Request('http://app.desktop/stuck'))
    await response.body!.cancel()
    await tick(30)

    expect(signal?.aborted).toBe(true)
    expect(cancelled).toBe(true)
    expect(source.locked).toBe(false)
  })

  it('stops the upload and releases the window when the server answers before reading it (finding 6)', async () => {
    let cancelled = false
    const source = new ReadableStream<Uint8Array>({
      start: controller => controller.enqueue(new Uint8Array(8)),
      cancel: () => {
        cancelled = true
      },
    })
    const { fetch } = connect(() => new Response(null, { status: 413 }), { windowBytes: 4 })

    const response = await fetch(
      new Request('http://app.desktop/upload', { method: 'POST', body: source, duplex: 'half' }),
    )
    await tick(30)

    expect(response.status).toBe(413)
    expect(cancelled).toBe(true)
    expect(source.locked).toBe(false)
  })

  it('aborts the server request when the upload source fails (finding 6)', async () => {
    let signal: AbortSignal | undefined
    let controller!: ReadableStreamDefaultController<Uint8Array>
    const source = new ReadableStream<Uint8Array>({
      start: c => {
        controller = c
      },
    })
    const { fetch } = connect(request => {
      signal = request.signal
      return new Promise<Response>(() => {})
    })

    const pending = fetch(
      new Request('http://app.desktop/upload', { method: 'POST', body: source, duplex: 'half' }),
    )
    await tick()
    controller.error(new Error('upload failed'))

    await expect(pending).rejects.toThrow('upload failed')
    await tick()
    expect(signal?.aborted).toBe(true)
  })

  it('headersTimeoutMs bounds the wait for the head only; a streaming body outlives it (finding 7)', async () => {
    let signal: AbortSignal | undefined
    const slowHead = connect(
      request =>
        new Promise<Response>(() => {
          signal = request.signal
        }),
      { headersTimeoutMs: 30 },
    )
    const err = await slowHead
      .fetch(new Request('http://app.desktop/slow-head'))
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(PortFetchTimeoutError)
    expect(err).toMatchObject({ phase: 'headers' })
    await tick()
    expect(signal?.aborted).toBe(true)

    const { stream, write } = manualStream()
    const sse = connect(() => new Response(stream), { headersTimeoutMs: 250 })
    const response = await sse.fetch(new Request('http://app.desktop/sse'))
    const reader = response.body!.getReader()
    await tick(300)
    write('data: late\n\n')
    expect(await reader.read()).toEqual({ done: false, value: encoder.encode('data: late\n\n') })
    await reader.cancel()
  })

  it('idleTimeoutMs ends a body that stalls, with the server aborted (finding 7)', async () => {
    let signal: AbortSignal | undefined
    const { write, stream } = manualStream()
    const { fetch } = connect(
      request => {
        signal = request.signal
        return new Response(stream)
      },
      { idleTimeoutMs: 30 },
    )

    const response = await fetch(new Request('http://app.desktop/stall'))
    write('first')
    const reader = response.body!.getReader()
    expect(new TextDecoder().decode((await reader.read()).value)).toBe('first')

    await expect(reader.read()).rejects.toMatchObject({ name: 'TimeoutError', phase: 'idle' })
    await tick()
    expect(signal?.aborted).toBe(true)
  })

  it('reports Response.error() (status 0) as a failure instead of hanging (finding 8)', async () => {
    const { fetch } = connect(() => Response.error())

    await expect(fetch(new Request('http://app.desktop/network-error'))).rejects.toBeInstanceOf(
      RemoteFetchError,
    )
  })

  it('rejects a fetch started after the port closed (finding 9)', async () => {
    const { fetch, channel } = connect(() => new Response('never'))
    channel.port2.close()
    await tick(10)

    await expect(fetch(new Request('http://app.desktop/late'))).rejects.toBeInstanceOf(
      PortClosedError,
    )
  })

  it('reports a response whose body is already locked, with nothing escaping the server (re-review 1)', async () => {
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)
    let serverRequest: Request | undefined
    let taken: ReadableStreamDefaultReader<Uint8Array> | undefined
    const { fetch, serverPort } = connect(request => {
      serverRequest = request
      const response = new Response('hello')
      taken = response.body?.getReader()
      return response
    })
    try {
      // Rejected before the head: the server notices the locked body and reports an error.
      await expect(fetch(new Request('http://app.desktop/locked'))).rejects.toBeInstanceOf(
        RemoteFetchError,
      )
      await tick()

      expect(serverRequest?.signal.aborted).toBe(true)
      expect(serverPort.sent.map(m => m.type)).toEqual(['error'])
      expect(unhandled).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandled)
      await taken?.cancel()
    }
  })

  it('reports a failure after the head by erroring the body, not by throwing (re-review 1)', async () => {
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)
    // The body's own failure is the only thing that can go wrong once the head went out.
    const { fetch, serverPort } = connect(() => {
      const { stream, write, fail: failSource } = manualStream()
      setTimeout(() => {
        write('partial')
        failSource(new Error('disk gone'))
      }, 5)
      return new Response(stream)
    })
    try {
      const response = await fetch(new Request('http://app.desktop/breaks'))
      await expect(response.text()).rejects.toBeInstanceOf(RemoteFetchError)
      await tick()

      expect(serverPort.sent.map(m => m.type)).toEqual(['response', 'response-chunk', 'error'])
      expect(unhandled).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })

  it('cancels on the server when the request body cannot be read on the client (re-review 1)', async () => {
    let serverRequest: Request | undefined
    const { fetch, clientPort } = connect(request => {
      serverRequest = request
      return new Promise<Response>(noop)
    })
    const request = new Request('http://app.desktop/upload', {
      method: 'POST',
      body: new ReadableStream<Uint8Array>({ pull: () => new Promise(noop) }),
      duplex: 'half',
    })
    const reader = request.body?.getReader()

    await expect(fetch(request)).rejects.toThrow(/locked/i)
    await tick()

    expect(clientPort.sent.map(m => m.type)).toEqual(['request', 'cancel'])
    expect(serverRequest?.signal.aborted).toBe(true)
    await reader?.cancel()
  })

  it('ends an upload the handler is still reading once a body-less early response is sent (re-review 2)', async () => {
    let readOutcome = 'pending'
    let uploadCancelled = false
    const { fetch, server } = connect(request => {
      void request.body
        ?.getReader()
        .read()
        .then(
          result => (readOutcome = result.done ? 'done' : 'data'),
          (err: unknown) => (readOutcome = err instanceof Error ? err.name : String(err)),
        )
      return new Response(null, { status: 413 })
    })
    const source = new ReadableStream<Uint8Array>({
      pull: () => new Promise(noop),
      cancel: () => {
        uploadCancelled = true
      },
    })

    const response = await fetch(
      new Request('http://app.desktop/early', { method: 'POST', body: source, duplex: 'half' }),
    )
    await tick()

    expect(response.status).toBe(413)
    expect(uploadCancelled).toBe(true)
    expect(readOutcome).toBe('done')
    // Nothing is left for close() to tear down.
    server.close()
    await tick()
    expect(readOutcome).toBe('done')
  })

  it('ends an upload the handler is still reading once an early response with a body completes (re-review 2)', async () => {
    let readOutcome = 'pending'
    const { fetch } = connect(request => {
      void request.body
        ?.getReader()
        .read()
        .then(
          result => (readOutcome = result.done ? 'done' : 'data'),
          (err: unknown) => (readOutcome = err instanceof Error ? err.name : String(err)),
        )
      return new Response('too large', { status: 413 })
    })

    const response = await fetch(
      new Request('http://app.desktop/early-body', {
        method: 'POST',
        body: new ReadableStream<Uint8Array>({ pull: () => new Promise(noop) }),
        duplex: 'half',
      }),
    )
    expect(await response.text()).toBe('too large')
    await tick()

    expect(readOutcome).toBe('done')
  })

  it('rejects when posting the request throws, with the request cleaned up (finding 9)', async () => {
    const channel = new MessageChannel()
    channels.push(channel)
    const broken: Port = {
      ...fromNodePort(channel.port1),
      postMessage() {
        throw new Error('port is broken')
      },
    }
    const fetch = createPortFetch(broken)

    await expect(fetch(new Request('http://app.desktop/x'))).rejects.toThrow('port is broken')
  })
})
