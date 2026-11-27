// @module-tag slow — every case starts the SDK's 2026-07-28 server on a local port.
import { afterEach, describe, expect, it } from 'vitest'
import type { ListenEvent, McpTransport } from '@omne-harness/mcp-contract/provider'
import { generationOf } from '@omne-harness/mcp-contract/testing'
import { createLocalTransportFactory } from '@omne-harness/mcp-host-local'
import { changingServer, type ChangingServer } from './fixtures/sdk/changing-http.ts'

const peers: ChangingServer[] = []
const transports: McpTransport[] = []
afterEach(async () => {
  await Promise.all(transports.splice(0).map(transport => transport.close()))
  await Promise.all(peers.splice(0).map(peer => peer.close()))
})

async function opened(
  maxLongRequests = 2,
): Promise<Readonly<{ peer: ChangingServer; transport: McpTransport }>> {
  const peer = await changingServer()
  peers.push(peer)
  const factory = createLocalTransportFactory({
    clientInfo: { name: 'listen', version: '0' },
    maxLongRequests,
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

describe('a long request: subscriptions/listen (C107, C112)', () => {
  it('hears what the peer agreed to, then each change of its tools; the caller stopping it is a stop', async () => {
    const { peer, transport } = await opened()
    const events: ListenEvent[] = []
    const controller = new AbortController()
    const listening = transport.listen?.({ toolsListChanged: true }, controller.signal, event =>
      events.push(event),
    )
    await until(() => events.length > 0)
    expect(events).toEqual([{ kind: 'acknowledged', agreed: { toolsListChanged: true } }])
    peer.offer(['echo', 'write'])
    await until(() => events.length > 1)
    expect(events[1]).toEqual({ kind: 'tools-changed' })
    controller.abort()
    expect(await listening).toEqual({ kind: 'stopped' })
  })

  it('keeps no more long requests open than its bound; one more is not sent', async () => {
    const { transport } = await opened(1)
    const controller = new AbortController()
    const first = transport.listen?.({ toolsListChanged: true }, controller.signal, () => undefined)
    expect(
      await transport.listen?.(
        { toolsListChanged: true },
        new AbortController().signal,
        () => undefined,
      ),
    ).toEqual({
      kind: 'refused',
      failure: { kind: 'not-sent', cause: 'connection-unavailable' },
    })
    controller.abort()
    expect(await first).toEqual({ kind: 'stopped' })
  })

  it('a broken stream ends it as broken, not as a failure, and the connection stays usable', async () => {
    const { peer, transport } = await opened()
    const events: ListenEvent[] = []
    const listening = transport.listen?.(
      { toolsListChanged: true },
      new AbortController().signal,
      event => events.push(event),
    )
    await until(() => events.length > 0)
    peer.drop()
    expect(await listening).toEqual({ kind: 'broken' })
    expect(await transport.listActions()).toMatchObject({ ok: { tools: [expect.anything()] } })
  })
})
