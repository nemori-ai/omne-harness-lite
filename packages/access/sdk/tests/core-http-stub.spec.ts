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

  it('refuses an origin with a path, a credential or another scheme', () => {
    for (const origin of [
      'http://127.0.0.1:1/api',
      'http://u:p@127.0.0.1:1',
      'ftp://127.0.0.1',
      'nope',
    ])
      expect(() => createHttpProtocolTransport({ origin })).toThrow(TypeError)
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
