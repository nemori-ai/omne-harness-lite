// @module-tag slow
// Every case opens a real SQLite storage with its worker threads.
import { afterEach, describe, expect, it } from 'vitest'
import { fakeChannel } from '@omne-harness/notification/testing'
import {
  AGENT_POSTS,
  createNotificationLocalApplication,
  IN_APP,
  NotificationPolicyError,
} from '@omne-harness/notification-local'
import type { RecipientRef } from '@omne-harness/notification-contract'
import {
  builds,
  MINUTE,
  openApplication,
  owner,
  policy,
  request,
  T1,
  T2,
  type Opened,
} from './fixture.ts'
import { openSqlWorld } from './storage/world.ts'

const person: RecipientRef = { kind: 'person' }
const unavailable = { kind: 'basis-unavailable' }
const opened: Opened[] = []
const open = async (...args: Parameters<typeof openApplication>) => {
  const app = await openApplication(...args)
  opened.push(app)
  return app
}
afterEach(async () => {
  for (const app of opened.splice(0)) {
    await app.application.close()
    await app.world.close().catch(() => {})
  }
})
const titles = async (app: Opened, tenant = T1) => {
  const page = await app.application.inbox.list(owner(tenant), {
    recipient: person,
    filter: 'all',
    after: null,
    limit: 50,
  })
  if (page.kind !== 'done') throw new Error(page.kind)
  return page.value.entries.map(entry => entry.title)
}
const settled = async (app: Opened) => {
  await app.application.scan()
}

describe('loading', () => {
  it.each([
    ['nothing', undefined],
    ['a missing value', { ...policy(), listLimit: undefined }],
    ['an unknown value', { ...policy(), extra: 1 }],
    ['a body limit above the ceiling', policy({ bodyLength: 1_000_000 })],
    [
      'an empty beat range',
      policy({ beat: { defaultMinutes: null, minMinutes: 10, maxMinutes: 5 } }),
    ],
    [
      'a default beat outside the range',
      policy({ beat: { defaultMinutes: 2, minMinutes: 5, maxMinutes: 60 } }),
    ],
    ['no retry attempts', policy({ retry: { maxAttempts: 0, backoffMs: [] } })],
    [
      'an invalid channel name',
      { ...policy(), recipients: { person: { channel: 'In App', minLevel: 'weak' }, agent: null } },
    ],
  ])('refuses %s as the policy', async (_case, bad) => {
    const world = await openSqlWorld()
    const app = await open({ world })
    await expect(
      createNotificationLocalApplication({ ...app.local, policy: bad }),
    ).rejects.toBeInstanceOf(NotificationPolicyError)
  })
})

describe('on real storage', () => {
  it('accepts, pushes through the channel, lists, disposes, and tells the observers each time', async () => {
    const app = await open()
    const sent = await app.application.sending.send(owner(), request('b1'))
    expect(sent).toMatchObject({ kind: 'done', recalled: false, value: { recipients: [person] } })
    await settled(app)
    expect(app.probe.deliveries).toMatchObject([
      { tenant: T1, recipient: person, unit: { kind: 'strong', body: { kind: 'single' } } },
    ])
    expect(await titles(app)).toEqual(['Build b1 failed'])
    const identity = request('b1').identity as never
    const done = await app.application.inbox.mark(owner(), { recipient: person, identity }, 'done')
    expect(done).toMatchObject({ kind: 'done', recalled: false })
    expect(
      app.changes.filter(change => (change as { kind: string }).kind === 'inbox').length,
    ).toBeGreaterThanOrEqual(2)
    expect(app.reported).toEqual([])
  })

  it('keeps two tenants apart', async () => {
    const app = await open({ tenants: [T1, T2] })
    await app.application.sending.send(owner(T1), request('only-t1'))
    expect(await titles(app, T1)).toEqual(['Build only-t1 failed'])
    expect(await titles(app, T2)).toEqual([])
    const identity = request('only-t1').identity as never
    expect(await app.application.inbox.read(owner(T2), { recipient: person, identity })).toEqual({
      kind: 'refused',
      reason: 'not-found',
    })
    expect(
      await app.application.sending.querySend(owner(T2), request('only-t1', T2).identity),
    ).toMatchObject({
      value: { kind: 'not-submitted' },
    })
  })

  it('stays unknown when the commit was written but its answer was lost, and recalls by the same identity', async () => {
    let lose = false
    const world = await openSqlWorld({
      wrap: storage => ({
        ...storage,
        async commit(input, options) {
          const result = await storage.commit(input, options)
          if (!lose || input.identity.operation !== 'notification.accept') return result
          lose = false
          return { kind: 'unknown', identity: input.identity, diagnostic: 'answer lost' }
        },
      }),
    })
    const app = await open({ world })
    lose = true
    expect(await app.application.sending.send(owner(), request('b1'))).toEqual({ kind: 'unknown' })
    expect(await app.application.sending.send(owner(), request('b1'))).toMatchObject({
      kind: 'done',
      recalled: true,
    })
    expect(await titles(app)).toEqual(['Build b1 failed'])
  })

  it('answers basis-unavailable for a tenant that has no storage domain', async () => {
    const world = await openSqlWorld()
    const app = await open({ world })
    const unbound = await createNotificationLocalApplication({
      ...app.local,
      sql: { ...app.local.sql, bind: async () => null },
    })
    unbound.sources.register(builds)
    expect(await unbound.sending.send(owner(), request('b1'))).toEqual(unavailable)
    await unbound.close()
  })
})

describe('the builtin source, channel and standing items', () => {
  it('come through the same registries as anybody else', async () => {
    const app = await open({ channel: null })
    const sources = await app.application.catalog.sources(owner())
    expect(sources.kind === 'done' && sources.value.map(entry => entry.name)).toEqual([
      'agent.posts',
      'notification.system',
      'demo.builds',
    ])
    const channels = await app.application.catalog.channels(owner())
    expect(channels.kind === 'done' && channels.value.map(entry => entry.name)).toEqual([IN_APP])
    expect(() => app.application.sources.register(AGENT_POSTS)).toThrow(/already registered/)
    expect(() => app.application.channels.register(fakeChannel('in-app'))).toThrow(
      /already registered/,
    )
  })

  it('lets an agent post reach the person through the in-app channel', async () => {
    const app = await open({ channel: null })
    const post = {
      identity: { tenant: T1, source: 'agent.posts', eventId: 'p1' },
      event: {
        type: 'post',
        subject: 'agent-7',
        at: '2026-11-18T06:00:00.000Z',
        content: { title: '周报', body: '本周三件事。', locator: null },
        replaceKey: 'weekly',
        renotify: false,
        named: [person],
        origin: { emitter: { kind: 'agent', ref: 'agent-7' }, depth: 0 },
      },
    } as const
    expect(await app.application.sending.send(owner(), post)).toMatchObject({ kind: 'done' })
    expect(await titles(app)).toEqual(['周报'])
    expect(app.changes).toContainEqual({ kind: 'inbox', tenant: T1, recipient: null })
  })

  it('tells the observers that the catalogue may have changed', async () => {
    const app = await open()
    app.changes.length = 0
    const undo = app.application.channels.register(fakeChannel('mail'))
    undo()
    expect(app.changes).toEqual([{ kind: 'catalog' }, { kind: 'catalog' }])
  })

  it('publishes a blocked destination as a standing item of its own, since when it is blocked', async () => {
    const app = await open()
    expect(await app.application.blocked(T1)).toEqual({ kind: 'ok', items: [] })
    app.probe.answer({ kind: 'failed', reason: 'gone', retryable: false })
    await app.application.sending.send(owner(), request('b1'))
    await settled(app)
    const blocked = await app.application.blocked(T1)
    expect(blocked).toMatchObject({
      kind: 'ok',
      items: [
        {
          source: 'notification.system',
          type: 'delivery-blocked',
          since: '2026-11-18T06:01:00.000Z',
        },
      ],
    })
    expect(await app.application.blocked(T2)).toEqual({ kind: 'ok', items: [] })
    const unbound = await createNotificationLocalApplication({
      ...app.local,
      sql: { ...app.local.sql, bind: async () => null },
    })
    expect(await unbound.blocked(T1)).toEqual({ kind: 'unknown' })
    await unbound.close()
  })
})

describe('wake-ups', () => {
  it('asks for a timer at the retry instant and delivers the same unit when it fires', async () => {
    const app = await open()
    app.probe.answer({ kind: 'unknown' })
    await app.application.sending.send(owner(), request('b1'))
    await settled(app)
    expect([...app.manual.pending.values()].map(timer => timer.delayMs)).toContain(MINUTE)
    app.clock.advance(MINUTE)
    app.manual.fire(MINUTE)
    await settled(app)
    expect(app.probe.deliveries).toHaveLength(2)
    expect(app.probe.deliveries[1]?.unit).toEqual(app.probe.deliveries[0]?.unit)
  })

  it('makes up a lost wake-up at the next scan', async () => {
    const app = await open()
    app.probe.answer({ kind: 'unknown' })
    await app.application.sending.send(owner(), request('b1'))
    await settled(app)
    app.manual.pending.clear()
    app.clock.advance(MINUTE)
    await app.application.scan()
    expect(app.probe.deliveries).toHaveLength(2)
  })

  it('scans when it starts, so what was due before a restart is delivered', async () => {
    const first = await open({ channel: null })
    await first.world.store.accept(T1, {
      request: { ...request('b1'), identity: { ...request('b1').identity } } as never,
      type: { defaults: { person: 'strong', agent: 'off' }, external: false },
      defaults: policy().recipients,
      now: '2026-11-18T06:00:30.000Z' as never,
    })
    const before = await first.world.store.pendingStrong(T1, { recipient: person, id: 'default' })
    expect(before.kind === 'read' && before.value).toHaveLength(1)
    await first.application.close()
    const second = await open({ world: first.world, channel: null })
    const after = await second.world.store.pendingStrong(T1, { recipient: person, id: 'default' })
    expect(after.kind === 'read' && after.value).toEqual([])
    expect(await titles(second)).toEqual(['Build b1 failed'])
  })

  it('scans nothing while the tenants are not known', async () => {
    const app = await open({ tenants: null })
    await app.application.sending.send(owner(), request('b1'))
    app.probe.deliveries.length = 0
    await app.application.scan()
    expect(app.probe.deliveries).toEqual([])
  })
})

describe('withdrawing', () => {
  it('stops admitting, lets a delivery in flight end, then withdraws registrations and timers, and keeps the facts', async () => {
    const app = await open()
    let release: (() => void) | undefined
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    const deliver = app.probe.deliver
    Object.assign(app.probe, {
      deliver: async (delivery: Parameters<typeof deliver>[0]) => {
        await gate
        return deliver(delivery)
      },
    })
    await app.application.sending.send(owner(), request('b1'))
    let closed = false
    const closing = app.application.close().then(() => {
      closed = true
    })
    expect(await app.application.sending.send(owner(), request('b2'))).toEqual(unavailable)
    expect(
      await app.application.inbox.list(owner(), {
        recipient: person,
        filter: 'all',
        after: null,
        limit: 5,
      }),
    ).toEqual(unavailable)
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(closed).toBe(false)
    release?.()
    await closing
    expect(app.probe.deliveries).toHaveLength(1)
    expect(app.application.sources.lookup(AGENT_POSTS.name)).toEqual({ kind: 'absent' })
    expect(app.application.channels.lookup(IN_APP)).toEqual({ kind: 'absent' })
    expect(app.manual.pending.size).toBe(0)
    await app.application.close()

    const again = await open({ world: app.world })
    expect(await titles(again)).toEqual(['Build b1 failed'])
    const due = await again.world.store.delivery(T1, '2026-11-19T00:00:00.000Z' as never)
    expect(due.kind === 'read' && due.value.due).toEqual([])
  })
})
