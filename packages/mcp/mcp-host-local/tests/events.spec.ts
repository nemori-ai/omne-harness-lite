// @module-tag slow — every case starts the SDK's 2026-07-28 server on a local port.
import { afterEach, describe, expect, it } from 'vitest'
import type { EventStreamMessage, McpTransport } from '@omne-harness/mcp-contract/provider'
import { generationOf, jsonOf } from '@omne-harness/mcp-contract/testing'
import { createLocalTransportFactory } from '@omne-harness/mcp-host-local'
import { eventsServer, type EventsServer } from './fixtures/sdk/events-http.ts'

const peers: EventsServer[] = []
const transports: McpTransport[] = []
afterEach(async () => {
  await Promise.all(transports.splice(0).map(transport => transport.close()))
  await Promise.all(peers.splice(0).map(peer => peer.close()))
})

async function opened(): Promise<Readonly<{ peer: EventsServer; transport: McpTransport }>> {
  const peer = await eventsServer()
  peers.push(peer)
  const factory = createLocalTransportFactory({
    clientInfo: { name: 'events', version: '0' },
    maxLongRequests: 2,
  })
  const made = await factory.open(
    {
      kind: 'streamable-http',
      target: peer.target,
      generation: generationOf(1),
      instructionsByteLimit: 4096,
    },
    new AbortController().signal,
  )
  if (!('ok' in made)) throw new Error(JSON.stringify(made))
  transports.push(made.ok)
  const discovered = await made.ok.discover()
  if (!('ok' in discovered)) throw new Error(JSON.stringify(discovered))
  return { peer, transport: made.ok }
}

const until = async (check: () => boolean, ms = 5000): Promise<void> => {
  const end = Date.now() + ms
  while (!check() && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 10))
}

const request = (cursor: string | null) => ({
  name: 'incident.created',
  arguments: jsonOf({ queue: 'ops' }),
  cursor,
  headers: { 'mcp-param-queue': 'ops' },
})

describe('the event requests of a peer (C302)', () => {
  it('a poll answers what happened after the position, with the position after it', async () => {
    const { peer, transport } = await opened()
    peer.emit('incident.created', { id: 1 })
    peer.emit('incident.created', { id: 2 })
    const polled = await transport.pollEvents?.(request('1'))
    expect(polled).toMatchObject({
      ok: { cursor: '2', truncated: false, hasMore: false, nextPollMs: 100 },
    })
    if (polled === undefined || !('ok' in polled)) throw new Error('not polled')
    expect(polled.ok.events).toHaveLength(1)
    expect(peer.headers.at(-1)).toMatchObject({
      'mcp-name': 'incident.created',
      'mcp-param-queue': 'ops',
    })
  })

  it('a stream says it is active, brings what happened after the position and what happens next, and ends when the peer ends it', async () => {
    const { peer, transport } = await opened()
    peer.emit('incident.created', { id: 1 })
    const heard: EventStreamMessage[] = []
    const streaming = transport.streamEvents?.(
      request('0'),
      new AbortController().signal,
      message => heard.push(message),
    )
    await until(() => heard.length >= 2)
    expect(heard.map(message => message.kind)).toEqual(['active', 'event'])
    peer.emit('incident.created', { id: 2 })
    await until(() => heard.length >= 3)
    expect(heard[2]).toMatchObject({ kind: 'event', cursor: '2' })
    peer.terminate(-32024)
    await until(() => heard.length >= 4)
    expect(heard[3]).toEqual({ kind: 'terminated', code: -32024, data: null })
    expect(await streaming).toMatchObject({ kind: expect.any(String) })
  })

  it('the caller stopping a stream is a stop', async () => {
    const { transport } = await opened()
    const controller = new AbortController()
    const heard: EventStreamMessage[] = []
    const streaming = transport.streamEvents?.(request(null), controller.signal, message =>
      heard.push(message),
    )
    await until(() => heard.length >= 1)
    controller.abort()
    expect(await streaming).toEqual({ kind: 'stopped' })
  })
})
