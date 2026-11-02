import { createServer } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { createHttpTransport } from '@omne-harness/sdk'
import {
  closedPort,
  jsonReply,
  startLoopback,
  type LoopbackServer,
  type Reply,
} from './support/loopback.ts'

const servers: LoopbackServer[] = []
async function serve(handler: () => Reply | Promise<Reply>): Promise<LoopbackServer> {
  const server = await startLoopback(handler)
  servers.push(server)
  return server
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => server.close()))
})

const bytes = new TextEncoder().encode('{"probe":true}')
const text = (value: Uint8Array) => new TextDecoder().decode(value)

describe('createHttpTransport origin', () => {
  it.each([
    'http://127.0.0.1:8787',
    'http://127.0.0.1:8787/',
    'http://localhost:8787',
    'http://LOCALHOST',
  ])('accepts the loopback address %s', origin => {
    expect(() => createHttpTransport({ origin, location: 'session' })).not.toThrow()
  })

  it.each([
    'https://127.0.0.1:8787',
    'http://example.com:8787',
    'http://192.168.1.10:8787',
    'http://0.0.0.0:8787',
    'http://[::1]:8787',
    'http://user:pw@127.0.0.1:8787',
    'http://127.0.0.1:8787/api',
    'http://127.0.0.1:8787/?q=1',
    'ftp://127.0.0.1',
    'not a url',
    '',
  ])('refuses %j and the error text does not repeat a credential', origin => {
    expect(() => createHttpTransport({ origin, location: 'governance' })).toThrow(TypeError)
    try {
      createHttpTransport({ origin, location: 'governance' })
    } catch (error) {
      expect(String(error)).not.toContain('pw@')
    }
  })
})

describe('createHttpTransport requests', () => {
  it.each([
    ['governance', '/governance-public/1'],
    ['session', '/session-public/1'],
  ] as const)('posts the exact bytes to the fixed %s path', async (location, path) => {
    const server = await serve(() => jsonReply(200, { ok: true }))
    const report = await createHttpTransport({ origin: server.origin, location }).send(bytes)
    expect(report.kind).toBe('response')
    const [seen] = server.received
    expect(seen?.method).toBe('POST')
    expect(seen?.url).toBe(path)
    expect(seen?.headers['content-type']).toBe('application/json')
    expect(seen?.headers['authorization']).toBeUndefined()
    expect(seen?.headers['cookie']).toBeUndefined()
    expect(text(seen?.body ?? Buffer.alloc(0))).toBe('{"probe":true}')
  })
})

describe('createHttpTransport responses', () => {
  it.each([200, 403, 500])('hands over a JSON body at status %i', async status => {
    const server = await serve(() => jsonReply(status, { outcome: 'x' }))
    const report = await createHttpTransport({ origin: server.origin, location: 'session' }).send(
      bytes,
    )
    expect(report.kind).toBe('response')
    if (report.kind === 'response') expect(text(report.bytes)).toBe('{"outcome":"x"}')
  })

  it('accepts a content type with other casing and a charset parameter', async () => {
    const server = await serve(() => ({
      status: 200,
      headers: { 'content-type': 'Application/JSON;charset=UTF-8' },
      body: '{}',
    }))
    const report = await createHttpTransport({ origin: server.origin, location: 'session' }).send(
      bytes,
    )
    expect(report.kind).toBe('response')
  })

  it.each([
    ['an empty 500', { status: 500 }],
    ['an empty 404', { status: 404 }],
    ['an empty 405', { status: 405, headers: { allow: 'POST' } }],
    ['an empty 421', { status: 421 }],
    [
      'a text body',
      { status: 200, headers: { 'content-type': 'text/plain' }, body: '{"outcome":"x"}' },
    ],
    [
      'a JSON-like media type',
      { status: 200, headers: { 'content-type': 'application/jsonx' }, body: '{}' },
    ],
    ['no content type', { status: 200, body: '{}' }],
  ] satisfies [string, Reply][])('reports uncertain for %s', async (_name, reply) => {
    const server = await serve(() => reply)
    const report = await createHttpTransport({ origin: server.origin, location: 'session' }).send(
      bytes,
    )
    expect(report).toEqual({ kind: 'uncertain' })
  })

  it('does not follow a redirect and reports uncertain', async () => {
    const target = await serve(() => jsonReply(200, { reached: true }))
    const server = await serve(() => ({
      status: 307,
      headers: { location: `${target.origin}/session-public/1` },
    }))
    const report = await createHttpTransport({ origin: server.origin, location: 'session' }).send(
      bytes,
    )
    expect(report).toEqual({ kind: 'uncertain' })
    expect(server.received).toHaveLength(1)
    expect(target.received).toHaveLength(0)
  })

  it('reports uncertain when the response ends before its declared length', async () => {
    const raw = createServer(socket => {
      socket.once('data', () => {
        socket.write(
          'HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: 100\r\n\r\n{"a":',
          () => socket.destroy(),
        )
      })
    })
    await new Promise<void>(resolve => raw.listen(0, '127.0.0.1', resolve))
    const { port } = raw.address() as { port: number }
    try {
      const report = await createHttpTransport({
        origin: `http://127.0.0.1:${port}`,
        location: 'session',
      }).send(bytes)
      expect(report).toEqual({ kind: 'uncertain' })
    } finally {
      raw.close()
    }
  })
})

describe('createHttpTransport failures before and after the bytes leave', () => {
  it('reports not-sent when the connection is refused', async () => {
    const port = await closedPort()
    const report = await createHttpTransport({
      origin: `http://127.0.0.1:${port}`,
      location: 'session',
    }).send(bytes)
    expect(report).toEqual({ kind: 'not-sent' })
  })

  it('reports not-sent when the caller cancelled before the request began', async () => {
    const server = await serve(() => jsonReply(200, {}))
    const controller = new AbortController()
    controller.abort()
    const report = await createHttpTransport({
      origin: server.origin,
      location: 'session',
      signal: controller.signal,
    }).send(bytes)
    expect(report).toEqual({ kind: 'not-sent' })
    expect(server.received).toHaveLength(0)
  })

  it('reports uncertain when the peer reads the request and drops the connection', async () => {
    const raw = createServer(socket => {
      socket.once('data', () => socket.destroy())
    })
    await new Promise<void>(resolve => raw.listen(0, '127.0.0.1', resolve))
    const { port } = raw.address() as { port: number }
    try {
      const report = await createHttpTransport({
        origin: `http://127.0.0.1:${port}`,
        location: 'governance',
      }).send(bytes)
      expect(report).toEqual({ kind: 'uncertain' })
    } finally {
      raw.close()
    }
  })

  it('reports uncertain when the caller cancels while the request is in flight', async () => {
    const controller = new AbortController()
    const server = await serve(
      () =>
        new Promise<Reply>(() => {
          controller.abort()
        }),
    )
    const report = await createHttpTransport({
      origin: server.origin,
      location: 'session',
      signal: controller.signal,
    }).send(bytes)
    expect(report).toEqual({ kind: 'uncertain' })
    expect(server.received).toHaveLength(1)
  })
})
