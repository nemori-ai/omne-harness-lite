import assert from 'node:assert/strict'
import { conformanceCase, NotApplicable, type ConformanceCase } from './testing-case.ts'
import {
  at,
  never,
  ok,
  requests,
  result,
  SILENT,
  STREAM_BREAKS,
  t1Cases,
  t2Cases,
  t3Cases,
  t4Cases,
  t5Cases,
  t6Cases,
  t9Cases,
  tableCases,
  TOOL,
  withPeer,
  type ScriptedPeer,
  type TransportFixture,
} from './testing-transport.ts'
import type { ListenEnd, ListenEvent, ListenFilter, McpTransport } from './transport.ts'

type Case = ConformanceCase<TransportFixture>
type Listen = (
  filter: ListenFilter,
  signal: AbortSignal,
  observe: (event: ListenEvent) => void,
) => Promise<ListenEnd>

const TOOLS: ListenFilter = { toolsListChanged: true }
const ACKNOWLEDGED = {
  method: 'notifications/subscriptions/acknowledged',
  params: { notifications: { toolsListChanged: true } },
}
const CHANGED = { method: 'notifications/tools/list_changed' }
const REFUSED: ListenEnd = {
  kind: 'refused',
  failure: { kind: 'not-sent', cause: 'connection-unavailable' },
}

// A transport without long requests offers nothing these cases can measure.
function listenOf(transport: McpTransport): Listen {
  const { listen } = transport
  if (listen === undefined) throw new NotApplicable('long requests')
  return (filter, signal, observe) => listen.call(transport, filter, signal, observe)
}

async function untilListens(peer: ScriptedPeer, count: number): Promise<boolean> {
  for (let round = 0; round < 500; round += 1) {
    if (requests(await peer.received(), 'subscriptions/listen').length >= count) return true
    await new Promise(resolve => setTimeout(resolve, 2))
  }
  return false
}

export const t10Cases = (): readonly Case[] => [
  conformanceCase(
    'T10',
    'long request: the acknowledgement and each change of the tools are heard, and the answer that closes it is an end, not a failure',
    async fixture =>
      withPeer(
        fixture,
        { listen: result({}, [ACKNOWLEDGED, CHANGED]) },
        {},
        async (peer, transport) => {
          const listen = listenOf(transport)
          ok(await transport.discover(), 'discover')
          const events: ListenEvent[] = []
          assert.deepStrictEqual(await listen(TOOLS, never, event => events.push(event)), {
            kind: 'ended',
          })
          assert.deepStrictEqual(events, [
            { kind: 'acknowledged', agreed: { toolsListChanged: true } },
            { kind: 'tools-changed' },
          ])
          const [request] = requests(await peer.received(), 'subscriptions/listen')
          assert.deepStrictEqual(at(request?.params, 'notifications'), { toolsListChanged: true })
        },
      ),
  ),
  conformanceCase(
    'T10',
    'long request: a stream that breaks ends it as broken, not as a failure; the connection stays usable and nothing is sent again',
    async fixture =>
      withPeer(
        fixture,
        { listen: STREAM_BREAKS, listing: { '': result({ tools: [TOOL] }) } },
        {},
        async (peer, transport) => {
          const listen = listenOf(transport)
          ok(await transport.discover(), 'discover')
          assert.deepStrictEqual(await listen(TOOLS, never, () => undefined), { kind: 'broken' })
          ok(await transport.listActions(), 'the listing after the broken stream')
          const received = await peer.received()
          assert.strictEqual(requests(received, 'subscriptions/listen').length, 1)
          assert.deepStrictEqual(requests(received, 'tools/call'), [])
        },
      ),
  ),
  conformanceCase(
    'T10',
    'long request: past the bound of the connection one more is not sent, and each one open ends as stopped when its caller stops it',
    async fixture =>
      withPeer(fixture, { listen: SILENT }, {}, async (peer, transport) => {
        const listen = listenOf(transport)
        ok(await transport.discover(), 'discover')
        const open: Readonly<{ stop: AbortController; end: Promise<ListenEnd> }>[] = []
        let refused: ListenEnd | undefined
        while (refused === undefined && open.length < 16) {
          const stop = new AbortController()
          const end = listen(TOOLS, stop.signal, () => undefined)
          const sent = untilListens(peer, open.length + 1).then(() => undefined)
          const first = await Promise.race([end, sent])
          if (first === undefined) open.push({ stop, end })
          else refused = first
        }
        assert.ok(open.length > 0, 'no long request was sent')
        assert.deepStrictEqual(refused, REFUSED)
        assert.strictEqual(
          requests(await peer.received(), 'subscriptions/listen').length,
          open.length,
        )
        for (const { stop } of open) stop.abort()
        for (const { end } of open) assert.deepStrictEqual(await end, { kind: 'stopped' })
      }),
  ),
]

export function mcpTransportConformance(): readonly Case[] {
  return [
    ...tableCases(),
    ...t1Cases(),
    ...t2Cases(),
    ...t3Cases(),
    ...t4Cases(),
    ...t5Cases(),
    ...t6Cases(),
    ...t9Cases(),
    ...t10Cases(),
  ]
}
