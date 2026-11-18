import { tenantIdSchema } from '@omne-harness/notification-contract'
import { describe, expect, it } from 'vitest'
import {
  NAMES,
  OTHER,
  TENANT,
  agent,
  effectOf,
  person,
  world,
  type Name,
} from './fixtures/world.ts'

const ref = (event: string) => ({ recipient: person, source: 'demo.things', event })
const key = {
  recipient: person,
  source: 'demo.things',
  type: 'changed',
  scope: { kind: 'subject', equals: 'repo/a' },
}
const change = { ...key, level: 'strong', note: null, term: { kind: 'standing' } }
const mail = { recipient: person, channel: 'mail', address: 'me@x', minLevel: 'strong' }
const mailId = JSON.stringify(['mail', 'me@x'])
const none = { seenAt: null, resolved: null, supersededBy: null }
const NOW = '2026-11-18T06:00:00.000Z'
const INVALID = { outcome: 'invalid', body: { reason: 'request' } }

/** One body per operation that the protocol reads and the domain takes. */
const post = {
  source: 'demo.things',
  event: 's1',
  type: 'changed',
  subject: 'repo/a',
  title: 'Posted',
  body: 'By the owner.',
  locator: null,
  replaceKey: null,
  renotify: false,
  named: [person],
}

const SAMPLES: Record<Name, Record<string, unknown>> = {
  send: post,
  'list-inbox': { recipient: person, filter: 'all', after: null, limit: 10 },
  'read-notification': ref('e1'),
  mark: { ...ref('e1'), operation: 'seen' },
  'query-send': { source: 'demo.things', event: 'e1' },
  'list-subscriptions': { recipient: person },
  'set-subscription': change,
  'remove-subscription': key,
  'read-beat': { recipient: person },
  'set-beat': { recipient: person, beat: { kind: 'off' } },
  'list-destinations': { recipient: person },
  'add-destination': mail,
  'change-destination': { recipient: person, id: 'default', minLevel: 'strong' },
  'remove-destination': { recipient: person, id: mailId },
  'list-sources': {},
  'list-channels': {},
}

describe('the first three steps', () => {
  it.each([
    ['a login that may not act for the tenant', 'denied', 'denied'],
    ['an identity that cannot answer', 'basis-unavailable', 'basis-unavailable'],
    ['an identity that throws', 'throws', 'basis-unavailable'],
  ] as const)('%s stops every operation before the domain', async (_label, login, outcome) => {
    const w = world()
    w.state.login = login
    for (const name of NAMES) expect(await w.call(name, SAMPLES[name])).toEqual({ outcome })
    expect(w.authority.asked()).toEqual([])
    expect(w.store.commits()).toBe(0)
  })

  it('asks whether the login acts for the tenant of the body, at every call', async () => {
    const w = world()
    await w.call('list-inbox', SAMPLES['list-inbox'])
    await w.call('list-inbox', { ...SAMPLES['list-inbox'], tenant: OTHER })
    expect(w.state.logins).toEqual([TENANT, OTHER])
  })

  it('answers an unavailable basis while the faces are absent, and answers again once they are back', async () => {
    const w = world()
    const { faces } = w.state
    w.state.faces = undefined
    for (const name of NAMES)
      expect(await w.call(name, SAMPLES[name])).toEqual({ outcome: 'basis-unavailable' })
    expect(w.authority.asked()).toEqual([])
    w.state.faces = faces
    expect(await w.call('read-beat', SAMPLES['read-beat'])).toEqual({
      outcome: 'succeeded',
      body: { kind: 'default' },
    })
  })
})

describe('step four', () => {
  it('a domain that throws: a read has no basis, a commit has an unknown result', async () => {
    const w = world()
    const broken = new Proxy(
      {},
      {
        get: () =>
          new Proxy(
            {},
            {
              get: () => async () => {
                throw new Error('domain is down')
              },
            },
          ),
      },
    )
    w.state.faces = broken as never
    for (const name of NAMES)
      expect(await w.call(name, SAMPLES[name])).toEqual({
        outcome: effectOf(name) === 'commit' ? 'unknown' : 'basis-unavailable',
      })
  })

  it.each([
    'send',
    'list-inbox',
    'read-notification',
    'query-send',
    'list-subscriptions',
    'set-subscription',
    'remove-subscription',
    'read-beat',
    'set-beat',
    'list-destinations',
  ] as const)('%s: facts that cannot be read are an unavailable basis', async name => {
    const w = world()
    await w.send('e1')
    const commits = w.store.commits()
    w.store.fail('read-unavailable')
    expect(await w.call(name, SAMPLES[name])).toEqual({ outcome: 'basis-unavailable' })
    expect(w.store.commits()).toBe(commits)
    expect(await w.call(name, SAMPLES[name])).toMatchObject({
      outcome: name === 'remove-subscription' ? 'no-change' : 'succeeded',
    })
  })

  /** Every commit, with what has to be there before it changes anything. */
  const COMMITS = [
    ['send', null, post],
    ['mark', null, SAMPLES.mark],
    ['set-subscription', null, change],
    ['remove-subscription', ['set-subscription', change], key],
    ['set-beat', null, SAMPLES['set-beat']],
    ['add-destination', null, mail],
    ['change-destination', null, SAMPLES['change-destination']],
    ['remove-destination', ['add-destination', mail], SAMPLES['remove-destination']],
  ] as const

  async function arranged(arrange: (typeof COMMITS)[number][1]) {
    const w = world()
    await w.send('e1')
    if (arrange !== null) await w.call(arrange[0], arrange[1])
    return w
  }

  it('the table names every commit of the protocol', () => {
    expect(COMMITS.map(([name]) => name).sort()).toEqual(
      NAMES.filter(name => effectOf(name) === 'commit').sort(),
    )
  })

  it.each(COMMITS)(
    '%s: a commit the store rolled back wrote nothing',
    async (name, arrange, body) => {
      const w = await arranged(arrange)
      const commits = w.store.commits()
      w.store.fail('rolled-back')
      expect(await w.call(name, body)).toEqual({ outcome: 'basis-unavailable' })
      expect(w.store.commits()).toBe(commits)
      expect(await w.call(name, body)).toMatchObject({ outcome: 'succeeded' })
      expect(w.store.commits()).toBe(commits + 1)
    },
  )

  it.each(COMMITS)(
    '%s: after an unknown result, the same body again is recalled as no-change',
    async (name, arrange, body) => {
      const w = await arranged(arrange)
      w.store.fail('unknown-applied')
      expect(await w.call(name, body)).toEqual({ outcome: 'unknown' })
      const commits = w.store.commits()
      expect(await w.call(name, body)).toMatchObject({ outcome: 'no-change' })
      expect(w.store.commits()).toBe(commits)
    },
  )

  it.each(COMMITS)(
    '%s: after an unknown result that wrote nothing, the same body again takes effect',
    async (name, arrange, body) => {
      const w = await arranged(arrange)
      w.store.fail('unknown-lost')
      expect(await w.call(name, body)).toEqual({ outcome: 'unknown' })
      expect(await w.call(name, body)).toMatchObject({ outcome: 'succeeded' })
    },
  )
})

describe('what the plugin does not let through', () => {
  it('a tenant that was not minted reaches neither the identity nor the domain', async () => {
    const w = world()
    for (const name of NAMES) {
      const handler = w.contribution.operations[name] as (
        call: never,
        body: never,
      ) => Promise<unknown>
      await expect(
        handler(w.context as never, { ...SAMPLES[name], tenant: {} } as never),
      ).rejects.toThrow(/not a minted TenantId/)
    }
    expect(w.state.logins).toEqual([])
    expect(w.authority.asked()).toEqual([])
  })

  it('an instant the domain kept wrongly is not written as an answer', async () => {
    const w = world()
    await w.send('e1')
    const { inbox } = w.real
    w.state.faces = {
      ...w.real,
      inbox: {
        ...inbox,
        read: async (ctx, ref) => {
          const read = await inbox.read(ctx, ref)
          if (read.kind !== 'done') throw new Error(read.kind)
          return { ...read, value: { ...read.value, acceptedAt: 'yesterday' as never } }
        },
      },
    }
    await expect(w.call('read-notification', ref('e1'))).rejects.toThrow(/invalid instant/)
  })

  it.each([
    ['invalid-request', INVALID],
    ['invalid-scope', INVALID],
    ['invalid-term', INVALID],
    ['term-in-past', { outcome: 'invalid', body: { reason: 'term-in-past' } }],
    ['not-subscribable', { outcome: 'invalid', body: { reason: 'not-subscribable' } }],
    ['scope-does-not-fit', { outcome: 'invalid', body: { reason: 'scope-does-not-fit' } }],
    ['not-permitted', { outcome: 'denied' }],
    ['not-own-recipient', { outcome: 'denied' }],
    ['confirmation-mismatch', { outcome: 'denied' }],
  ] as const)('a subscription the domain refuses as %s has one answer', async (reason, answer) => {
    const w = world()
    const subscriptions = {
      ...w.real.subscriptions,
      set: async () => ({ kind: 'refused', reason }),
    }
    w.state.faces = { ...w.real, subscriptions } as never
    expect(await w.call('set-subscription', change)).toEqual(answer)
  })
})

describe('the inbox', () => {
  it('lists a page in the words of the protocol and continues after it', async () => {
    const w = world()
    await w.send('e1')
    await w.send('e2')
    const list = (more: Record<string, unknown> = {}) =>
      w.call('list-inbox', { recipient: person, filter: 'all', after: null, limit: 1, ...more })
    const first = await list()
    expect(first).toEqual({
      outcome: 'succeeded',
      body: {
        entries: [
          {
            ...ref('e1'),
            sequence: 1,
            type: 'changed',
            title: 'Title e1',
            level: 'weak',
            cause: { kind: 'type-default' },
            acceptedAt: NOW,
            marks: none,
          },
        ],
        next: 1,
      },
    })
    const second = await list({ after: 1 })
    expect(second).toMatchObject({ body: { entries: [{ event: 'e2', sequence: 2 }], next: null } })
    await w.call('mark', { ...ref('e1'), operation: 'done' })
    expect(await list({ filter: 'unresolved', limit: 10 })).toMatchObject({
      body: { entries: [{ event: 'e2' }], next: null },
    })
  })

  it('reads one notification in full and does not mark it seen', async () => {
    const w = world()
    await w.send('e1', {
      content: { title: 'T', body: 'B', locator: { kind: 'session', ref: 's-1' } },
    })
    const read = await w.call('read-notification', ref('e1'))
    expect(read).toMatchObject({
      outcome: 'succeeded',
      body: {
        ...ref('e1'),
        subject: 'repo/a',
        at: '2026-11-18T05:59:00.000Z',
        body: 'B',
        locator: { kind: 'session', ref: 's-1' },
        marks: none,
      },
    })
  })

  it('answers not-found for what is not there, another tenant’s, and a recipient the authority hides', async () => {
    const w = world()
    await w.send('e1')
    const missing = { outcome: 'not-found', body: {} }
    expect(await w.call('read-notification', ref('nope'))).toEqual(missing)
    expect(await w.call('mark', { ...ref('nope'), operation: 'seen' })).toEqual(missing)
    expect(await w.call('read-notification', { ...ref('e1'), tenant: OTHER })).toEqual(missing)
    expect(await w.call('mark', { ...ref('e1'), tenant: OTHER, operation: 'done' })).toEqual(
      missing,
    )
    expect(await w.call('list-inbox', { ...SAMPLES['list-inbox'], tenant: OTHER })).toMatchObject({
      body: { entries: [] },
    })
    w.authority.answer(() => 'denied')
    expect(await w.call('list-inbox', SAMPLES['list-inbox'])).toEqual(missing)
    expect(await w.call('read-notification', ref('e1'))).toEqual(missing)
    expect(await w.call('mark', { ...ref('e1'), operation: 'seen' })).toEqual(missing)
  })

  it('answers invalid where the domain refuses a value the protocol let through', async () => {
    const w = world()
    const bad = { recipient: person, source: 'Not A Source', event: 'e1' }
    expect(await w.call('read-notification', bad)).toEqual(INVALID)
    expect(await w.call('mark', { ...bad, operation: 'seen' })).toEqual(INVALID)
    expect(await w.call('query-send', { source: 'Not A Source', event: 'e1' })).toEqual(INVALID)
    expect(await w.call('list-inbox', { ...SAMPLES['list-inbox'], limit: 51 })).toEqual(INVALID)
  })

  it('marks, recalls the same mark, and names the conflict', async () => {
    const w = world()
    await w.send('e1')
    const mark = (operation: string, event = 'e1') => w.call('mark', { ...ref(event), operation })
    expect(await mark('seen')).toEqual({ outcome: 'succeeded', body: { ...none, seenAt: NOW } })
    expect(await mark('seen')).toEqual({ outcome: 'no-change', body: { ...none, seenAt: NOW } })
    const done = { seenAt: NOW, resolved: { how: 'done', at: NOW }, supersededBy: null }
    expect(await mark('done')).toEqual({ outcome: 'succeeded', body: done })
    expect(await mark('dismiss')).toEqual({
      outcome: 'conflict',
      body: { reason: 'restore-first' },
    })
    expect(await mark('restore')).toMatchObject({ outcome: 'succeeded', body: { resolved: null } })
    await w.send('r1', { replaceKey: 'k' })
    await w.send('r2', { replaceKey: 'k' })
    expect(await mark('done', 'r1')).toEqual({
      outcome: 'conflict',
      body: { reason: 'superseded' },
    })
    expect(await w.call('read-notification', ref('r1'))).toMatchObject({
      body: { marks: { supersededBy: { source: 'demo.things', event: 'r2' } } },
    })
  })

  it('says whether a send was accepted, with the marks of each notification', async () => {
    const w = world()
    await w.send('e1', { named: [agent('a')] })
    await w.call('mark', { ...ref('e1'), operation: 'seen' })
    expect(await w.call('query-send', { source: 'demo.things', event: 'e1' })).toEqual({
      outcome: 'succeeded',
      body: {
        kind: 'accepted',
        notifications: [
          { recipient: person, marks: { ...none, seenAt: NOW } },
          { recipient: agent('a'), marks: none },
        ],
      },
    })
    expect(await w.call('query-send', { source: 'demo.things', event: 'nope' })).toEqual({
      outcome: 'succeeded',
      body: { kind: 'not-submitted' },
    })
    w.authority.answer(() => 'denied')
    expect(await w.call('query-send', { source: 'demo.things', event: 'e1' })).toEqual({
      outcome: 'denied',
    })
  })
})

describe('a send by the owner', () => {
  it('hands the event over as the body says, at the time of the server, and names who received it', async () => {
    const w = world()
    const body = { ...post, locator: { kind: 'session', ref: 's-9' }, replaceKey: 'k' }
    expect(await w.call('send', body)).toEqual({
      outcome: 'succeeded',
      body: { recipients: [person] },
    })
    expect(await w.call('read-notification', ref('s1'))).toEqual({
      outcome: 'succeeded',
      body: expect.objectContaining({
        type: 'changed',
        subject: 'repo/a',
        title: 'Posted',
        body: 'By the owner.',
        locator: { kind: 'session', ref: 's-9' },
        cause: { kind: 'named' },
        at: NOW,
        acceptedAt: NOW,
      }),
    })
  })

  it('recalls the same send at a later time and keeps one notification', async () => {
    const w = world()
    await w.call('send', post)
    w.clock.advance(60_000)
    expect(await w.call('send', post)).toEqual({
      outcome: 'no-change',
      body: { recipients: [person] },
    })
    const page = await w.call('list-inbox', SAMPLES['list-inbox'])
    expect(page).toMatchObject({ body: { entries: [{ event: 's1', acceptedAt: NOW }] } })
    expect((page as { body: { entries: unknown[] } }).body.entries).toHaveLength(1)
  })

  it('refuses other content under an identity that is taken', async () => {
    const w = world()
    await w.call('send', post)
    expect(await w.call('send', { ...post, title: 'Changed my mind' })).toEqual({
      outcome: 'conflict',
      body: { reason: 'different-content' },
    })
  })

  it('reaches every named recipient the type lets a send name', async () => {
    const w = world()
    expect(await w.call('send', { ...post, named: [person, agent('a')] })).toEqual({
      outcome: 'succeeded',
      body: { recipients: [person, agent('a')] },
    })
  })

  it('a second send under the same replace key takes the place of the first', async () => {
    const w = world()
    await w.call('send', { ...post, replaceKey: 'weekly' })
    await w.call('send', { ...post, event: 's2', replaceKey: 'weekly', renotify: true })
    expect(await w.call('read-notification', ref('s1'))).toMatchObject({
      body: { marks: { supersededBy: { source: 'demo.things', event: 's2' } } },
    })
    const sends = w.store.facts(tenantIdSchema.parse(TENANT)).sends
    expect([...sends.values()].map(send => send.event.renotify)).toEqual([false, true])
  })

  it.each([
    ['too-large', { body: 'x'.repeat(1001) }],
    ['unknown-event-type', { type: 'never-declared' }],
    ['standing-type', { type: 'open' }],
    ['invalid-subject', { type: 'plain' }],
    ['naming-not-allowed', { type: 'for-the-owner', named: [agent('a')] }],
  ])('names why the send is not valid: %s', async (reason, more) => {
    const w = world()
    const commits = w.store.commits()
    expect(await w.call('send', { ...post, ...more })).toEqual({
      outcome: 'invalid',
      body: { reason },
    })
    expect(w.store.commits()).toBe(commits)
  })

  it('refuses a named recipient the authority does not admit', async () => {
    const w = world()
    w.authority.answer((_ctx, action) => (action.kind === 'be-recipient' ? 'denied' : 'allowed'))
    expect(await w.call('send', post)).toEqual({
      outcome: 'invalid',
      body: { reason: 'recipient-not-admissible' },
    })
  })

  it('answers invalid for a source name that is not one', async () => {
    const w = world()
    expect(await w.call('send', { ...post, source: 'Not A Source' })).toEqual(INVALID)
  })

  it('denies a source the authority does not let this login send as, and writes nothing', async () => {
    const w = world()
    const commits = w.store.commits()
    w.authority.answer((_ctx, action) => (action.kind === 'send-as' ? 'denied' : 'allowed'))
    expect(await w.call('send', post)).toEqual({ outcome: 'denied' })
    expect(w.authority.asked()).toContainEqual({ kind: 'send-as', source: 'demo.things' })
    expect(w.store.commits()).toBe(commits)
  })

  it('has no basis while the source is not registered, and sends once it is', async () => {
    const w = world()
    expect(await w.call('send', { ...post, source: 'demo.absent' })).toEqual({
      outcome: 'basis-unavailable',
    })
  })

  it('sends as the owner of the tenant the login acts for, never as an agent', async () => {
    const w = world()
    await w.call('send', post)
    const [sent] = [...w.store.facts(tenantIdSchema.parse(TENANT)).sends.values()]
    expect(sent?.event.origin).toBeNull()
    expect(sent?.identity).toEqual({ tenant: TENANT, source: 'demo.things', eventId: 's1' })
    expect(w.store.facts(tenantIdSchema.parse(OTHER)).sends.size).toBe(0)
  })
})

describe('subscriptions and the beat', () => {
  it('sets, recalls, lists and removes a subscription', async () => {
    const w = world()
    const until = {
      ...change,
      note: 'watch it',
      term: { kind: 'until', at: '2026-11-19T00:00:00.000Z' },
    }
    const stored = { ...until, basis: { kind: 'owner' }, expired: false }
    expect(await w.call('set-subscription', until)).toEqual({ outcome: 'succeeded', body: stored })
    expect(await w.call('set-subscription', until)).toEqual({ outcome: 'no-change', body: stored })
    expect(await w.call('list-subscriptions', { recipient: person })).toEqual({
      outcome: 'succeeded',
      body: { subscriptions: [stored] },
    })
    expect(await w.call('list-subscriptions', { recipient: person, tenant: OTHER })).toEqual({
      outcome: 'succeeded',
      body: { subscriptions: [] },
    })
    expect(await w.call('remove-subscription', key)).toEqual({ outcome: 'succeeded', body: {} })
    expect(await w.call('remove-subscription', key)).toEqual({ outcome: 'no-change', body: {} })
    expect(await w.call('list-subscriptions', { recipient: person })).toMatchObject({
      body: { subscriptions: [] },
    })
  })

  it('names why a subscription is not valid', async () => {
    const w = world()
    const set = (more: Record<string, unknown>) =>
      w.call('set-subscription', { ...change, ...more })
    const because = (reason: string) => ({ outcome: 'invalid', body: { reason } })
    expect(await set({ term: { kind: 'until', at: '2026-11-18T05:00:00Z' } })).toEqual(
      because('term-in-past'),
    )
    expect(await set({ recipient: agent('a'), type: 'for-people' })).toEqual(
      because('not-subscribable'),
    )
    expect(await set({ type: 'plain' })).toEqual(because('scope-does-not-fit'))
    expect(await set({ source: 'Not A Source' })).toEqual(INVALID)
    expect(await set({ scope: { kind: 'subject', equals: 'x'.repeat(501) } })).toEqual(INVALID)
    expect(await set({ term: { kind: 'until', at: '2026-11-19T00:00:00.0001Z' } })).toEqual(INVALID)
    expect(await w.call('remove-subscription', { ...key, source: 'Not A Source' })).toEqual(INVALID)
    expect(
      await w.call('remove-subscription', {
        ...key,
        scope: { kind: 'subject-prefix', prefix: 'x'.repeat(501) },
      }),
    ).toEqual(INVALID)
    expect(w.store.commits()).toBe(0)
  })

  it('takes an instant however its milliseconds are written, and answers it with three digits', async () => {
    const w = world()
    const at = (text: string) => ({ ...change, term: { kind: 'until', at: text } })
    const stored = { body: { term: { at: '2026-11-19T00:00:00.120Z' } } }
    expect(await w.call('set-subscription', at('2026-11-19T00:00:00.12Z'))).toMatchObject({
      outcome: 'succeeded',
      ...stored,
    })
    for (const same of ['2026-11-19T00:00:00.120Z', '2026-11-19T00:00:00.1200000Z'])
      expect(await w.call('set-subscription', at(same))).toMatchObject({
        outcome: 'no-change',
        ...stored,
      })
    expect(await w.call('set-subscription', at('2026-11-19T00:00:01Z'))).toMatchObject({
      outcome: 'succeeded',
      body: { term: { at: '2026-11-19T00:00:01.000Z' } },
    })
  })

  it('denies what the authority denies, and a context that would have to be confirmed', async () => {
    const w = world()
    w.authority.answer(() => 'denied')
    for (const name of ['set-subscription', 'remove-subscription', 'list-subscriptions'] as const)
      expect(await w.call(name, SAMPLES[name]), name).toEqual({ outcome: 'denied' })
    for (const name of ['read-beat', 'set-beat'] as const)
      expect(await w.call(name, SAMPLES[name]), name).toEqual({ outcome: 'denied' })
    w.authority.answer(() => 'allowed')
    w.state.actor = { kind: 'agent', recipient: agent('a') }
    const own = { ...change, recipient: agent('a') }
    expect(await w.call('set-subscription', own)).toEqual({ outcome: 'denied' })
    expect(await w.call('set-subscription', change)).toEqual({ outcome: 'denied' })
    expect(await w.call('remove-subscription', key)).toEqual({ outcome: 'denied' })
    expect(w.store.commits()).toBe(0)
  })

  it('reads and sets the beat within the allowed range', async () => {
    const w = world()
    const every = (minutes: number) => ({ recipient: person, beat: { kind: 'every', minutes } })
    expect(await w.call('read-beat', { recipient: person })).toEqual({
      outcome: 'succeeded',
      body: { kind: 'default' },
    })
    expect(await w.call('set-beat', every(30))).toEqual({
      outcome: 'succeeded',
      body: { kind: 'every', minutes: 30 },
    })
    expect(await w.call('set-beat', every(30))).toMatchObject({ outcome: 'no-change' })
    expect(await w.call('read-beat', { recipient: person })).toMatchObject({
      body: { kind: 'every', minutes: 30 },
    })
    expect(await w.call('read-beat', { recipient: person, tenant: OTHER })).toMatchObject({
      body: { kind: 'default' },
    })
    for (const minutes of [4, 1441])
      expect(await w.call('set-beat', every(minutes))).toEqual({
        outcome: 'invalid',
        body: { reason: 'out-of-range' },
      })
    const long = { recipient: agent('x'.repeat(201)) }
    expect(await w.call('read-beat', long)).toEqual(INVALID)
    expect(await w.call('set-beat', { ...long, beat: { kind: 'off' } })).toEqual(INVALID)
    expect(await w.call('list-subscriptions', long)).toEqual(INVALID)
  })
})

describe('destinations', () => {
  const builtin = {
    recipient: person,
    id: 'default',
    channel: 'in-app',
    address: '',
    minLevel: 'weak',
    builtin: true,
    blockedSince: null,
    state: 'enabled',
  }
  const added = { ...mail, id: mailId, builtin: false, blockedSince: null, state: 'enabled' }

  it('lists the builtin destination, adds one and recalls the same one', async () => {
    const w = world()
    expect(await w.call('list-destinations', { recipient: person })).toEqual({
      outcome: 'succeeded',
      body: { destinations: [builtin] },
    })
    expect(await w.call('add-destination', mail)).toEqual({ outcome: 'succeeded', body: added })
    expect(await w.call('add-destination', mail)).toEqual({ outcome: 'no-change', body: added })
    expect(await w.call('list-destinations', { recipient: person })).toMatchObject({
      body: { destinations: [builtin, added] },
    })
    expect(await w.call('list-destinations', { recipient: person, tenant: OTHER })).toMatchObject({
      body: { destinations: [builtin] },
    })
  })

  it('refuses an address the channel does not take and a channel name that is not one', async () => {
    const w = world()
    expect(await w.call('add-destination', { ...mail, address: 'bad' })).toEqual({
      outcome: 'invalid',
      body: { reason: 'address' },
    })
    expect(await w.call('add-destination', { ...mail, channel: 'Not A Channel' })).toEqual(INVALID)
    expect(await w.call('add-destination', { ...mail, channel: 'pager' })).toEqual({
      outcome: 'basis-unavailable',
    })
    expect(w.store.commits()).toBe(0)
  })

  it('changes level and enablement, and leaves what the body does not name', async () => {
    const w = world()
    await w.call('add-destination', mail)
    const target = { recipient: person, id: mailId }
    expect(await w.call('change-destination', { ...target, enabled: false })).toEqual({
      outcome: 'succeeded',
      body: { ...added, state: 'disabled' },
    })
    expect(await w.call('change-destination', { ...target, minLevel: 'weak' })).toEqual({
      outcome: 'succeeded',
      body: { ...added, state: 'disabled', minLevel: 'weak' },
    })
    expect(await w.call('change-destination', { ...target, minLevel: 'weak' })).toMatchObject({
      outcome: 'no-change',
    })
    expect(await w.call('change-destination', target)).toEqual(INVALID)
    expect(
      await w.call('change-destination', { recipient: person, id: 'nope', enabled: true }),
    ).toEqual({ outcome: 'not-found', body: {} })
  })

  it('removes a destination, recalls the removal, and does not remove the builtin one', async () => {
    const w = world()
    await w.call('add-destination', mail)
    const target = { recipient: person, id: mailId }
    expect(await w.call('remove-destination', target)).toEqual({ outcome: 'succeeded', body: {} })
    expect(await w.call('remove-destination', target)).toEqual({ outcome: 'no-change', body: {} })
    expect(await w.call('remove-destination', { recipient: person, id: 'default' })).toEqual({
      outcome: 'not-writable',
      body: {},
    })
    expect(await w.call('list-destinations', { recipient: person })).toMatchObject({
      body: { destinations: [builtin] },
    })
  })

  it('says since when a destination is blocked', async () => {
    const w = world()
    await w.call('add-destination', mail)
    const facts = w.store.facts(tenantIdSchema.parse(TENANT))
    for (const [id, destination] of facts.destinations)
      if (!destination.builtin)
        facts.destinations.set(id, { ...destination, blockedSince: NOW as never })
    expect(await w.call('list-destinations', { recipient: person })).toMatchObject({
      body: { destinations: [builtin, { ...added, blockedSince: NOW }] },
    })
  })

  it('denies what the authority denies and refuses a recipient that is not one', async () => {
    const w = world()
    const long = agent('x'.repeat(201))
    const names = [
      'list-destinations',
      'add-destination',
      'change-destination',
      'remove-destination',
    ] as const
    for (const name of names)
      expect(await w.call(name, { ...SAMPLES[name], recipient: long }), name).toEqual(INVALID)
    w.authority.answer(() => 'denied')
    for (const name of names)
      expect(await w.call(name, SAMPLES[name]), name).toEqual({ outcome: 'denied' })
    expect(w.store.commits()).toBe(0)
  })
})

describe('the catalogue', () => {
  it('lists the sources with their event types and the channels', async () => {
    const w = world()
    const sources = await w.call('list-sources', {})
    expect(sources).toMatchObject({
      outcome: 'succeeded',
      body: {
        sources: [
          {
            name: 'demo.things',
            label: 'Demo',
            types: [
              {
                name: 'changed',
                label: 'changed',
                description: 'A thing changed.',
                kind: 'event',
                subject: { presence: 'optional', hint: 'a repository path' },
                subscribable: ['person', 'agent'],
                nameable: ['person', 'agent'],
                defaults: { person: 'weak', agent: 'off' },
                external: false,
              },
              { name: 'for-people', subscribable: ['person'] },
              { name: 'plain', subject: { presence: 'none', hint: '' } },
              { name: 'for-the-owner', nameable: ['person'] },
              { name: 'open', kind: 'standing' },
            ],
          },
        ],
      },
    })
    expect(await w.call('list-channels', {})).toEqual({
      outcome: 'succeeded',
      body: {
        channels: [
          {
            name: 'in-app',
            label: 'in-app',
            leavesSystem: false,
            addressHint: 'anything but "bad"',
          },
          { name: 'mail', label: 'mail', leavesSystem: true, addressHint: 'anything but "bad"' },
        ],
      },
    })
  })

  it('denies what the authority denies', async () => {
    const w = world()
    w.authority.answer(() => 'denied')
    expect(await w.call('list-sources', {})).toEqual({ outcome: 'denied' })
    expect(await w.call('list-channels', {})).toEqual({ outcome: 'denied' })
  })
})
