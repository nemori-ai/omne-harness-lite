import { describe, expect, it } from 'vitest'
import {
  notificationsExecutor,
  type NotificationCallSource,
} from '@omne-harness/notification-tools'
import { NOW, POSTS, TENANT, agent, author, caller, domain, person, unattached } from './world.ts'

const post = (id: string, more: object = {}) => ({ id, title: `Title ${id}`, ...more })
const changed = { source: 'demo.things', type: 'changed' }

describe('send', () => {
  it('posts to the owner as the calling agent, from the source and at the depth of the call', async () => {
    const d = domain()
    const a = caller(d, 'a1', { causalDepth: () => 2 })
    const sent = await a.ok(
      'send',
      post('p1', { body: 'B', locator: { kind: 'session', ref: 's-1' } }),
    )
    expect(sent).toEqual({
      head: 'done Notifications send',
      value: { id: 'p1', recipients: [person], recalled: false },
    })
    const [entry] = await d.boxOf(person)
    expect(entry).toMatchObject({ source: POSTS.source, type: POSTS.type, title: 'Title p1' })
    const stored = d.store.facts(d.owner.tenant).sends.values().next().value!
    expect(stored.event).toMatchObject({
      subject: 'a1',
      at: NOW,
      named: [person],
      origin: { emitter: agent('a1'), depth: 2 },
      content: { body: 'B', locator: { kind: 'session', ref: 's-1' } },
      replaceKey: null,
      renotify: false,
    })
    expect(stored.identity.tenant).toBe(TENANT)
    expect(await d.boxOf(agent('a1'))).toEqual([])
  })

  it('the same id again is the same post; the same id with other content is a conflict', async () => {
    const d = domain()
    const a = caller(d)
    await a.ok('send', post('p1'))
    expect(await a.ok('send', post('p1'))).toMatchObject({ value: { recalled: true } })
    expect(await d.boxOf(person)).toHaveLength(1)
    const failure = await a.failure('send', post('p1', { title: 'Other' }))
    expect(failure).toEqual({
      kind: 'conflict',
      reason: expect.stringMatching(/^conflict: .*new id/),
    })
    expect(await d.boxOf(person)).toHaveLength(1)
  })

  it('two agents that pick the same id and the same replace key do not meet', async () => {
    const d = domain()
    const one = caller(d, 'a1')
    const two = caller(d, 'a2')
    await one.ok('send', post('daily', { replace: 'report' }))
    expect(
      await two.ok('send', post('daily', { replace: 'report', title: 'Other' })),
    ).toMatchObject({
      value: { recalled: false },
    })
    expect(await d.boxOf(person, 'unresolved')).toHaveLength(2)
    await one.ok('send', post('daily-2', { replace: 'report' }))
    const live = (await d.boxOf(person)).filter(entry => entry.marks.supersededBy === null)
    expect(live.map(entry => entry.title).sort()).toEqual(['Other', 'Title daily-2'])
  })

  it('reaches an agent that subscribed to the poster, and never the poster itself', async () => {
    const d = domain()
    d.consent.set({ kind: 'automatic', generation: 1 })
    const reader = caller(d, 'a2')
    await reader.ok('subscribe', {
      source: POSTS.source,
      type: POSTS.type,
      level: 'strong',
      scope: { kind: 'subject', equals: 'a1' },
    })
    await caller(d, 'a1').ok('subscribe', {
      source: POSTS.source,
      type: POSTS.type,
      level: 'strong',
    })
    expect(await caller(d, 'a1').ok('send', post('p1'))).toMatchObject({
      value: { recipients: [person, agent('a2')] },
    })
  })

  it.each([
    [{ causalDepth: () => 4 }, post('p1'), 'unsupported', /^causal-depth-exceeded: /],
    [{}, post('p1', { body: 'x'.repeat(1001) }), 'too-large', /^too-large: /],
    [
      { posts: { source: 'agent.posts', type: 'nope' } },
      post('p1'),
      'invalid',
      /^unknown-event-type: /,
    ],
    [
      { posts: { source: 'Not A Source', type: 'post' } },
      post('p1'),
      'invalid',
      /^invalid-source-name: /,
    ],
  ] as const)(
    'a post the domain refuses is a failure with its reason',
    async (source, params, kind, reason) => {
      const d = domain()
      const failure = await caller(d, 'a1', source).failure('send', params)
      expect(failure).toEqual({ kind, reason: expect.stringMatching(reason) })
      expect(await d.boxOf(person)).toEqual([])
    },
  )

  it('after an unknown result the same post again is recalled, not posted twice', async () => {
    const d = domain()
    const a = caller(d)
    d.store.fail('unknown-applied')
    const failure = await a.failure('send', post('p1'))
    expect(failure).toEqual({
      kind: 'unknown',
      operation: 'Notifications.send',
      reason: expect.stringContaining('send the same command again'),
    })
    expect(await a.ok('send', post('p1'))).toMatchObject({ value: { recalled: true } })
    expect(await d.boxOf(person)).toHaveLength(1)
    d.store.fail('unknown-lost')
    expect(await a.failure('send', post('p2'))).toMatchObject({ kind: 'unknown' })
    expect(await a.ok('send', post('p2'))).toMatchObject({ value: { recalled: false } })
  })
})

describe('sent', () => {
  it('says whether a post was accepted and how each recipient disposed it', async () => {
    const d = domain()
    const a = caller(d)
    expect(await a.ok('sent', { id: 'p1' })).toEqual({
      head: 'done Notifications sent',
      value: { id: 'p1', accepted: false },
    })
    await a.ok('send', post('p1'))
    const [entry] = await d.boxOf(person)
    await d.faces.inbox.mark(d.owner, { recipient: person, identity: entry!.identity }, 'done')
    expect(await a.ok('sent', { id: 'p1' })).toEqual({
      head: 'done Notifications sent',
      value: {
        id: 'p1',
        accepted: true,
        recipients: [{ recipient: person, seen: false, state: 'done' }],
      },
    })
    expect(await caller(d, 'a2').ok('sent', { id: 'p1' })).toMatchObject({
      value: { accepted: false },
    })
  })
})

describe('the inbox of the calling agent', () => {
  async function withTwo() {
    const d = domain()
    const a = caller(d)
    await d.emit('e1', { named: [a.self] })
    await d.emit('e2', { named: [a.self, person] })
    return { d, a }
  }
  const ref = (event: string) => ({ source: 'demo.things', event })

  it('lists its own notifications and continues after a page', async () => {
    const { a } = await withTwo()
    const first = await a.ok('inbox', { limit: 1 })
    expect(first).toEqual({
      head: 'done Notifications inbox',
      value: {
        notifications: [
          {
            source: 'demo.things',
            event: 'e1',
            sequence: 2,
            type: 'changed',
            title: 'Title e1',
            level: 'weak',
            why: { kind: 'named' },
            acceptedAt: NOW,
            seen: false,
            state: 'unresolved',
          },
        ],
        after: 2,
      },
    })
    expect(await a.ok('inbox', { after: 2 })).toMatchObject({
      value: { notifications: [{ event: 'e2' }], after: null },
    })
  })

  it('reads one in full, resolves it, and takes that back', async () => {
    const { a } = await withTwo()
    expect(await a.ok('read', ref('e1'))).toMatchObject({
      head: 'done Notifications read',
      value: { event: 'e1', subject: 'repo/a', body: 'Body e1', locator: null, seen: false },
    })
    expect(await a.ok('done', ref('e1'))).toEqual({
      head: 'done Notifications done',
      value: { state: 'done', recalled: false },
    })
    expect(await a.ok('done', ref('e1'))).toMatchObject({ value: { recalled: true } })
    expect(await a.ok('inbox')).toMatchObject({ value: { notifications: [{ event: 'e2' }] } })
    expect(await a.ok('inbox', { filter: 'all' })).toMatchObject({
      value: { notifications: [{ event: 'e1', state: 'done' }, { event: 'e2' }] },
    })
    expect(await a.failure('dismiss', ref('e1'))).toEqual({
      kind: 'conflict',
      reason: expect.stringMatching(/^restore-first: /),
    })
    expect(await a.ok('restore', ref('e1'))).toMatchObject({ value: { state: 'unresolved' } })
    expect(await a.ok('dismiss', ref('e1'))).toMatchObject({ value: { state: 'dismissed' } })
  })

  it('cannot read or resolve what is in another inbox', async () => {
    const { d, a } = await withTwo()
    const other = caller(d, 'a2')
    for (const command of ['read', 'done', 'dismiss', 'restore'])
      expect(await other.failure(command, ref('e2')), command).toEqual({
        kind: 'invalid',
        reason: expect.stringMatching(/^not-found: /),
      })
    expect(await other.ok('inbox', { filter: 'all' })).toMatchObject({
      value: { notifications: [] },
    })
    expect((await d.boxOf(person))[0]!.marks.resolved).toBeNull()
    expect((await d.boxOf(a.self)).map(entry => entry.marks.resolved)).toEqual([null, null])
  })

  it('names a notification that a newer one replaced', async () => {
    const d = domain()
    const a = caller(d)
    await d.emit('r1', { named: [a.self], replaceKey: 'k' })
    await d.emit('r2', { named: [a.self], replaceKey: 'k' })
    expect(await a.failure('done', ref('r1'))).toEqual({
      kind: 'conflict',
      reason: expect.stringMatching(/^superseded: /),
    })
    expect(await a.ok('read', ref('r1'))).toMatchObject({ value: { state: 'superseded' } })
  })
})

describe('sources and subscriptions', () => {
  it('lists what an agent can subscribe to', async () => {
    const d = domain()
    const listed = await caller(d).ok('sources')
    expect(listed.head).toBe('done Notifications sources')
    expect(listed.value.sources.map((source: { source: string }) => source.source)).toEqual([
      'agent.posts',
      'demo.things',
    ])
    expect(listed.value.sources[1]).toEqual({
      source: 'demo.things',
      label: 'Demo',
      types: [
        {
          type: 'changed',
          label: 'Label of changed',
          description: 'A thing changed.',
          kind: 'event',
          subject: { presence: 'optional', hint: 'a repository path' },
          agentsMaySubscribe: true,
          agentDefault: 'off',
        },
        expect.objectContaining({ type: 'for-people', agentsMaySubscribe: false }),
      ],
    })
  })

  it('sets a subscription the owner lets through, lists it, and returns it to the default', async () => {
    const d = domain()
    d.consent.set({ kind: 'automatic', generation: 7 })
    const a = caller(d)
    const set = {
      ...changed,
      level: 'strong',
      scope: { kind: 'subject-prefix', prefix: 'repo/' },
      note: 'watch',
    }
    const stored = {
      ...changed,
      scope: set.scope,
      level: 'strong',
      note: 'watch',
      term: { kind: 'standing' },
      basis: { kind: 'blanket', generation: 7 },
      expired: false,
    }
    expect(await a.ok('subscribe', set)).toEqual({
      head: 'done Notifications subscribe',
      value: { ...stored, recalled: false },
    })
    expect(await a.ok('subscribe', set)).toMatchObject({ value: { recalled: true } })
    expect(await a.ok('subscriptions')).toEqual({
      head: 'done Notifications subscriptions',
      value: { subscriptions: [stored] },
    })
    expect(await caller(d, 'a2').ok('subscriptions')).toMatchObject({
      value: { subscriptions: [] },
    })
    await d.emit('e1')
    expect(await a.ok('inbox')).toMatchObject({
      value: { notifications: [{ event: 'e1', level: 'strong' }] },
    })
    const key = { ...changed, scope: set.scope }
    expect(await a.ok('unsubscribe', key)).toEqual({
      head: 'done Notifications unsubscribe',
      value: { recalled: false },
    })
    expect(await a.ok('unsubscribe', key)).toMatchObject({ value: { recalled: true } })
    expect(await a.ok('subscriptions')).toMatchObject({ value: { subscriptions: [] } })
  })

  it('subscribes to everything of a type, standing, when scope and term are left out', async () => {
    const d = domain()
    d.consent.set({ kind: 'automatic', generation: 1 })
    expect(await caller(d).ok('subscribe', { ...changed, level: 'weak' })).toMatchObject({
      value: { scope: { kind: 'all' }, term: { kind: 'standing' }, note: null },
    })
    expect(await caller(d).ok('unsubscribe', changed)).toMatchObject({ value: { recalled: false } })
  })

  it.each([
    [
      { source: 'demo.things', type: 'for-people', level: 'weak' },
      'unsupported',
      /^not-subscribable: /,
    ],
    [
      { ...changed, level: 'weak', term: { kind: 'until', at: '2026-11-18T05:00:00.000Z' } },
      'invalid',
      /^term-in-past: /,
    ],
    [{ source: 'Not A Source', type: 'changed', level: 'weak' }, 'invalid', /^invalid-request: /],
  ])(
    'a subscription the domain refuses is a failure with its reason',
    async (params, kind, reason) => {
      const d = domain()
      d.consent.set({ kind: 'automatic', generation: 1 })
      expect(await caller(d).failure('subscribe', params)).toEqual({
        kind,
        reason: expect.stringMatching(reason),
      })
      expect(d.store.commits()).toBe(0)
    },
  )
})

describe('a call that cannot reach the notification services', () => {
  const READS = ['sent', 'inbox', 'read', 'sources', 'subscriptions'] as const
  const WRITES = ['send', 'done', 'dismiss', 'restore', 'subscribe', 'unsubscribe'] as const
  const PARAMS: Record<(typeof READS)[number] | (typeof WRITES)[number], object> = {
    send: post('p1'),
    sent: { id: 'p1' },
    inbox: {},
    read: { source: 'demo.things', event: 'e1' },
    done: { source: 'demo.things', event: 'e1' },
    dismiss: { source: 'demo.things', event: 'e1' },
    restore: { source: 'demo.things', event: 'e1' },
    sources: {},
    subscriptions: {},
    subscribe: { ...changed, level: 'weak' },
    unsubscribe: changed,
  }
  const ALL = [...READS, ...WRITES]

  it('the two lists name every command but help', () => {
    const { definition } = author()
    if (definition.kind !== 'commands') throw new Error('commands')
    expect([...ALL, 'help'].sort()).toEqual(definition.commands.map(item => item.name).sort())
  })

  const UNREACHED: readonly (readonly [string, Partial<NotificationCallSource> | null, RegExp])[] =
    [
      ['no services attached to the call', null, /not attached/],
      ['services that are not there', { faces: () => undefined }, /not available now/],
      ['a context that cannot be read', { context: async () => undefined }, /not available now/],
      [
        'a context that throws',
        { context: () => Promise.reject(new Error('down')) },
        /not available now/,
      ],
    ]

  it.each(UNREACHED)(
    '%s: every command fails as unavailable and asks nothing',
    async (_label, source, reason) => {
      const d = domain()
      const a = caller(d, 'a1', source ?? {})
      for (const command of ALL) {
        const parsed = author().decode(command, PARAMS[command])
        if ('failure' in parsed) throw new Error(command)
        const answer =
          source === null
            ? await notificationsExecutor.initial(parsed.ok as never, null, unattached())
            : await a.run(command, PARAMS[command])
        expect(answer, command).toEqual({
          failure: {
            kind: 'unavailable',
            operation: `Notifications.${command}`,
            reason: expect.stringMatching(reason),
          },
        })
      }
      expect(d.authority.asked()).toEqual([])
      expect(d.store.commits()).toBe(0)
    },
  )

  it('a context of another tenant, or one that is not an agent, is refused before any service is asked', async () => {
    const d = domain()
    const foreign = caller(d, 'a1', {
      context: async () => d.contextOf({ kind: 'agent', recipient: agent('a1') }, 't2'),
    })
    const owner = caller(d, 'a1', { context: async () => d.owner })
    for (const a of [foreign, owner])
      for (const command of ALL)
        expect(await a.failure(command, PARAMS[command]), command).toMatchObject({
          kind: 'unavailable',
          reason: expect.stringMatching(/does not act as an agent of the tenant/),
        })
    expect(d.authority.asked()).toEqual([])
  })

  it('facts that cannot be read are unavailable, never an empty answer', async () => {
    for (const command of [
      'sent',
      'inbox',
      'read',
      'subscriptions',
      'subscribe',
      'unsubscribe',
    ] as const) {
      const d = domain()
      d.consent.set({ kind: 'automatic', generation: 1 })
      d.store.fail('read-unavailable')
      expect(await caller(d).failure(command, PARAMS[command]), command).toMatchObject({
        kind: 'unavailable',
        operation: `Notifications.${command}`,
        reason: expect.stringContaining('nothing was changed'),
      })
      expect(d.store.commits()).toBe(0)
    }
  })

  it('what the authority denies is a failure, and a hidden notification is not found', async () => {
    const d = domain()
    d.authority.answer(() => 'denied')
    const a = caller(d)
    for (const command of [
      'send',
      'sent',
      'sources',
      'subscriptions',
      'subscribe',
      'unsubscribe',
    ] as const)
      expect(await a.failure(command, PARAMS[command]), command).toEqual({
        kind: 'unsupported',
        reason: expect.stringMatching(/^not-permitted: /),
      })
    for (const command of ['inbox', 'read', 'done'] as const)
      expect(await a.failure(command, PARAMS[command]), command).toMatchObject({
        reason: expect.stringMatching(/^not-found: /),
      })
    d.authority.answer(() => 'unavailable')
    expect(await a.failure('inbox')).toMatchObject({ kind: 'unavailable' })
  })

  it('services that throw: a read is unavailable, a write has an unknown result', async () => {
    const d = domain()
    const thrower = new Proxy({}, { get: () => async () => Promise.reject(new Error('down')) })
    const broken = new Proxy({}, { get: () => thrower })
    const a = caller(d, 'a1', { faces: () => broken as never })
    for (const command of READS)
      expect(await a.failure(command, PARAMS[command]), command).toMatchObject({
        kind: 'unavailable',
      })
    for (const command of WRITES)
      expect(await a.failure(command, PARAMS[command]), command).toEqual({
        kind: 'unknown',
        operation: `Notifications.${command}`,
        reason: expect.stringContaining('not known whether this took effect'),
      })
  })
})
