// The two lines on in-memory wires: what they do with bytes before the session sees a message.
// The stdio line's byte bound on every line (T2), and the HTTP line's bookkeeping of the abort
// signals it is given. The lines on real pipes and sockets are in `stdio.spec.ts`, `http.spec.ts`.
import { getEventListeners } from 'node:events'
import { describe, expect, it } from 'vitest'
import type { ProcessHandle, TransportMaterial } from '@omne-harness/mcp-contract/provider'
import { generationOf } from '@omne-harness/mcp-contract/testing'
import { createLocalTransportFactory } from '@omne-harness/mcp-host-local'
import { HttpLine } from '../src/http-line.ts'
import { StdioLine } from '../src/stdio-line.ts'
import { failOnUnhandledErrors } from './unhandled.ts'

failOnUnhandledErrors()

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
