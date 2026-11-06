// The two lines on in-memory wires: what they do with bytes before the session sees a message.
// The stdio line's byte bound on every line (T2), and the HTTP line's bookkeeping of the abort
// signals it is given, which failures of a request it reports as not made (T8 X01), and the fetch
// of protected resource metadata on a `fetch` double (R4). The lines on real pipes and sockets are
// in `stdio.spec.ts`, `http.spec.ts`.
import { getEventListeners } from 'node:events'
import { describe, expect, it } from 'vitest'
import { writeJsonText } from '@omne-harness/json-text'
import type { ProcessHandle, TransportMaterial } from '@omne-harness/mcp-contract/provider'
import { generationOf } from '@omne-harness/mcp-contract/testing'
import { createLocalTransportFactory } from '@omne-harness/mcp-host-local'
import { metadataFetcher } from '../src/authorization.ts'
import { HttpLine } from '../src/http-line.ts'
import type { LineEvent } from '../src/line.ts'
import { StdioLine } from '../src/stdio-line.ts'
import { settledWithin } from './fixtures/settle.ts'

const BYTE_LIMIT = 16_777_216
const NOT_SENT = { failure: { kind: 'not-sent', cause: 'connection-unavailable' } }
const STREAM_BROKEN = { failure: { kind: 'no-answer', cause: 'stream-broken' } }

/**
 * A process whose stdout answers the first write with one chunk: a short line, a line above the
 * byte bound, then the answer to the request. A real pipe hands over at most 64 KiB at a time,
 * so only an in-memory handle can put the long line anywhere but at the head of a chunk.
 */
function chunkingProcess(): ProcessHandle {
  const encoder = new TextEncoder()
  let out: ReadableStreamDefaultController<Uint8Array> | undefined
  const answer = (text: string) => {
    const request: unknown = JSON.parse(text)
    const id =
      typeof request === 'object' && request !== null && 'id' in request ? request.id : null
    const result = { supportedVersions: ['2026-07-28'], capabilities: {} }
    return JSON.stringify({ jsonrpc: '2.0', id, result })
  }
  return {
    stdin: new WritableStream<Uint8Array>({
      write(chunk) {
        const text = new TextDecoder().decode(chunk)
        const chunked = `{"a":1}\n"${'x'.repeat(BYTE_LIMIT + 10)}"\n${answer(text)}\n`
        out?.enqueue(encoder.encode(chunked))
      },
    }),
    stdout: new ReadableStream<Uint8Array>({
      start(controller) {
        out = controller
      },
    }),
    stderr: new ReadableStream<string>(),
    exited: new Promise<void>(() => undefined),
    stop: async () => 'root-only',
  }
}

describe('the stdio line and the byte bound (T2)', () => {
  it('a line above 16 MiB that is not the first of its chunk breaks the stream: stream-broken, then not-sent', async () => {
    const factory = createLocalTransportFactory({
      clientInfo: { name: 'host', version: '1' },
      probeTimeoutMs: 5_000,
    })
    const material: TransportMaterial = {
      kind: 'stdio',
      process: chunkingProcess(),
      generation: generationOf(1),
      instructionsByteLimit: 4096,
    }
    const opened = await factory.open(material, new AbortController().signal)
    if (!('ok' in opened)) throw new Error('open failed')
    expect(await opened.ok.discover()).toEqual(STREAM_BROKEN)
    expect(await opened.ok.listActions()).toEqual(NOT_SENT)
    await opened.ok.close()
  })
})

/** A process that has exited and ended its stdout already; `written` collects what reaches stdin. */
function goneHandle(written: Uint8Array[]): ProcessHandle {
  return {
    stdin: new WritableStream<Uint8Array>({
      write(chunk) {
        written.push(chunk)
      },
    }),
    stdout: new ReadableStream<Uint8Array>({ start: controller => controller.close() }),
    stderr: new ReadableStream<string>({ start: controller => controller.close() }),
    exited: Promise.resolve(),
    stop: async () => 'root-only',
  }
}

describe('a stdio process that is gone before the first request (T8 X02)', () => {
  it('the line writes nothing to it and reports the request as unsent', async () => {
    const written: Uint8Array[] = []
    const line = new StdioLine(goneHandle(written))
    await line.ready()
    const exchange = await line.send(
      { text: '{}', headers: new Headers() },
      new AbortController().signal,
    )
    expect(exchange).toEqual({ kind: 'unsent' })
    expect(written).toEqual([])
    await line.close()
  })

  it('the transport opened on it answers not-sent and nothing reaches the process', async () => {
    const written: Uint8Array[] = []
    const factory = createLocalTransportFactory({
      clientInfo: { name: 'host', version: '1' },
      probeTimeoutMs: 5_000,
    })
    const opened = await factory.open(
      {
        kind: 'stdio',
        process: goneHandle(written),
        generation: generationOf(1),
        instructionsByteLimit: 4096,
      },
      new AbortController().signal,
    )
    if (!('ok' in opened)) throw new Error('open failed')
    expect(await opened.ok.discover()).toEqual(NOT_SENT)
    expect(await opened.ok.listActions()).toEqual(NOT_SENT)
    expect(written).toEqual([])
    await opened.ok.close()
  })
})

describe('a stdio process that exits before its stdout ends (T8 exit window)', () => {
  it('delivers the line that stdout still carries within the window, then reports the end with the exit alone', async () => {
    let out: ReadableStreamDefaultController<Uint8Array> | undefined
    const handle: ProcessHandle = {
      stdin: new WritableStream<Uint8Array>(),
      stdout: new ReadableStream<Uint8Array>({
        start: controller => {
          out = controller
        },
      }),
      stderr: new ReadableStream<string>(),
      exited: Promise.resolve(),
      stop: async () => 'root-only',
    }
    const line = new StdioLine(handle)
    setTimeout(() => out?.enqueue(new TextEncoder().encode('{"jsonrpc":"2.0"}\n')), 20)
    const events: LineEvent[] = []
    for await (const event of line.events) {
      events.push(event)
      if (event.kind === 'ended') break
    }
    expect(events.map(event => event.kind)).toEqual(['line', 'ended'])
    expect(events[0]).toEqual({ kind: 'line', text: '{"jsonrpc":"2.0"}' })
    const ended = events[1]
    expect(ended !== undefined && 'exitedAt' in ended).toBe(true)
    expect(ended !== undefined && 'stdoutEndedAt' in ended).toBe(false)
    await line.close()
  })
})

describe('the HTTP line and the signals it is given', () => {
  it('a write nobody waits for leaves no abort listener on the signal once its answer is read', async () => {
    const line = new HttpLine(
      'http://peer.test/mcp',
      async () => new Response(null, { status: 202 }),
    )
    const controller = new AbortController()
    for (let round = 0; round < 50; round += 1) {
      const exchange = await line.send({ text: '{}', headers: new Headers() }, controller.signal)
      expect(exchange.kind).toBe('stream')
      if (exchange.kind === 'stream') for await (const message of exchange.messages) void message
    }
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0)
    await line.close()
  })
})

/** A process that accepts every write at once and never writes, exits or is read. */
function idleHandle(): ProcessHandle {
  return {
    stdin: new WritableStream<Uint8Array>(),
    stdout: new ReadableStream<Uint8Array>(),
    stderr: new ReadableStream<string>(),
    exited: new Promise<void>(() => undefined),
    stop: async () => 'root-only',
  }
}

describe('the stdio line and the signals it is given', () => {
  it('a write nobody waits for leaves no abort listener on the signal once the write completes (N1)', async () => {
    const line = new StdioLine(idleHandle())
    const controller = new AbortController()
    for (let round = 0; round < 50; round += 1) {
      const exchange = await line.send({ text: '{}', headers: new Headers() }, controller.signal)
      expect(exchange.kind).toBe('sent')
    }
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0)
    await line.close()
  })
})

/**
 * A process whose stdin takes the first write and never completes the second: a full pipe at a
 * peer that stopped reading. (The sink's `abort` is not observable here: a `WritableStream`
 * calls it only once the write in flight settled, which this one never does.)
 */
function stuckOnSecondWrite(): ProcessHandle {
  let writes = 0
  return {
    stdin: new WritableStream<Uint8Array>(
      {
        write() {
          writes += 1
          return writes === 1 ? Promise.resolve() : new Promise<void>(() => undefined)
        },
      },
      { highWaterMark: 1 },
    ),
    stdout: new ReadableStream<Uint8Array>(),
    stderr: new ReadableStream<string>(),
    exited: new Promise<void>(() => undefined),
    stop: async () => 'root-only',
  }
}

describe('the stdio line and close() with writes in flight (T5, SPEC H6)', () => {
  it('two overlapping writes, the first completes, then close(): close() returns at once, the write still in flight is aborted', async () => {
    const line = new StdioLine(stuckOnSecondWrite())
    const never = new AbortController().signal
    const first = line.send({ text: '{"small":1}', headers: new Headers() }, never)
    const second = line.send({ text: '{"big":2}', headers: new Headers() }, never)
    expect(await first).toEqual({ kind: 'sent' })
    expect(await settledWithin(second, 30)).toBe('pending')
    expect(await settledWithin(line.close())).toEqual({ settled: undefined })
    expect(await settledWithin(second)).toEqual({ settled: { kind: 'aborted' } })
  })
})

/** A process whose stdout is fed by the test, chunk by chunk, and records whether it was cancelled. */
function fedProcess(): Readonly<{
  handle: ProcessHandle
  feed: (chunk: Uint8Array) => void
  end: () => void
  cancelled: () => boolean
}> {
  let out: ReadableStreamDefaultController<Uint8Array> | undefined
  let cancelled = false
  const handle: ProcessHandle = {
    stdin: new WritableStream<Uint8Array>(),
    stdout: new ReadableStream<Uint8Array>({
      start(controller) {
        out = controller
      },
      cancel() {
        cancelled = true
      },
    }),
    stderr: new ReadableStream<string>(),
    exited: new Promise<void>(() => undefined),
    stop: async () => 'root-only',
  }
  return {
    handle,
    feed: chunk => out?.enqueue(chunk),
    end: () => out?.close(),
    cancelled: () => cancelled,
  }
}

/** The next event of the line, or `pending` when none came within the bound. */
async function nextEvent(
  events: AsyncIterator<LineEvent>,
  bound?: number,
): Promise<Readonly<{ settled: IteratorResult<LineEvent> }> | 'pending'> {
  return settledWithin(events.next(), bound)
}

describe('the stdio line reads stdout by lines (T2, SPEC H8)', () => {
  it('a line that spans many chunks and passes the byte bound before any newline breaks the stream and stops reading', async () => {
    const process = fedProcess()
    const line = new StdioLine(process.handle)
    const events = line.events[Symbol.asyncIterator]()
    const chunk = new Uint8Array(65_536).fill(0x78)
    // 16 MiB is 256 chunks of 64 KiB; the 257th takes the line in progress above the bound.
    for (let count = 0; count < 257; count += 1) process.feed(chunk)
    expect(await nextEvent(events)).toEqual({
      settled: { value: { kind: 'ended', stdoutEndedAt: expect.any(Number) }, done: false },
    })
    expect(process.cancelled()).toBe(true)
    await line.close()
  })

  it('a write the process rejects is unsent, and so is every write after it (T8 X02)', async () => {
    const line = new StdioLine({
      stdin: new WritableStream<Uint8Array>({
        write() {
          return Promise.reject(new Error('EPIPE'))
        },
      }),
      stdout: new ReadableStream<Uint8Array>(),
      stderr: new ReadableStream<string>(),
      exited: new Promise<void>(() => undefined),
      stop: async () => 'root-only',
    })
    const never = new AbortController().signal
    expect(await line.send({ text: '{"a":1}', headers: new Headers() }, never)).toEqual({
      kind: 'unsent',
    })
    expect(await line.send({ text: '{"b":2}', headers: new Headers() }, never)).toEqual({
      kind: 'unsent',
    })
    await line.close()
  })

  it('the last line of stdout is delivered when stdout ends without a newline after it', async () => {
    const process = fedProcess()
    const line = new StdioLine(process.handle)
    const events = line.events[Symbol.asyncIterator]()
    process.feed(new TextEncoder().encode('{"first":1}\n{"last":2}'))
    process.end()
    expect(await nextEvent(events)).toEqual({
      settled: { value: { kind: 'line', text: '{"first":1}' }, done: false },
    })
    expect(await nextEvent(events)).toEqual({
      settled: { value: { kind: 'line', text: '{"last":2}' }, done: false },
    })
    await line.close()
  })
})

/** What a failed `fetch` looks like: a `TypeError` whose `cause` carries the system code. */
function fetchFailure(code: unknown): Error {
  return Object.assign(new TypeError('fetch failed'), {
    cause: Object.assign(new Error('socket'), { code }),
  })
}

const failsWith =
  (error: unknown): typeof fetch =>
  async () => {
    throw error
  }

/** The codes of a connection that was never made (T8 X01); each is one of them and no other is. */
const NEVER_MADE = [
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EADDRNOTAVAIL',
  'UND_ERR_CONNECT_TIMEOUT',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'CERT_HAS_EXPIRED',
  'ERR_SSL_WRONG_VERSION_NUMBER',
  'ERR_SSL_',
]

/** Failures after the request began to go out, and failures that carry no usable code. */
const MAY_HAVE_LEFT: readonly unknown[] = [
  fetchFailure('ECONNRESET'),
  fetchFailure('UND_ERR_SOCKET'),
  fetchFailure('ETIMEDOUT'),
  fetchFailure('EPIPE'),
  fetchFailure('UND_ERR_HEADERS_TIMEOUT'),
  fetchFailure('UND_ERR_BODY_TIMEOUT'),
  fetchFailure('econnrefused'),
  fetchFailure('ECONNREFUSED '),
  fetchFailure('ERR_SSL'),
  fetchFailure('ERR_TLS_CERT'),
  fetchFailure(7),
  fetchFailure({ toString: () => 'ECONNREFUSED' }),
  fetchFailure(undefined),
  new TypeError('fetch failed'),
  Object.assign(new TypeError('fetch failed'), { cause: 'ECONNREFUSED' }),
  Object.assign(new TypeError('fetch failed'), { cause: null }),
  Object.assign(new TypeError('fetch failed'), { cause: { message: 'no code' } }),
  { cause: { code: 'ECONNREFUSED' } },
  'ECONNREFUSED',
]

describe('which failures of a request the HTTP line reports as not made (T8 X01, X02)', () => {
  const target = 'http://peer.test/mcp'
  const message = { text: '{}', headers: new Headers() }

  it('reports each code of a connection that was never made as unsent, on a POST and on the GET of the fallback', async () => {
    for (const code of NEVER_MADE) {
      const line = new HttpLine(target, failsWith(fetchFailure(code)))
      const live = new AbortController().signal
      expect(await line.send(message, live), `POST, ${code}`).toEqual({ kind: 'unsent' })
      expect(await line.openGet(new Headers(), live), `GET, ${code}`).toEqual({ kind: 'unsent' })
      await line.close()
    }
  })

  it('reports any other failure as aborted on a POST and as unavailable on the GET', async () => {
    for (const error of MAY_HAVE_LEFT) {
      const line = new HttpLine(target, failsWith(error))
      const live = new AbortController().signal
      expect(await line.send(message, live), `POST, ${String(error)}`).toEqual({ kind: 'aborted' })
      expect(await line.openGet(new Headers(), live), `GET, ${String(error)}`).toEqual({
        kind: 'unavailable',
      })
      await line.close()
    }
  })

  it('reports a request whose signal fired as aborted whatever the failure says', async () => {
    const line = new HttpLine(target, failsWith(fetchFailure('ECONNREFUSED')))
    const fired = AbortSignal.abort()
    expect(await line.send(message, fired)).toEqual({ kind: 'aborted' })
    await line.close()
  })

  it('reports a line that is closed as unsent on a POST and as unavailable on the GET, without a request', async () => {
    let requests = 0
    const line = new HttpLine(target, async () => {
      requests += 1
      return new Response(null, { status: 202 })
    })
    await line.close()
    const live = new AbortController().signal
    expect(await line.send(message, live)).toEqual({ kind: 'unsent' })
    expect(await line.openGet(new Headers(), live)).toEqual({ kind: 'unavailable' })
    expect(requests).toBe(0)
  })
})

describe('the fetch of protected resource metadata (R4, T4)', () => {
  const BYTE_LIMIT_TEXT = 16_777_216
  const never = new AbortController().signal
  const document = { authorization_servers: ['https://issuer.test'], scopes_supported: ['a'] }
  const answering =
    (response: () => Response): typeof fetch =>
    async () =>
      response()

  it('reads a 200 answer that holds JSON as the tree of the text, with the request the contract names', async () => {
    const seen: { url: string | URL | Request; init: RequestInit | undefined }[] = []
    const fetchFn: typeof fetch = async (url, init) => {
      seen.push({ url, init })
      return new Response(JSON.stringify(document), { status: 200 })
    }
    const signal = new AbortController().signal
    const read = await metadataFetcher(fetchFn)('https://peer.test/.well-known/x', signal)
    expect(read === undefined ? undefined : writeJsonText(read)).toBe(JSON.stringify(document))
    expect(seen).toHaveLength(1)
    expect(seen[0]?.url).toBe('https://peer.test/.well-known/x')
    expect(seen[0]?.init?.method).toBe('GET')
    expect(seen[0]?.init?.redirect).toBe('manual')
    expect(seen[0]?.init?.signal).toBe(signal)
    expect(new Headers(seen[0]?.init?.headers).get('accept')).toBe('application/json')
    expect([...new Headers(seen[0]?.init?.headers).keys()]).toEqual(['accept'])
  })

  it('reads nothing from any status but 200, even when the body holds the document', async () => {
    for (const status of [201, 202, 206, 301, 302, 400, 401, 403, 404, 500, 503]) {
      const fetchFn = answering(() => new Response(JSON.stringify(document), { status }))
      expect(
        await metadataFetcher(fetchFn)('https://p.test/m', never),
        String(status),
      ).toBeUndefined()
    }
    const empty = answering(() => new Response(null, { status: 204 }))
    expect(await metadataFetcher(empty)('https://p.test/m', never)).toBeUndefined()
  })

  it('cancels the body of an answer it did not read', async () => {
    for (const status of [301, 404, 500]) {
      let cancelled = false
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.enqueue(new TextEncoder().encode(JSON.stringify(document)))
        },
        cancel() {
          cancelled = true
        },
      })
      const fetchFn = answering(() => new Response(body, { status }))
      expect(await metadataFetcher(fetchFn)('https://p.test/m', never)).toBeUndefined()
      expect(cancelled, `the body of ${status} is cancelled`).toBe(true)
    }
  })

  it('reads nothing when the request fails, when the text is not JSON, or when the answer is empty', async () => {
    const fetchOf = (response: () => Response) => metadataFetcher(answering(response))
    expect(
      await metadataFetcher(failsWith(fetchFailure('ECONNREFUSED')))('https://p/m', never),
    ).toBeUndefined()
    expect(
      await fetchOf(() => new Response('{"a":', { status: 200 }))('https://p/m', never),
    ).toBeUndefined()
    expect(
      await fetchOf(() => new Response('', { status: 200 }))('https://p/m', never),
    ).toBeUndefined()
    expect(
      await fetchOf(() => new Response(null, { status: 200 }))('https://p/m', never),
    ).toBeUndefined()
    expect(
      await fetchOf(() => new Response('{} trailing', { status: 200 }))('https://p/m', never),
    ).toBeUndefined()
  })

  it('reads a body of exactly the byte bound and nothing from one byte above it', async () => {
    const quoted = (bytes: number) => `"${'a'.repeat(bytes - 2)}"`
    const atBound = await metadataFetcher(
      answering(() => new Response(quoted(BYTE_LIMIT_TEXT), { status: 200 })),
    )('https://p/m', never)
    expect(atBound?.kind).toBe('string')
    let cancelled = false
    const above = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(quoted(BYTE_LIMIT_TEXT)))
        controller.enqueue(new TextEncoder().encode(' '))
      },
      cancel() {
        cancelled = true
      },
    })
    expect(
      await metadataFetcher(answering(() => new Response(above, { status: 200 })))(
        'https://p/m',
        never,
      ),
    ).toBeUndefined()
    expect(cancelled).toBe(true)
  })
})
