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
  unitId,
  type DestinationRef,
  type SendRequest,
  type SubscriptionKey,
} from '@omne-harness/notification-contract'
import type { NotificationStore, StoreAnswer } from '../store.ts'
import type { AcceptCommand } from '../transactions/accept.ts'
import {
  BUILTIN_ID,
  type DestinationCommand,
  type RecipientDefaults,
} from '../transactions/destinations.ts'

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

const MINUTE = 60_000
const INBOX: DestinationRef = { recipient: PERSON, id: BUILTIN_ID }
const MAIL = channelNameSchema.parse('mail')
const SOURCE = sourceNameSchema.parse('demo.things')
const TYPE = eventTypeNameSchema.parse('changed')
const FORM = {
  destination: INBOX,
  minIntervalMs: 0,
  listLimit: 3,
  disclosure: { kind: 'full' },
  defaults: DEFAULTS,
} as const
type DestinationInput = DestinationCommand extends infer C
  ? C extends unknown
    ? Omit<C, 'defaults'>
    : never
  : never

const strong = (eventId: string, minute = 1): AcceptCommand => ({
  ...command(eventId, {}, minute),
  type: { defaults: { person: 'strong', agent: 'off' }, external: false },
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
  {
    name: 'a strong unit takes everything pending once and never the same notification twice',
    async run(create) {
      const store = await create()
      const form = (minute: number, destination = INBOX) =>
        store.formStrong(T1, { ...FORM, destination, now: at(minute), minIntervalMs: 10 * MINUTE })
      committed(await store.accept(T1, strong('s1')))
      committed(await store.accept(T1, strong('s2')))
      const first = committed(await form(2))
      assert.equal(first.kind, 'formed')
      if (first.kind !== 'formed') return
      assert.equal(first.unit.id, unitId(INBOX, 'strong', 1))
      assert.equal(first.unit.kind, 'strong')
      assert.deepEqual(
        first.unit.members.map(member => member.eventId),
        ['s1', 's2'],
      )
      assert.equal(first.unit.body.kind, 'digest')
      const due = value(await store.delivery(T1, at(2))).due
      assert.deepEqual(
        due.map(unit => [unit.id, unit.state, unit.attempts]),
        [[first.unit.id, 'pending', 0]],
      )
      const [inbox] = value(await store.destinations(T1, PERSON))
      assert.deepEqual(
        [
          inbox?.builtin,
          inbox?.enabled,
          inbox?.blockedSince,
          inbox?.lastStrongAt,
          inbox?.strongUnits,
        ],
        [true, true, null, at(2), 1],
      )
      assert.deepEqual(committed(await form(3)), { kind: 'nothing' })
      committed(await store.accept(T1, strong('s3', 4)))
      assert.deepEqual(committed(await form(5)), { kind: 'wait', until: at(12) })
      const second = committed(await form(12))
      assert.deepEqual(
        second.kind === 'formed' && second.unit.members.map(member => member.eventId),
        ['s3'],
      )
      assert.deepEqual(second.kind === 'formed' && second.unit.body.kind, 'single')
      assert.deepEqual(committed(await form(40)), { kind: 'nothing' })
      assert.deepEqual(committed(await form(40, { recipient: PERSON, id: 'nope' })), {
        kind: 'nothing',
      })
    },
  },
  {
    name: 'only an unresolved strong notification that did not quietly replace another is pending for a strong unit',
    async run(create) {
      const store = await create()
      const mark = (eventId: string, operation: 'done' | 'dismiss') => {
        const ref = { recipient: PERSON, identity: command(eventId).request.identity }
        return store.mark(T1, { ref, operation, now: at(3) })
      }
      committed(await store.accept(T1, command('weak')))
      const keyed = (eventId: string, key: string, minute: number): AcceptCommand => ({
        ...strong(eventId, minute),
        request: request(eventId, { replaceKey: key }),
      })
      committed(await store.accept(T1, keyed('replaced', 'k', 1)))
      committed(await store.accept(T1, keyed('quiet', 'k', 2)))
      committed(await store.accept(T1, keyed('older', 'r', 1)))
      const loud = request('loud', { replaceKey: 'r', renotify: true })
      committed(await store.accept(T1, { ...strong('loud', 2), request: loud }))
      committed(await store.accept(T1, strong('done')))
      committed(await store.accept(T1, strong('dismissed')))
      committed(await store.accept(T1, strong('live')))
      committed(await mark('done', 'done'))
      committed(await mark('dismissed', 'dismiss'))
      const pending = value(await store.pendingStrong(T1, INBOX))
      assert.deepEqual(
        pending.map(entry => entry.identity.eventId),
        ['loud', 'live'],
      )
      const open = value(await store.unresolved(T1, PERSON))
      assert.deepEqual(
        open.map(entry => entry.identity.eventId),
        ['weak', 'quiet', 'loud', 'live'],
      )
      assert.deepEqual(value(await store.pendingStrong(T1, { recipient: PERSON, id: 'nope' })), [])
      assert.deepEqual(value(await store.pendingStrong(T2, INBOX)), [])
    },
  },
  {
    name: 'a beat unit is formed once per slot and never empty',
    async run(create) {
      const store = await create()
      const form = (index: number, minute: number, destination = INBOX) =>
        store.formBeat(T1, {
          destination,
          slot: { index, start: at(minute) },
          now: at(minute),
          listLimit: 3,
          standingOpen: 0,
          defaults: DEFAULTS,
        })
      committed(await store.accept(T1, command('w1')))
      const first = committed(await form(7, 30))
      assert.equal(first.kind, 'formed')
      if (first.kind !== 'formed') return
      assert.deepEqual([first.unit.kind, first.unit.id], ['beat', unitId(INBOX, 'beat', 7)])
      assert.deepEqual(
        first.unit.members.map(member => member.eventId),
        ['w1'],
      )
      assert.deepEqual(committed(await form(7, 31)), { kind: 'recalled', unit: first.unit })
      const ref = { recipient: PERSON, identity: command('w1').request.identity }
      committed(await store.mark(T1, { ref, operation: 'seen', now: at(32) }))
      assert.deepEqual(committed(await form(8, 60)), { kind: 'nothing' })
      assert.deepEqual(committed(await form(9, 90, { recipient: PERSON, id: 'nope' })), {
        kind: 'nothing',
      })
      assert.equal(value(await store.delivery(T1, at(90))).due.length, 1)
    },
  },
  {
    name: 'a standing item is reminded of once, at every enabled destination',
    async run(create) {
      const store = await create()
      const mail = { recipient: PERSON, channel: MAIL, address: 'a', minLevel: 'strong' } as const
      const added = committed(
        await store.destination(T1, { kind: 'add', ...mail, defaults: DEFAULTS }),
      )
      assert.equal(added.kind, 'written')
      if (added.kind !== 'written') return
      const ref = { recipient: PERSON, id: added.destination.id }
      committed(
        await store.destination(T1, {
          kind: 'change',
          ref,
          patch: { enabled: false },
          defaults: DEFAULTS,
        }),
      )
      const item = {
        id: 'i1',
        source: SOURCE,
        type: TYPE,
        subject: null,
        title: 'Open',
        locator: null,
        since: at(0),
      }
      const units = committed(
        await store.remind(T1, { recipient: PERSON, item, defaults: DEFAULTS, now: at(1) }),
      )
      assert.deepEqual(
        units.map(unit => [unit.kind, unit.destination.id, unit.members.length, unit.id]),
        [['standing', 'default', 0, unitId(INBOX, 'standing', 'i1')]],
      )
      assert.deepEqual(units[0]?.body, { kind: 'standing', item })
      assert.deepEqual(value(await store.reminded(T1, PERSON)), ['i1'])
      assert.deepEqual(
        committed(
          await store.remind(T1, { recipient: PERSON, item, defaults: DEFAULTS, now: at(2) }),
        ),
        [],
      )
      assert.deepEqual(value(await store.reminded(T1, { kind: 'agent', ref: 'a1' })), [])
      assert.deepEqual(value(await store.reminded(T2, PERSON)), [])
    },
  },
  {
    name: 'a delivery result settles, retries or stops a unit, and blocks or unblocks its destination',
    async run(create) {
      const store = await create()
      const policy = { maxAttempts: 2, backoffMs: [MINUTE] }
      const record = (unit: string, kind: 'unknown' | 'delivered', minute: number) =>
        store.recordDelivery(T1, { unit, result: { kind }, policy, now: at(minute) })
      const blocked = async () => value(await store.destinations(T1, PERSON))[0]?.blockedSince
      const dueAt = async (minute: number) =>
        value(await store.delivery(T1, at(minute))).due.map(unit => [unit.id, unit.attempts])
      committed(await store.accept(T1, strong('s1')))
      const formed = committed(await store.formStrong(T1, { ...FORM, now: at(2) }))
      if (formed.kind !== 'formed') throw new Error(formed.kind)
      const unit = formed.unit.id
      assert.deepEqual(committed(await record('nope', 'unknown', 2)), { kind: 'not-found' })
      assert.deepEqual(committed(await record(unit, 'unknown', 2)), {
        kind: 'recorded',
        plan: { kind: 'retry', at: at(3) },
      })
      assert.deepEqual(await dueAt(2), [])
      assert.deepEqual(await dueAt(3), [[unit, 1]])
      assert.equal(await blocked(), null)
      assert.deepEqual(committed(await record(unit, 'unknown', 3)), {
        kind: 'recorded',
        plan: { kind: 'stop' },
      })
      assert.deepEqual(await dueAt(60), [])
      assert.equal(await blocked(), at(3))
      committed(await store.accept(T1, strong('s2', 20)))
      const next = committed(await store.formStrong(T1, { ...FORM, now: at(21) }))
      if (next.kind !== 'formed') throw new Error(next.kind)
      committed(await record(next.unit.id, 'unknown', 21))
      assert.equal(await blocked(), at(3))
      assert.deepEqual(committed(await record(next.unit.id, 'delivered', 22)), {
        kind: 'recorded',
        plan: { kind: 'settled' },
      })
      assert.equal(await blocked(), null)
      assert.deepEqual(committed(await record(next.unit.id, 'unknown', 23)), {
        kind: 'settled-before',
      })
      assert.deepEqual(await dueAt(60), [])
      assert.equal(await blocked(), null)
    },
  },
  {
    name: 'a destination exists once per channel and address, and the builtin one cannot be removed',
    async run(create) {
      const store = await create()
      const write = async (command: DestinationInput) =>
        committed(
          await store.destination(T1, { ...command, defaults: DEFAULTS } as DestinationCommand),
        )
      const mail = {
        kind: 'add',
        recipient: PERSON,
        channel: MAIL,
        address: 'a',
        minLevel: 'strong',
      } as const
      const added = await write(mail)
      if (added.kind !== 'written') throw new Error(added.kind)
      const { id, builtin, enabled, blockedSince, minLevel, strongCursor } = added.destination
      assert.deepEqual(
        [builtin, enabled, blockedSince, minLevel, strongCursor],
        [false, true, null, 'strong', 0],
      )
      assert.deepEqual(await write({ ...mail, minLevel: 'weak' }), {
        kind: 'recalled',
        destination: added.destination,
      })
      const pager = await write({ ...mail, channel: channelNameSchema.parse('pager') })
      assert.equal(pager.kind, 'written')
      assert.notEqual(pager.kind === 'written' && pager.destination.id, id)
      const ref = { recipient: PERSON, id }
      const changed = await write({ kind: 'change', ref, patch: { minLevel: 'weak' } })
      assert.deepEqual(changed.kind === 'written' && changed.destination.minLevel, 'weak')
      assert.equal(
        (await write({ kind: 'change', ref, patch: { minLevel: 'weak' } })).kind,
        'recalled',
      )
      const nope = { recipient: PERSON, id: 'nope' }
      assert.deepEqual(await write({ kind: 'change', ref: nope, patch: { enabled: false } }), {
        kind: 'not-found',
      })
      assert.deepEqual(await write({ kind: 'remove', ref: INBOX }), { kind: 'builtin' })
      assert.deepEqual(await write({ kind: 'remove', ref }), { kind: 'removed' })
      assert.deepEqual(await write({ kind: 'remove', ref }), {
        kind: 'recalled',
        destination: null,
      })
      const left = value(await store.destinations(T1, PERSON)).map(
        destination => destination.channel,
      )
      assert.deepEqual(left, ['in-app', 'pager'])
      assert.deepEqual(value(await store.destinations(T2, PERSON)), [])
    },
  },
]
