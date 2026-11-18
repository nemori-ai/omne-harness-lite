import assert from 'node:assert/strict'
import {
  channelNameSchema,
  eventFactsSchema,
  eventTypeNameSchema,
  instantSchema,
  sendIdentitySchema,
  sourceNameSchema,
  tenantIdSchema,
  UNMARKED,
  type EventFacts,
  type RecipientRef,
  type SendRequest,
  type SubscriptionKey,
} from '@omne-harness/notification-contract'
import type { NotificationStore, StoreAnswer } from '../store.ts'
import type { AcceptCommand } from '../transactions/accept.ts'
import type { RecipientDefaults } from '../transactions/destinations.ts'

/** Every implementation of the repository passes these cases, each on a store of its own. */
export type StoreConformanceCase = Readonly<{
  name: string
  run(create: () => Promise<NotificationStore>): Promise<void>
}>

const T1 = tenantIdSchema.parse('tenant-one')
const T2 = tenantIdSchema.parse('tenant-two')
const PERSON: RecipientRef = { kind: 'person' }
/** The defaults every case uses: a person starts with one destination, an agent with none. */
export const DEFAULTS: RecipientDefaults = {
  person: { channel: channelNameSchema.parse('in-app'), minLevel: 'weak' },
  agent: null,
}
const at = (minute: number) =>
  instantSchema.parse(new Date(Date.UTC(2026, 10, 18, 6, minute)).toISOString())

function request(
  eventId: string,
  event: Partial<Record<keyof EventFacts, unknown>> = {},
): SendRequest {
  return {
    identity: sendIdentitySchema.parse({ tenant: T1, source: 'demo.things', eventId }),
    event: eventFactsSchema.parse({
      type: 'changed',
      subject: null,
      at: at(0),
      content: { title: `Title ${eventId}`, body: `Body ${eventId}`, locator: null },
      replaceKey: null,
      renotify: false,
      named: [],
      origin: null,
      ...event,
    }),
  }
}

const command = (
  eventId: string,
  event: Partial<Record<keyof EventFacts, unknown>> = {},
  minute = 1,
): AcceptCommand => ({
  request: request(eventId, event),
  type: { defaults: { person: 'weak', agent: 'off' }, external: false },
  defaults: DEFAULTS,
  now: at(minute),
})

const subscriptionOf = (ref: string): SubscriptionKey => ({
  recipient: { kind: 'agent', ref },
  source: sourceNameSchema.parse('demo.things'),
  type: eventTypeNameSchema.parse('changed'),
  scope: { kind: 'all' },
})

function committed<T>(answer: StoreAnswer<T>): T {
  assert.equal(answer.kind, 'committed')
  return (answer as Extract<StoreAnswer<T>, { kind: 'committed' }>).value
}

function value<T>(read: { kind: 'read'; value: T } | { kind: 'unavailable' }): T {
  assert.equal(read.kind, 'read')
  return (read as { kind: 'read'; value: T }).value
}

export const storeConformanceCases: readonly StoreConformanceCase[] = [
  {
    name: 'an accepted send and its notifications are written together',
    async run(create) {
      const store = await create()
      const agent: RecipientRef = { kind: 'agent', ref: 'a1' }
      const result = committed(await store.accept(T1, command('e1', { named: [agent] })))
      assert.deepEqual(result, { kind: 'accepted', recipients: [PERSON, agent] })
      const view = value(await store.send(T1, command('e1').request.identity))
      assert.deepEqual(
        view?.notifications,
        [PERSON, agent].map(recipient => ({ recipient, marks: UNMARKED })),
      )
      const boxed = value(
        await store.box(T1, { recipient: agent, filter: 'all', after: null, limit: 10 }),
      )
      assert.deepEqual(
        boxed.entries.map(entry => [entry.title, entry.cause.kind, entry.level]),
        [['Title e1', 'named', 'weak']],
      )
    },
  },
  {
    name: 'the same send again is recalled and writes nothing',
    async run(create) {
      const store = await create()
      committed(await store.accept(T1, command('e1')))
      const again = committed(await store.accept(T1, command('e1', {}, 9)))
      assert.deepEqual(again, { kind: 'recalled', recipients: [PERSON] })
      const page = value(
        await store.box(T1, { recipient: PERSON, filter: 'all', after: null, limit: 10 }),
      )
      assert.equal(page.entries.length, 1)
      assert.equal(page.entries[0]?.acceptedAt, at(1))
    },
  },
  {
    name: 'the same identity with other content conflicts and leaves the first send intact',
    async run(create) {
      const store = await create()
      committed(await store.accept(T1, command('e1')))
      const other = { content: { title: 'Other', body: 'Other', locator: null } }
      assert.deepEqual(committed(await store.accept(T1, command('e1', other))), {
        kind: 'conflict',
      })
      const view = value(
        await store.notification(T1, {
          recipient: PERSON,
          identity: command('e1').request.identity,
        }),
      )
      assert.equal(view?.title, 'Title e1')
      assert.equal(view?.body, 'Body e1')
    },
  },
  {
    name: 'one tenant cannot read anything of another tenant',
    async run(create) {
      const store = await create()
      committed(await store.accept(T1, command('e1')))
      const identity = command('e1').request.identity
      assert.equal(value(await store.send(T2, identity)), null)
      assert.equal(value(await store.notification(T2, { recipient: PERSON, identity })), null)
      const page = value(
        await store.box(T2, { recipient: PERSON, filter: 'all', after: null, limit: 10 }),
      )
      assert.deepEqual(page, { entries: [], next: null })
      const mark = await store.mark(T2, {
        ref: { recipient: PERSON, identity },
        operation: 'done',
        now: at(2),
      })
      assert.deepEqual(committed(mark), { kind: 'not-found' })
      assert.equal(
        value(await store.notification(T1, { recipient: PERSON, identity }))?.marks.resolved,
        null,
      )
    },
  },
  {
    name: 'an inbox is paged in the order of acceptance',
    async run(create) {
      const store = await create()
      for (const id of ['e1', 'e2', 'e3', 'e4', 'e5'])
        committed(await store.accept(T1, command(id)))
      const first = value(
        await store.box(T1, { recipient: PERSON, filter: 'all', after: null, limit: 2 }),
      )
      assert.deepEqual(
        first.entries.map(entry => entry.identity.eventId),
        ['e1', 'e2'],
      )
      assert.equal(first.next, first.entries[1]?.sequence)
      const second = value(
        await store.box(T1, { recipient: PERSON, filter: 'all', after: first.next, limit: 2 }),
      )
      assert.deepEqual(
        second.entries.map(entry => entry.identity.eventId),
        ['e3', 'e4'],
      )
      const last = value(
        await store.box(T1, { recipient: PERSON, filter: 'all', after: second.next, limit: 2 }),
      )
      assert.deepEqual(
        last.entries.map(entry => entry.identity.eventId),
        ['e5'],
      )
      assert.equal(last.next, null)
    },
  },
  {
    name: 'a disposition is kept, and the unresolved filter leaves resolved and superseded out',
    async run(create) {
      const store = await create()
      committed(await store.accept(T1, command('done-one')))
      committed(await store.accept(T1, command('open-one')))
      committed(await store.accept(T1, command('old', { replaceKey: 'k' })))
      committed(await store.accept(T1, command('new', { replaceKey: 'k' }, 3)))
      const ref = { recipient: PERSON, identity: command('done-one').request.identity }
      const marked = committed(await store.mark(T1, { ref, operation: 'done', now: at(4) }))
      assert.deepEqual(marked, {
        kind: 'applied',
        marks: { ...UNMARKED, resolved: { how: 'done', at: at(4) } },
      })
      assert.deepEqual(
        committed(await store.mark(T1, { ref, operation: 'done', now: at(5) })).kind,
        'recalled',
      )
      const open = value(
        await store.box(T1, { recipient: PERSON, filter: 'unresolved', after: null, limit: 10 }),
      )
      assert.deepEqual(
        open.entries.map(entry => entry.identity.eventId),
        ['open-one', 'new'],
      )
      const all = value(
        await store.box(T1, { recipient: PERSON, filter: 'all', after: null, limit: 10 }),
      )
      assert.equal(all.entries.length, 4)
    },
  },
  {
    name: 'a replace key supersedes every earlier notification under it in the accepting commit',
    async run(create) {
      const store = await create()
      const old = { recipient: PERSON, identity: command('old').request.identity }
      committed(await store.accept(T1, command('old', { replaceKey: 'k' })))
      committed(await store.mark(T1, { ref: old, operation: 'done', now: at(2) }))
      committed(await store.accept(T1, command('new', { replaceKey: 'k' }, 3)))
      const view = value(await store.notification(T1, old))
      assert.deepEqual(view?.marks.supersededBy, command('new').request.identity)
      const restore = committed(
        await store.mark(T1, { ref: old, operation: 'restore', now: at(4) }),
      )
      assert.deepEqual(restore, { kind: 'refused', reason: 'superseded' })
    },
  },
  {
    name: 'a subscription is written only against the one the decision was made on',
    async run(create) {
      const store = await create()
      const key = subscriptionOf('a1')
      const first = {
        ...key,
        level: 'strong',
        note: null,
        term: { kind: 'standing' },
        basis: { kind: 'owner' },
        expired: false,
      } as const
      assert.deepEqual(
        committed(
          await store.subscribe(T1, { defaults: DEFAULTS, key, expected: null, next: first }),
        ),
        {
          kind: 'written',
        },
      )
      const weak = { ...first, level: 'weak' } as const
      assert.deepEqual(
        committed(
          await store.subscribe(T1, { defaults: DEFAULTS, key, expected: null, next: weak }),
        ),
        {
          kind: 'stale',
        },
      )
      assert.deepEqual(value(await store.subscription(T1, key)), first)
      assert.deepEqual(
        committed(
          await store.subscribe(T1, { defaults: DEFAULTS, key, expected: first, next: weak }),
        ),
        {
          kind: 'written',
        },
      )
      assert.deepEqual(value(await store.subscriptions(T1, key.recipient)), [weak])
      assert.deepEqual(value(await store.subscriptions(T2, key.recipient)), [])
      assert.deepEqual(
        committed(
          await store.subscribe(T1, { defaults: DEFAULTS, key, expected: first, next: null }),
        ),
        {
          kind: 'stale',
        },
      )
      assert.deepEqual(
        committed(
          await store.subscribe(T1, { defaults: DEFAULTS, key, expected: weak, next: null }),
        ),
        {
          kind: 'written',
        },
      )
      assert.equal(value(await store.subscription(T1, key)), null)
    },
  },
  {
    name: 'one send reaches forty subscribed recipients in one commit',
    async run(create) {
      const store = await create()
      const refs = Array.from(
        { length: 40 },
        (_, index) => `agent-${String(index).padStart(2, '0')}`,
      )
      for (const ref of refs) {
        const key = subscriptionOf(ref)
        const next = {
          ...key,
          level: 'strong',
          note: null,
          term: { kind: 'standing' },
          basis: { kind: 'owner' },
          expired: false,
        } as const
        committed(await store.subscribe(T1, { defaults: DEFAULTS, key, expected: null, next }))
      }
      const result = committed(await store.accept(T1, command('big')))
      assert.equal(result.kind, 'accepted')
      const view = value(await store.send(T1, command('big').request.identity))
      assert.equal(view?.notifications.length, 41)
      for (const ref of refs) {
        const page = value(
          await store.box(T1, {
            recipient: { kind: 'agent', ref },
            filter: 'all',
            after: null,
            limit: 5,
          }),
        )
        assert.deepEqual(
          page.entries.map(entry => [entry.level, entry.cause.kind]),
          [['strong', 'subscription']],
        )
      }
    },
  },
  {
    name: 'a beat is kept per recipient and per tenant',
    async run(create) {
      const store = await create()
      assert.deepEqual(value(await store.beat(T1, PERSON)), { kind: 'default' })
      committed(
        await store.setBeat(T1, { recipient: PERSON, beat: { kind: 'every', minutes: 30 } }),
      )
      assert.deepEqual(value(await store.beat(T1, PERSON)), { kind: 'every', minutes: 30 })
      assert.deepEqual(value(await store.beat(T1, { kind: 'agent', ref: 'a1' })), {
        kind: 'default',
      })
      assert.deepEqual(value(await store.beat(T2, PERSON)), { kind: 'default' })
    },
  },
]
