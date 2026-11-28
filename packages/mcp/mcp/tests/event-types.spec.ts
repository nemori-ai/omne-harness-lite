import { describe, expect, it } from 'vitest'
import type { EventCatalogRecord } from '@omne-harness/mcp-contract'
import {
  createMemoryCatalogStore,
  endpointRefOf,
  jsonOf,
  peerIdentityOf,
} from '@omne-harness/mcp-contract/testing'
import { createMcp } from '../src/index.ts'
import { alice, mallory } from './doubles/identities.ts'
import type { Step } from './doubles/scripted-transport.ts'
import { adoptHttp, page, world } from './doubles/world.ts'

const desk = endpointRefOf('desk')
const offering = {
  ...peerIdentityOf(),
  capabilities: jsonOf({ tools: {}, extensions: { 'io.modelcontextprotocol/events': {} } }),
}
const typeOf = (name: string, delivery: readonly string[] = ['poll', 'push']) =>
  jsonOf({
    name,
    description: `${name} happened`,
    delivery,
    inputSchema: { type: 'object' },
    payloadSchema: { type: 'object' },
  })

function eventWorld(script: readonly Step[]) {
  const w = world({ script })
  const eventStore = createMemoryCatalogStore<EventCatalogRecord>()
  const mcp = createMcp({ ...w.ports, eventStore }, w.config)
  adoptHttp(w, desk, { auth: 'none' })
  return { w, mcp, eventStore }
}

describe('the event types of a peer (C301)', () => {
  it('a peer that offers events has its types taken whole, across pages, with the catalog of actions; unreadable ones are left out', async () => {
    const { w, mcp } = eventWorld([
      { discover: offering },
      { listActions: page(['read']) },
      { listEventTypes: { events: [typeOf('incident.created')], nextCursor: 'p2' } },
      {
        listEventTypes: { events: [typeOf('incident.closed', ['webhook']), jsonOf({ name: 'x' })] },
      },
    ])
    expect(await mcp.discovery.eventTypes(alice, desk)).toEqual({ ok: { kind: 'not-acquired' } })
    expect(await mcp.discovery.refresh(alice, { ref: desk })).toMatchObject({
      ok: { kind: 'published' },
    })
    const view = await mcp.discovery.eventTypes(alice, desk)
    expect(view).toMatchObject({ ok: { kind: 'acquired', revision: 1 } })
    if (!('ok' in view) || view.ok.kind !== 'acquired') throw new Error('not acquired')
    expect(view.ok.types.map(type => [type.name, type.delivery])).toEqual([
      ['incident.created', ['poll', 'push']],
      ['incident.closed', ['webhook']],
    ])
    expect(w.transports.calls.filter(call => call.kind === 'listEventTypes')).toMatchObject([
      { cursor: undefined },
      { cursor: 'p2' },
    ])
  })

  it('a peer that does not offer events is told as such, and is not asked', async () => {
    const { w, mcp } = eventWorld([{ discover: peerIdentityOf() }, { listActions: page(['read']) }])
    await mcp.discovery.refresh(alice, { ref: desk })
    expect(await mcp.discovery.eventTypes(alice, desk)).toMatchObject({
      ok: { kind: 'not-declared' },
    })
    expect(w.transports.calls.some(call => call.kind === 'listEventTypes')).toBe(false)
  })

  it('an older peer with the extension is not asked either', async () => {
    const legacy = {
      ...offering,
      ...peerIdentityOf('2025-11-25'),
      capabilities: offering.capabilities,
    }
    const { mcp } = eventWorld([{ discover: legacy }, { listActions: page(['read']) }])
    await mcp.discovery.refresh(alice, { ref: desk })
    expect(await mcp.discovery.eventTypes(alice, desk)).toMatchObject({
      ok: { kind: 'not-declared' },
    })
  })

  it('a listing that fails keeps the types taken before; none taken yet stays not acquired, not empty', async () => {
    const { mcp } = eventWorld([
      { discover: offering },
      { listActions: page(['read']) },
      { listEventTypes: { kind: 'no-answer', cause: 'abandoned' } },
    ])
    await mcp.discovery.refresh(alice, { ref: desk })
    expect(await mcp.discovery.eventTypes(alice, desk)).toEqual({ ok: { kind: 'not-acquired' } })
  })

  it('the event types are read with the same admission as the actions; a store that cannot be read is unknown', async () => {
    const { mcp, eventStore } = eventWorld([
      { discover: offering },
      { listActions: page(['read']) },
      { listEventTypes: { events: [typeOf('incident.created')] } },
    ])
    await mcp.discovery.refresh(alice, { ref: desk })
    expect(await mcp.discovery.eventTypes(mallory, desk)).toEqual({
      failure: { kind: 'not-available-to-you' },
    })
    eventStore.setUnavailable(true)
    expect(await mcp.discovery.eventTypes(alice, desk)).toEqual({ failure: { kind: 'unknown' } })
  })
})
