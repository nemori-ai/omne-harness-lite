// The HTTP transport of the client core against a stub server that answers outside the binding
// (#1249 C13, C14): every such answer is `uncertain`, and the headers carry what the credential
// source gives.
import { afterEach, describe, expect, it } from 'vitest'
import { createHttpProtocolTransport } from '@omne-harness/sdk/core'
import { jsonReply, startLoopback, type LoopbackServer, type Reply } from './support/loopback.ts'

const servers: LoopbackServer[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => server.close()))
})

async function serve(reply: Reply): Promise<LoopbackServer> {
  const server = await startLoopback(() => reply)
  servers.push(server)
  return server
}

const OPEN = { kind: 'object', entries: [] } as const
const NOTES = { name: 'notes', major: 1 }

async function endOf(reply: Reply): Promise<unknown> {
  const server = await serve(reply)
  const transport = createHttpProtocolTransport({ origin: server.origin })
  const stream = transport.observe({
    protocol: NOTES,
    observation: 'watch-all',
    messageId: 'm-1',
    open: OPEN,
    signal: new AbortController().signal,
  })
  return (await stream.next()).value
}

describe('answers outside the binding', () => {
  it('ends an observation as uncertain for a text answer, a JSON answer without an outcome, a 200 that is not a stream, and a stream that stops', async () => {
    expect(await endOf({ status: 404, body: 'nope' })).toEqual({ kind: 'uncertain' })
    expect(await endOf(jsonReply(503, { body: {} }))).toEqual({ kind: 'uncertain' })
    expect(
      await endOf({ status: 200, headers: { 'content-type': 'text/plain' }, body: 'x' }),
    ).toEqual({
      kind: 'uncertain',
    })
    expect(
      await endOf({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: '' }),
    ).toEqual({ kind: 'uncertain' })
    expect(
      await endOf({
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
        body: 'data: {"kind":"surprise"}\n\n',
      }),
    ).toEqual({ kind: 'uncertain' })
  })

  it('answers a call as uncertain when the answer is not JSON of the binding', async () => {
    for (const reply of [
      { status: 200, headers: { 'content-type': 'text/plain' }, body: 'x' },
      jsonReply(200, { outcome: 7, body: {} }),
      jsonReply(200, { outcome: 'succeeded' }),
    ]) {
      const server = await serve(reply)
      const transport = createHttpProtocolTransport({ origin: server.origin })
      expect(
        await transport.call({ protocol: NOTES, operation: 'ping', messageId: 'm-1', body: OPEN }),
      ).toEqual({ kind: 'uncertain' })
    }
  })

  it('puts the proof and the tenant of the credential source on the request, and nothing without one', async () => {
    const server = await serve(jsonReply(200, { outcome: 'succeeded', body: {} }))
    const signed = createHttpProtocolTransport({
      origin: server.origin,
      credentials: async () => ({ proof: 'p-1', tenant: 't-1' }),
    })
    const bare = createHttpProtocolTransport({ origin: server.origin })
    const request = { protocol: NOTES, operation: 'ping', messageId: 'm-1', body: OPEN }
    expect(await signed.call(request)).toEqual({
      kind: 'answered',
      outcome: 'succeeded',
      body: OPEN,
    })
    await bare.call(request)
    const [first, second] = server.received
    expect(first!.url).toBe('/api/notes/v1/ping')
    expect([first!.headers.authorization, first!.headers['omne-acting-tenant']]).toEqual([
      'Bearer p-1',
      't-1',
    ])
    expect(first!.headers['omne-message-id']).toBe('m-1')
    expect([second!.headers.authorization, second!.headers['omne-acting-tenant']]).toEqual([
      undefined,
      undefined,
    ])
  })

  it('refuses an origin with a path, a user, a password, a query, a fragment or another scheme', () => {
    for (const origin of [
      'http://127.0.0.1:1/api',
      'http://u@127.0.0.1:1',
      'http://:p@127.0.0.1:1',
      'http://127.0.0.1:1/?q=1',
      'http://127.0.0.1:1/#h',
      'ftp://127.0.0.1',
      'nope',
    ])
      expect(() => createHttpProtocolTransport({ origin })).toThrow(
        new TypeError('origin must be an http or https origin'),
      )
    expect(() => createHttpProtocolTransport({ origin: 'https://127.0.0.1:1' })).not.toThrow()
  })

  it('reads the media type without case or parameters, and trusts no JSON under another type', async () => {
    const answer = JSON.stringify({ outcome: 'succeeded', body: {} })
    const request = { protocol: NOTES, operation: 'ping', messageId: 'm-1', body: OPEN }
    const loose = await serve({
      status: 200,
      headers: { 'content-type': 'Application/JSON ; charset=utf-8' },
      body: answer,
    })
    expect(await createHttpProtocolTransport({ origin: loose.origin }).call(request)).toEqual({
      kind: 'answered',
      outcome: 'succeeded',
      body: OPEN,
    })
    const plain = await serve({
      status: 200,
      headers: { 'content-type': 'text/plain' },
      body: answer,
    })
    expect(await createHttpProtocolTransport({ origin: plain.origin }).call(request)).toEqual({
      kind: 'uncertain',
    })
  })

  it('ends an observation as uncertain for an event outside the binding', async () => {
    const stream = (data: string): Reply => ({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: `data: ${data}\n\n`,
    })
    for (const data of [
      '7',
      '{',
      '{"kind":"ended"}',
      '{"kind":"frame"}',
      '{"kind":"surprise","frame":{}}',
    ])
      expect(await endOf(stream(data))).toEqual({ kind: 'uncertain' })
    expect(await endOf(stream('{"kind":"ended","reason":"note-deleted"}'))).toEqual({
      kind: 'ended',
      reason: 'note-deleted',
    })
  })

  it('reads no stream from an opening that is not a 200 event stream, even with a valid end in it', async () => {
    const end = 'data: {"kind":"ended","reason":"note-deleted"}\n\n'
    for (const reply of [
      { status: 200, headers: { 'content-type': 'text/plain' }, body: end },
      { status: 500, headers: { 'content-type': 'text/event-stream' }, body: end },
      { status: 204 },
      { status: 200, headers: { 'content-type': 'application/json' }, body: '{' },
      jsonReply(403, { outcome: 'denied' }),
    ])
      expect(await endOf(reply)).toEqual({ kind: 'uncertain' })
    expect(await endOf(jsonReply(403, { outcome: 'denied', body: {} }))).toEqual({
      kind: 'refused',
      outcome: 'denied',
    })
  })

  it('ends an observation as uncertain when the connection drops after the request arrived', async () => {
    expect(await endOf({ status: 0, hangUp: true })).toEqual({ kind: 'uncertain' })
  })

  it('does not send when the signal is already aborted', async () => {
    const server = await serve(jsonReply(200, { outcome: 'succeeded', body: {} }))
    const transport = createHttpProtocolTransport({ origin: server.origin })
    const controller = new AbortController()
    controller.abort()
    const request = { protocol: NOTES, operation: 'ping', messageId: 'm-1', body: OPEN }
    expect(await transport.call({ ...request, signal: controller.signal })).toEqual({
      kind: 'not-sent',
    })
    const stream = transport.observe({
      protocol: NOTES,
      observation: 'watch-all',
      messageId: 'm-1',
      open: OPEN,
      signal: controller.signal,
    })
    expect((await stream.next()).value).toEqual({ kind: 'aborted' })
    expect(server.received).toEqual([])
  })
})
