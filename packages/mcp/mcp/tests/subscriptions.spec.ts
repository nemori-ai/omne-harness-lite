import { afterEach, describe, expect, it } from 'vitest'
import type { SubscriptionKey } from '@omne-harness/mcp-contract/provider'
import { createMemoryEventRecords, jsonOf, millisOf } from '@omne-harness/mcp-contract/testing'
import { alice, home } from './doubles/identities.ts'
import { desk, eventOf, eventWorld, offering, settle, typeOf } from './doubles/events.ts'
import type { Step } from './doubles/scripted-transport.ts'

type World = ReturnType<typeof eventWorld>

const opened: World[] = []
afterEach(async () => {
  await Promise.all(opened.splice(0).map(each => each.services.connections.closeAll()))
})

const created = { name: 'incident.created', arguments: jsonOf({}), subscriber: 'alice' }
const listed = (...types: ReturnType<typeof typeOf>[]): Step[] => [
  { discover: offering },
  { listEventTypes: { events: types } },
]

function arranged(script: readonly Step[] = listed(typeOf('incident.created'))) {
  const made = eventWorld({ script })
  opened.push(made)
  return made
}

const KEY: SubscriptionKey = {
  tenant: home,
  holding: desk.holding,
  account: { kind: 'anonymous' },
  name: 'incident.created',
  arguments: '{}',
}

async function readIds(made: World) {
  const read = await made.services.subscriptions.read(alice, desk, {
    name: 'incident.created',
    arguments: jsonOf({}),
    after: 0,
    limit: 50,
  })
  if (!('ok' in read)) throw new Error(`not read: ${JSON.stringify(read)}`)
  return read.ok.items.map(item => (item.kind === 'event' ? item.eventId : `gap:${item.reason}`))
}

async function rowOf(made: World) {
  const read = await made.records.read(KEY)
  if (!('ok' in read) || read.ok === 'absent') return read
  return read.ok
}

describe('subscribing chooses how the events come (C302)', () => {
  it('the first subscriber makes the subscription with no position and opens a stream when the peer pushes', async () => {
    const made = arranged()
    expect(await made.services.subscriptions.subscribe(alice, desk, created)).toEqual({
      ok: {
        name: 'incident.created',
        arguments: jsonOf({}),
        delivery: 'push',
        state: 'receiving',
        reason: null,
        subscribers: 1,
      },
    })
    await settle()
    expect(made.streams.map(stream => stream.request)).toEqual([
      { name: 'incident.created', arguments: jsonOf({}), cursor: null, headers: {} },
    ])
    expect(await rowOf(made)).toMatchObject({ cursor: null, subscribers: ['alice'], revision: 1 })
  })

  it('a type the peer only lets be polled is polled', async () => {
    const made = arranged(listed(typeOf('incident.created', ['poll', 'webhook'])))
    const subscribed = await made.services.subscriptions.subscribe(alice, desk, created)
    expect(subscribed).toMatchObject({ ok: { delivery: 'poll' } })
    await settle()
    expect(made.polls).toHaveLength(1)
    expect(made.streams).toHaveLength(0)
  })

  it('a type the peer only sends to a webhook cannot be subscribed, nor one it does not list, nor any of a peer with no events', async () => {
    const webhook = arranged(listed(typeOf('incident.created', ['webhook'])))
    expect(await webhook.services.subscriptions.subscribe(alice, desk, created)).toEqual({
      failure: { kind: 'not-subscribable', reason: 'webhook-only' },
    })
    const other = arranged(listed(typeOf('incident.closed')))
    expect(await other.services.subscriptions.subscribe(alice, desk, created)).toEqual({
      failure: { kind: 'not-subscribable', reason: 'no-such-type' },
    })
    const none = arranged([{ discover: { ...offering, capabilities: jsonOf({ tools: {} }) } }])
    expect(await none.services.subscriptions.subscribe(alice, desk, created)).toEqual({
      failure: { kind: 'not-subscribable', reason: 'no-events' },
    })
    expect(webhook.records.list(home)).resolves.toEqual({ ok: [] })
  })

  it('arguments are one subscription whatever order their members come in; a marked one goes in a header', async () => {
    const schema = {
      type: 'object',
      properties: { queue: { type: 'string', 'x-mcp-header': 'Queue' } },
    }
    const made = arranged(listed(typeOf('incident.created', ['push'], schema)))
    const given = { ...created, arguments: jsonOf({ queue: 'ops', level: 2 }) }
    await made.services.subscriptions.subscribe(alice, desk, given)
    const again = { ...created, arguments: jsonOf({ level: 2, queue: 'ops' }), subscriber: 'bob' }
    expect(await made.services.subscriptions.subscribe(alice, desk, again)).toMatchObject({
      ok: { subscribers: 2 },
    })
    await settle()
    expect(made.streams).toHaveLength(1)
    expect(made.streams[0]?.request.headers).toEqual({ 'mcp-param-queue': 'ops' })
  })
})

describe('a subscription being received (C302, C303, I12, I13)', () => {
  it('events are stored once each, with the position after them, and the endpoint is told its events changed', async () => {
    const made = arranged()
    const heard: string[] = []
    made.services.status.subscribe({
      changed: (_tenant, about) => heard.push(about),
      closed: () => undefined,
    })
    await made.services.subscriptions.subscribe(alice, desk, created)
    await settle()
    const stream = made.streams[0]
    stream?.send({ kind: 'active', cursor: 'c0', truncated: false, heartbeatMs: 0 })
    stream?.send({ kind: 'event', event: eventOf('a'), cursor: 'c1' })
    stream?.send({ kind: 'event', event: eventOf('b'), cursor: 'c2' })
    stream?.send({ kind: 'event', event: eventOf('b'), cursor: 'c2' })
    await settle()
    expect(await readIds(made)).toEqual(['a', 'b'])
    expect(await rowOf(made)).toMatchObject({ cursor: 'c2', state: 'receiving' })
    expect(heard.filter(about => about === 'events').length).toBeGreaterThanOrEqual(3)
  })

  it('a broken stream is opened again after a wait, from the position stored', async () => {
    const made = arranged()
    await made.services.subscriptions.subscribe(alice, desk, created)
    await settle()
    made.streams[0]?.send({ kind: 'event', event: eventOf('a'), cursor: 'c1' })
    await settle()
    made.streams[0]?.end({ kind: 'broken' })
    await settle()
    expect(made.pauses.length).toBe(1)
    expect(made.streams.map(stream => stream.request.cursor)).toEqual([null, 'c1'])
    expect(await rowOf(made)).toMatchObject({ state: 'receiving' })
  })

  it('an event the storage could not take is not passed over: the stream opens again where the storage stands, and the event sent again is kept once', async () => {
    const made = arranged()
    await made.services.subscriptions.subscribe(alice, desk, created)
    await settle()
    made.streams[0]?.send({ kind: 'event', event: eventOf('a'), cursor: 'c1' })
    await settle()
    made.records.setUnavailable(true)
    made.streams[0]?.send({ kind: 'event', event: eventOf('b'), cursor: 'c2' })
    await settle()
    expect(made.streams[0]?.signal.aborted).toBe(true)
    made.records.setUnavailable(false)
    await settle()
    const second = made.streams[1]
    expect(second?.request.cursor).toBe('c1')
    second?.send({ kind: 'event', event: eventOf('b'), cursor: 'c2' })
    second?.send({ kind: 'event', event: eventOf('a'), cursor: 'c1' })
    await settle()
    expect(await readIds(made)).toEqual(['a', 'b'])
  })

  it('a batch the storage took but answered not known for is taken as not known: the stream opens again where the storage stands, and nothing is kept twice', async () => {
    const records = createMemoryEventRecords()
    let blur = false
    const made = eventWorld({
      script: listed(typeOf('incident.created')),
      records: {
        ...records,
        async receive(key, batch, bounds) {
          const done = await records.receive(key, batch, bounds)
          if (!blur) return done
          blur = false
          return { failure: 'unknown' }
        },
      },
    })
    opened.push(made)
    await made.services.subscriptions.subscribe(alice, desk, created)
    await settle()
    made.streams[0]?.send({ kind: 'event', event: eventOf('a'), cursor: 'c1' })
    await settle()
    blur = true
    made.streams[0]?.send({ kind: 'event', event: eventOf('b'), cursor: 'c2' })
    await settle()
    expect(made.streams[0]?.signal.aborted).toBe(true)
    const second = made.streams[1]
    expect(second?.request.cursor).toBe('c2')
    second?.send({ kind: 'event', event: eventOf('b'), cursor: 'c2' })
    second?.send({ kind: 'event', event: eventOf('c'), cursor: 'c3' })
    await settle()
    expect(await readIds(made)).toEqual(['a', 'b', 'c'])
  })

  it('three heartbeats with nothing heard and the stream is taken as dead and opened again', async () => {
    const made = arranged()
    await made.services.subscriptions.subscribe(alice, desk, created)
    await settle()
    made.streams[0]?.send({ kind: 'active', cursor: 'c0', truncated: false, heartbeatMs: 1000 })
    await settle()
    const watch = made.waits.at(-1)
    expect(watch?.ms).toBe(3000)
    made.streams[0]?.send({ kind: 'heartbeat', cursor: 'c0' })
    await settle()
    expect(watch?.signal.aborted).toBe(true)
    made.waits.at(-1)?.fire()
    await settle()
    expect(made.streams[0]?.signal.aborted).toBe(true)
    expect(made.streams.map(stream => stream.request.cursor)).toEqual([null, 'c0'])
  })

  it('a poll asks again after the wait the peer gives, never under the floor, and at once when there is more', async () => {
    const made = arranged(listed(typeOf('incident.created', ['poll'])))
    await made.services.subscriptions.subscribe(alice, desk, created)
    const page = (cursor: string, events: string[], extra = {}) => ({
      ok: {
        events: events.map(id => eventOf(id)),
        cursor,
        truncated: false,
        hasMore: false,
        nextPollMs: 100,
        ...extra,
      },
    })
    made.answer(page('c1', ['a'], { hasMore: true }))
    made.answer(page('c2', ['b'], { nextPollMs: 2000 }))
    await settle()
    expect(made.polls.map(poll => poll.cursor)).toEqual([null, 'c1'])
    expect(made.waits.map(wait => wait.ms)).toEqual([2000])
    made.waits[0]?.fire()
    made.answer(page('c3', [], { nextPollMs: 10 }))
    await settle()
    expect(made.polls.map(poll => poll.cursor)).toEqual([null, 'c1', 'c2'])
    expect(made.waits.map(wait => wait.ms)).toEqual([2000, 500])
    expect(await readIds(made)).toEqual(['a', 'b'])
    expect(await rowOf(made)).toMatchObject({ cursor: 'c3' })
  })
})

describe('after a restart (C303)', () => {
  it('a subscription is taken up again at its next read, from where it stood; what came while omne was down arrives, and once', async () => {
    const first = arranged()
    await first.services.subscriptions.subscribe(alice, desk, created)
    await settle()
    first.streams[0]?.send({ kind: 'event', event: eventOf('a'), cursor: 'c1' })
    await settle()
    await first.services.connections.closeAll()
    const again = eventWorld({
      script: [{ discover: offering }],
      records: first.records,
      eventStore: first.eventStore,
    })
    opened.push(again)
    expect(await readIds(again)).toEqual(['a'])
    await settle()
    const stream = again.streams[0]
    expect(stream?.request.cursor).toBe('c1')
    stream?.send({ kind: 'event', event: eventOf('a'), cursor: 'c1' })
    stream?.send({ kind: 'event', event: eventOf('b'), cursor: 'c2' })
    stream?.send({ kind: 'event', event: eventOf('c'), cursor: 'c3' })
    await settle()
    expect(await readIds(again)).toEqual(['a', 'b', 'c'])
  })
})

describe('missed events, ends and the last subscriber (C304, C305)', () => {
  it('a peer that says it could not start from the position leaves a gap where it happened', async () => {
    const made = arranged()
    await made.services.subscriptions.subscribe(alice, desk, created)
    await settle()
    made.streams[0]?.send({ kind: 'event', event: eventOf('a'), cursor: 'c1' })
    made.streams[0]?.end({ kind: 'broken' })
    await settle()
    made.streams[1]?.send({ kind: 'active', cursor: 'c9', truncated: true, heartbeatMs: 0 })
    made.streams[1]?.send({ kind: 'event', event: eventOf('z'), cursor: 'c10' })
    await settle()
    expect(await readIds(made)).toEqual(['a', 'gap:peer-truncated', 'z'])
    expect(await rowOf(made)).toMatchObject({ cursor: 'c10' })
  })

  it('a type the peer gives no position for is opened again from now, and says some may have been missed', async () => {
    const made = arranged()
    await made.services.subscriptions.subscribe(alice, desk, created)
    await settle()
    made.streams[0]?.send({ kind: 'active', cursor: null, truncated: false, heartbeatMs: 0 })
    made.streams[0]?.send({ kind: 'event', event: eventOf('a'), cursor: null })
    made.streams[0]?.end({ kind: 'broken' })
    await settle()
    expect(made.streams[1]?.request.cursor).toBe(null)
    made.streams[1]?.send({ kind: 'active', cursor: null, truncated: false, heartbeatMs: 0 })
    await settle()
    expect(await readIds(made)).toEqual(['a', 'gap:possibly-missed'])
    expect(await rowOf(made)).toMatchObject({ cursor: null })
  })

  it('a peer that ends the subscription has it ended, and it is not asked for again; refused is not a reason to list the types again', async () => {
    const made = arranged()
    await made.services.subscriptions.subscribe(alice, desk, created)
    await settle()
    made.streams[0]?.send({ kind: 'terminated', code: -32024, data: null })
    await settle()
    expect(await rowOf(made)).toMatchObject({ state: 'terminated', reason: 'refused' })
    expect(made.streams).toHaveLength(1)
    expect(made.w.transports.calls.filter(call => call.kind === 'listEventTypes')).toHaveLength(1)
    expect(await made.services.subscriptions.list(alice, desk)).toMatchObject({
      ok: [{ state: 'terminated', reason: 'refused' }],
    })
    await settle()
    expect(made.streams).toHaveLength(1)
  })

  it('a type gone or changed in shape ends it too, and the types are listed again', async () => {
    for (const [code, reason] of [
      [-32023, 'type-gone'],
      [-32026, 'schema-changed'],
    ] as const) {
      const made = arranged([
        ...listed(typeOf('incident.created')),
        { listEventTypes: { events: [] } },
      ])
      await made.services.subscriptions.subscribe(alice, desk, created)
      await settle()
      made.streams[0]?.send({ kind: 'terminated', code, data: null })
      await settle()
      expect(await rowOf(made)).toMatchObject({ state: 'terminated', reason })
      expect(made.w.transports.calls.filter(call => call.kind === 'listEventTypes')).toHaveLength(2)
    }
  })

  it('a poll the peer refuses for good ends the subscription the same way', async () => {
    const made = arranged(listed(typeOf('incident.created', ['poll'])))
    await made.services.subscriptions.subscribe(alice, desk, created)
    made.answer({ failure: { kind: 'error-answer', code: -32024, message: 'forbidden' } })
    await settle()
    expect(await rowOf(made)).toMatchObject({ state: 'terminated', reason: 'refused' })
    expect(made.polls).toHaveLength(1)
  })

  it('a terminated subscription takes another subscriber and stays as it is', async () => {
    const made = arranged()
    await made.services.subscriptions.subscribe(alice, desk, created)
    await settle()
    made.streams[0]?.send({ kind: 'terminated', code: -32024, data: null })
    await settle()
    const bob = { ...created, subscriber: 'bob' }
    expect(await made.services.subscriptions.subscribe(alice, desk, bob)).toMatchObject({
      ok: { state: 'terminated', subscribers: 2 },
    })
    await settle()
    expect(made.streams).toHaveLength(1)
  })

  it('the stream closes and the subscription goes when its last subscriber leaves, not before', async () => {
    const made = arranged()
    await made.services.subscriptions.subscribe(alice, desk, created)
    await made.services.subscriptions.subscribe(alice, desk, { ...created, subscriber: 'bob' })
    await settle()
    expect(await made.services.subscriptions.unsubscribe(alice, desk, created)).toEqual({
      ok: 'unsubscribed',
    })
    expect(made.streams[0]?.signal.aborted).toBe(false)
    expect(await made.services.subscriptions.unsubscribe(alice, desk, created)).toEqual({
      ok: 'not-subscribed',
    })
    expect(
      await made.services.subscriptions.unsubscribe(alice, desk, { ...created, subscriber: 'bob' }),
    ).toEqual({ ok: 'unsubscribed' })
    expect(made.streams[0]?.signal.aborted).toBe(true)
    expect(await rowOf(made)).toEqual({ ok: 'absent' })
    expect(await made.records.occurrences(KEY, 0, 10)).toEqual({ ok: [] })
  })

  it('a terminated subscription goes with its last subscriber too', async () => {
    const made = arranged()
    await made.services.subscriptions.subscribe(alice, desk, created)
    await settle()
    made.streams[0]?.send({ kind: 'terminated', code: -32024, data: null })
    await settle()
    expect(await made.services.subscriptions.unsubscribe(alice, desk, created)).toEqual({
      ok: 'unsubscribed',
    })
    expect(await rowOf(made)).toEqual({ ok: 'absent' })
  })

  it('a lost connection makes it wait, and it is received again from where it stood when the connection is back', async () => {
    const made = arranged([
      ...listed(typeOf('incident.created')),
      { open: { kind: 'not-sent', cause: 'connection-unavailable' } },
      { discover: offering },
    ])
    await made.services.subscriptions.subscribe(alice, desk, created)
    await settle()
    made.streams[0]?.send({ kind: 'event', event: eventOf('a'), cursor: 'c1' })
    await settle()
    await made.services.connections.release(alice, desk)
    made.streams[0]?.end({ kind: 'broken' })
    await settle()
    await settle()
    expect(made.w.transports.calls.filter(call => call.kind === 'open')).toHaveLength(3)
    expect(made.pauses.length).toBeGreaterThanOrEqual(2)
    expect(made.streams.map(stream => stream.request.cursor)).toEqual([null, 'c1'])
    expect(await rowOf(made)).toMatchObject({ state: 'receiving' })
  })

  it('an endpoint no longer adopted ends its subscriptions', async () => {
    const made = arranged()
    await made.services.subscriptions.subscribe(alice, desk, created)
    await settle()
    made.w.adoption.withdraw(home, desk)
    made.streams[0]?.end({ kind: 'broken' })
    await settle()
    expect(await rowOf(made)).toMatchObject({ state: 'terminated', reason: 'unavailable' })
    expect(made.streams).toHaveLength(1)
  })
})

describe('an endpoint with no connect timeout of its own (C302, C303)', () => {
  it('is connected within the bound the asker gives, on subscribing and on the read that takes it up after a restart', async () => {
    const absent = { connectTimeout: { kind: 'absent' } } as const
    const first = eventWorld({ script: listed(typeOf('incident.created')), settings: absent })
    opened.push(first)
    expect(await first.services.subscriptions.subscribe(alice, desk, created)).toEqual({
      failure: { kind: 'config-missing', item: 'connect-timeout' },
    })
    const bound = millisOf(10_000)
    const subscribed = await first.services.subscriptions.subscribe(alice, desk, {
      ...created,
      connectBound: bound,
    })
    expect(subscribed).toMatchObject({ ok: { delivery: 'push' } })
    await settle()
    first.streams[0]?.send({ kind: 'event', event: eventOf('a'), cursor: 'c1' })
    await settle()
    await first.services.connections.closeAll()
    const again = eventWorld({
      script: [{ discover: offering }],
      records: first.records,
      eventStore: first.eventStore,
      settings: absent,
    })
    opened.push(again)
    const read = await again.services.subscriptions.read(alice, desk, {
      name: 'incident.created',
      arguments: jsonOf({}),
      after: 0,
      limit: 10,
      connectBound: bound,
    })
    expect(read).toMatchObject({ ok: { subscription: { state: 'receiving' } } })
    await settle()
    expect(again.streams.map(stream => stream.request.cursor)).toEqual(['c1'])
  })
})
