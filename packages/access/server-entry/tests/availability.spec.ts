// The built-in `access/v1` and its observation `availability` (#1249 block 2, C7 and C8). C7's
// first three cases carry the names of RFC-0015 §15「精化对照」I-6; each was first seen red against
// the defect of that table. The frame source is driven directly where the case is about its queue,
// and through the whole entry where it is about the wire.
import { connect } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import type { AvailabilityFrame } from '@omne-harness/public-contract'
import { accessContribution, availabilitySource } from '../src/availability/availability.ts'
import { createAccessRegistry, type AccessRegistry } from '../src/registry/registry.ts'
import type { SseClient } from './support/harness.ts'
import { openSse } from './support/harness.ts'
import {
  PROOF,
  observe,
  startAccessFixture,
  turn,
  type AccessFixture,
} from './support/pipeline-kit.ts'
import { notesContribution } from './support/test-contribution.ts'

type View = { revision: number; protocols: Set<string> }
type Key = { readonly name: string; readonly major: number }

const text = (key: Key): string => `${key.name}/v${key.major}`

/** Applies one frame the way a client does: a change must sit on the revision before it. */
function apply(view: View | undefined, frame: AvailabilityFrame): View {
  if (frame.kind === 'snapshot')
    return { revision: frame.revision, protocols: new Set(frame.protocols.map(text)) }
  if (view === undefined) throw new Error('a change frame before any snapshot')
  if (frame.revision !== view.revision + 1)
    throw new Error(`a change frame on base ${frame.revision - 1}, the view is at ${view.revision}`)
  const protocols = new Set(view.protocols)
  for (const key of frame.added) protocols.add(text(key))
  for (const key of frame.removed) protocols.delete(text(key))
  return { revision: frame.revision, protocols }
}

/** The registry as it is now, read the same way the frame source reads it. */
function registryView(registry: AccessRegistry): View {
  const subscription = registry.subscribe(() => {})
  subscription.unsubscribe()
  return {
    revision: subscription.revision,
    protocols: new Set(subscription.protocols.map(text)),
  }
}

/** A registry with `access/v1` mounted first, as the entry has it. */
function entryRegistry(backlog: number): AccessRegistry {
  const registry = createAccessRegistry()
  registry.mount(accessContribution(registry, backlog))
  return registry
}

type Subscriber = {
  readonly frames: AvailabilityFrame[]
  /** Takes every frame the source has ready now; does not wait for a change to come. */
  readonly read: () => Promise<View | undefined>
  /** Ends the observation the way the hub does: abort, then return. */
  readonly close: () => Promise<void>
}

/** Calls the frame source now: the subscription happens in this synchronous step. */
function open(registry: AccessRegistry, backlog: number) {
  const controller = new AbortController()
  const opened = availabilitySource(registry, backlog)(
    { principal: undefined as never, messageId: 'm-1', signal: controller.signal },
    {},
  )
  return { opened, controller }
}

async function subscriber({ opened, controller }: ReturnType<typeof open>): Promise<Subscriber> {
  const result = await opened
  if (result.outcome !== 'succeeded') throw new Error(`availability answered ${result.outcome}`)
  const generator = result.frames
  const frames: AvailabilityFrame[] = []
  let view: View | undefined
  let pending: ReturnType<typeof generator.next> | undefined
  const read = async (): Promise<View | undefined> => {
    for (;;) {
      pending ??= generator.next()
      const next = await Promise.race([pending, turn().then(() => 'none' as const)])
      if (next === 'none') return view
      pending = undefined
      if (next.done === true) return view
      frames.push(next.value)
      view = apply(view, next.value)
    }
  }
  const close = async (): Promise<void> => {
    controller.abort()
    await generator.return('unavailable')
  }
  return { frames, read, close }
}

describe('C7: availability is a projection of the registry', () => {
  it('订阅的同时挂上一个协议，订阅者最终的集合里有它', async () => {
    const registry = entryRegistry(4)
    const opened = open(registry, 4)
    registry.mount(notesContribution('first'))
    const a = await subscriber(opened)
    expect(await a.read()).toEqual(registryView(registry))
    expect(registryView(registry).protocols).toEqual(new Set(['access/v1', 'notes/v1']))
    await a.close()
  })

  it('订阅者不读、登记表连续变化超过积压上限，恢复读取后得到一帧快照，集合等于登记表', async () => {
    const registry = entryRegistry(4)
    const a = await subscriber(open(registry, 4))
    await a.read()
    expect(a.frames.map(frame => frame.kind)).toEqual(['snapshot'])
    // Five changes, one past the backlog, while the subscriber reads nothing.
    for (let major = 1; major <= 5; major += 1) registry.mount(notesContribution('n', major))
    expect(await a.read()).toEqual(registryView(registry))
    expect(a.frames.map(frame => frame.kind)).toEqual(['snapshot', 'snapshot'])
    // Within the backlog, the changes come one by one.
    registry.mount(notesContribution('n', 6))
    expect(await a.read()).toEqual(registryView(registry))
    expect(a.frames.at(-1)).toEqual({
      kind: 'change',
      revision: registryView(registry).revision,
      added: [{ name: 'notes', major: 6 }],
      removed: [],
    })
    await a.close()
  })

  it('断线期间登记表变化，重新订阅后第一帧是快照，集合等于登记表', async () => {
    const registry = entryRegistry(4)
    const first = await subscriber(open(registry, 4))
    await first.read()
    await first.close()
    const takeDown = registry.mount(notesContribution('first'))
    registry.mount(notesContribution('second', 2))
    void takeDown()
    const again = await subscriber(open(registry, 4))
    await again.read()
    registry.mount(notesContribution('third', 3))
    expect(await again.read()).toEqual(registryView(registry))
    expect(again.frames.map(frame => frame.kind)).toEqual(['snapshot', 'change'])
    expect(again.frames[0]).toEqual({
      kind: 'snapshot',
      revision: 4,
      protocols: [
        { name: 'access', major: 1 },
        { name: 'notes', major: 2 },
      ],
    })
    await again.close()
  })

  it('stops listening to the registry when the observation ends', async () => {
    const registry = entryRegistry(4)
    const opening = open(registry, 4)
    const a = await subscriber(opening)
    await a.read()
    opening.controller.abort()
    expect(await a.read()).toEqual(apply(undefined, a.frames[0]!))
    registry.mount(notesContribution('after'))
    expect(await a.read()).toEqual(apply(undefined, a.frames[0]!))
    expect(a.frames).toHaveLength(1)
  })
})

const fixtures: AccessFixture[] = []
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map(fixture => fixture.stop()))
})

async function entry(options?: Parameters<typeof startAccessFixture>[0]): Promise<AccessFixture> {
  const fixture = await startAccessFixture(options)
  fixtures.push(fixture)
  return fixture
}

const AVAILABILITY = '/api/access/v1/availability'

function watchAvailability(port: number, authorization?: string): SseClient {
  return openSse(port, '{}', {
    path: AVAILABILITY,
    headers: {
      'omne-message-id': 'm-1',
      ...(authorization === undefined ? {} : { authorization }),
    },
  })
}

/** The raw bytes of the first `count` events of a stream, heartbeats left out. */
function eventText(client: SseClient, count: number): string {
  return client.chunks
    .join('')
    .split('\n\n')
    .filter(event => event.startsWith('data: '))
    .slice(0, count)
    .join('\n\n')
}

describe('C7 and C8: availability at the entry', () => {
  it('is mounted while the entry runs and taken down last when it stops', async () => {
    const fixture = await entry()
    expect(registryView(fixture.log.registry).protocols).toEqual(new Set(['notes/v1', 'access/v1']))
    await fixture.stop()
    expect(registryView(fixture.log.registry).protocols).toEqual(new Set(['notes/v1']))
  })

  it('gives every caller the same bytes: without a login, with a valid one and with an invalid one', async () => {
    const fixture = await entry()
    const clients = [
      watchAvailability(fixture.port),
      watchAvailability(fixture.port, `Bearer ${PROOF}`),
      watchAvailability(fixture.port, 'Bearer not-a-proof'),
    ]
    for (const client of clients) await client.waitForEvents(1)
    fixture.log.registry.mount(notesContribution('second', 2))
    for (const client of clients) await client.waitForEvents(2)
    const texts = clients.map(client => eventText(client, 2))
    expect(new Set(texts).size).toBe(1)
    expect(clients[0]!.events()).toEqual([
      {
        kind: 'frame',
        frame: {
          kind: 'snapshot',
          revision: 2,
          protocols: [
            { name: 'notes', major: 1 },
            { name: 'access', major: 1 },
          ],
        },
      },
      {
        kind: 'frame',
        frame: { kind: 'change', revision: 3, added: [{ name: 'notes', major: 2 }], removed: [] },
      },
    ])
    expect(fixture.accessIdentity.calls).toEqual([])
    for (const client of clients) client.close()
  })

  it('asks the identity port only for an observation whose contract says login', async () => {
    const fixture = await entry({
      config: { observation: { perLogin: 1, perInstance: 8, cancelRetentionMs: 0 } },
    })
    // `identity: 'none'` asks nothing and does not count against the login it carries.
    const anonymous = observe(fixture.port, 'watch-all', { body: '{}' })
    expect(await anonymous.status).toBe(200)
    expect(fixture.accessIdentity.calls).toEqual([])
    const signed = observe(fixture.port, 'watch-note')
    expect(await signed.status).toBe(200)
    expect(fixture.accessIdentity.calls.map(call => call.method)).toContain('identifyLogin')
    for (const client of [anonymous, signed]) client.close()
  })

  it('collapses what a subscriber that reads nothing missed into a snapshot, and never meets the byte bound', async () => {
    const fixture = await entry({ availabilityBacklog: 4, frameQueueBytes: 64 * 1024 })
    const received: string[] = []
    const socket = connect({ host: '127.0.0.1', port: fixture.port }, () => {
      socket.write(
        [
          `POST ${AVAILABILITY} HTTP/1.1`,
          'Host: 127.0.0.1',
          'omne-message-id: m-1',
          'content-type: application/json',
          'content-length: 2',
          '',
          '{}',
        ].join('\r\n'),
      )
    })
    socket.setEncoding('utf8')
    socket.on('data', chunk => received.push(String(chunk)))
    socket.on('error', () => {})
    let closed = false
    socket.on('close', () => {
      closed = true
    })
    while (!received.join('').includes('"snapshot"')) await turn()
    socket.pause()
    // Far more change frames than a socket buffer holds, while the observer reads nothing. One
    // change a turn: the hub could take each as it comes, so only the pace keeps them back.
    const registry = fixture.log.registry
    let takeDown: (() => Promise<void>) | undefined
    for (let round = 0; round < 40_000; round += 1) {
      if (takeDown === undefined) takeDown = registry.mount(notesContribution('n', 2))
      else {
        void takeDown()
        takeDown = undefined
      }
      await turn()
    }
    socket.resume()
    const target = registryView(registry)
    let view: View | undefined
    let snapshots = 0
    while (!closed && (view === undefined || view.revision !== target.revision)) {
      await turn()
      const events = received.join('').split('\n\n')
      view = undefined
      snapshots = 0
      for (const event of events.slice(0, -1)) {
        if (!event.includes('data: ')) continue
        const data = JSON.parse(event.slice(event.indexOf('data: ') + 6)) as {
          kind: string
          frame: AvailabilityFrame
        }
        if (data.kind !== 'frame') throw new Error(`the observation ended: ${event}`)
        if (data.frame.kind === 'snapshot') snapshots += 1
        view = apply(view, data.frame)
      }
    }
    expect(fixture.diagnostics.map(event => event.code)).not.toContain('access.frame-queue-full')
    expect(closed).toBe(false)
    expect(view).toEqual(target)
    expect(snapshots).toBeGreaterThan(1)
    socket.destroy()
  })
})
