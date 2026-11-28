import assert from 'node:assert/strict'
import type { TenantId } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import type { EndpointHolding, EndpointName } from './brands.ts'
import type {
  EventRecords,
  Occurrence,
  ReceivedBatch,
  RetentionBounds,
  StoredOccurrence,
  SubscriptionKey,
  SubscriptionRow,
} from './subscriptions.ts'
import { conformanceCase, tenantText, type ConformanceCase } from './testing-case.ts'
import { jsonOf } from './testing-values.ts'

export type EventRecordsFixture = Readonly<{
  records: EventRecords
  tenant: TenantId
  otherTenant: TenantId
}>

export const subscriptionKeyOf = (
  tenant: TenantId,
  name = 'incident.created',
  args = '{}',
): SubscriptionKey => ({
  tenant,
  holding: 'held-desk' as EndpointHolding,
  account: { kind: 'anonymous' },
  name,
  arguments: args,
})

export const sampleSubscription = (revision = 1): SubscriptionRow => ({
  endpoint: 'desk' as EndpointName,
  delivery: 'push',
  arguments: jsonOf({}),
  cursor: null,
  state: 'receiving',
  reason: null,
  subscribers: ['person'],
  revision,
  delivered: 0,
})

export const occurrenceOf = (eventId: string): Occurrence => ({
  eventId,
  name: 'incident.created',
  timestamp: '2026-11-27T22:00:00.000Z',
  data: jsonOf({ id: eventId }),
})

const batchOf = (
  events: readonly Occurrence[],
  cursor: string | null,
  at = '2026-11-27T22:00:00.000Z',
): ReceivedBatch => ({
  events,
  cursor,
  gap: null,
  at,
})

const WIDE: RetentionBounds = { maxEvents: 100, maxAgeMs: 86_400_000 }
const ids = (items: readonly StoredOccurrence[]) =>
  items.map(item => (item.kind === 'event' ? item.eventId : `gap:${item.reason}`))

async function subscribed(fixture: EventRecordsFixture, key = subscriptionKeyOf(fixture.tenant)) {
  assert.deepEqual(
    await fixture.records.write(key, sampleSubscription(), 'absent'),
    succeed('written'),
  )
  return key
}

export function mcpEventRecordsConformance(): readonly ConformanceCase<EventRecordsFixture>[] {
  type F = EventRecordsFixture
  return [
    conformanceCase<F>(
      'ER1',
      'a subscription is written at its revision and listed in its tenant only',
      async f => {
        const key = await subscribed(f)
        assert.deepEqual(
          await f.records.write(key, sampleSubscription(2), 'absent'),
          fail('conflict'),
        )
        assert.deepEqual(await f.records.write(key, sampleSubscription(2), 1), succeed('written'))
        assert.deepEqual(await f.records.read(key), succeed(sampleSubscription(2)))
        assert.deepEqual(
          await f.records.list(f.tenant),
          succeed([{ key, row: sampleSubscription(2) }]),
        )
        assert.deepEqual(await f.records.list(f.otherTenant), succeed([]))
      },
    ),
    conformanceCase<F>(
      'ER2',
      'a batch is stored in one go: each event once, in order, the position moved with it (I12, I13)',
      async f => {
        const key = await subscribed(f)
        const first = await f.records.receive(
          key,
          batchOf([occurrenceOf('a'), occurrenceOf('b')], 'c2'),
          WIDE,
        )
        assert.deepEqual(first, succeed({ stored: 2 }))
        const again = await f.records.receive(
          key,
          batchOf([occurrenceOf('b'), occurrenceOf('c')], 'c3'),
          WIDE,
        )
        assert.deepEqual(again, succeed({ stored: 1 }))
        const read = await f.records.occurrences(key, 0, 10)
        assert.ok('ok' in read)
        assert.deepEqual(ids(read.ok), ['a', 'b', 'c'])
        assert.deepEqual(
          read.ok.map(item => item.seq),
          read.ok.map(item => item.seq).sort((x, y) => x - y),
        )
        assert.deepEqual(
          await f.records.read(key),
          succeed({ ...sampleSubscription(), cursor: 'c3' }),
        )
      },
    ),
    conformanceCase<F>(
      'ER3',
      'a gap the peer reported is stored where it happened; a batch for no subscription is absent',
      async f => {
        const key = await subscribed(f)
        await f.records.receive(key, batchOf([occurrenceOf('a')], 'c1'), WIDE)
        await f.records.receive(
          key,
          { ...batchOf([occurrenceOf('z')], 'c9'), gap: 'peer-truncated' },
          WIDE,
        )
        const read = await f.records.occurrences(key, 0, 10)
        assert.ok('ok' in read)
        assert.deepEqual(ids(read.ok), ['a', 'gap:peer-truncated', 'z'])
        const none = subscriptionKeyOf(f.tenant, 'other.kind')
        assert.deepEqual(
          await f.records.receive(none, batchOf([occurrenceOf('x')], 'c1'), WIDE),
          succeed('absent'),
        )
      },
    ),
    conformanceCase<F>(
      'ER4',
      'more events than the bound drop the oldest, and say so with a gap',
      async f => {
        const key = await subscribed(f)
        const bounds = { maxEvents: 2, maxAgeMs: 86_400_000 }
        await f.records.receive(
          key,
          batchOf([occurrenceOf('a'), occurrenceOf('b'), occurrenceOf('c')], 'c3'),
          bounds,
        )
        const read = await f.records.occurrences(key, 0, 10)
        assert.ok('ok' in read)
        assert.deepEqual(
          ids(read.ok).filter(id => !id.startsWith('gap')),
          ['b', 'c'],
        )
        assert.ok(ids(read.ok).includes('gap:trimmed'))
        const early = { maxEvents: 100, maxAgeMs: 60_000 }
        await f.records.receive(
          key,
          batchOf([occurrenceOf('d')], 'c4', '2026-11-27T23:00:00.000Z'),
          early,
        )
        const later = await f.records.occurrences(key, 0, 10)
        assert.ok('ok' in later)
        assert.deepEqual(
          ids(later.ok).filter(id => !id.startsWith('gap')),
          ['d'],
        )
      },
    ),
    conformanceCase<F>(
      'ER5',
      'events are read after a sequence number, a page at a time',
      async f => {
        const key = await subscribed(f)
        await f.records.receive(key, batchOf(['a', 'b', 'c'].map(occurrenceOf), 'c3'), WIDE)
        const first = await f.records.occurrences(key, 0, 2)
        assert.ok('ok' in first)
        assert.deepEqual(ids(first.ok), ['a', 'b'])
        const rest = await f.records.occurrences(key, first.ok.at(-1)?.seq ?? 0, 2)
        assert.ok('ok' in rest)
        assert.deepEqual(ids(rest.ok), ['c'])
      },
    ),
    ...laterCases(),
  ]
}

function laterCases(): readonly ConformanceCase<EventRecordsFixture>[] {
  type F = EventRecordsFixture
  return [
    conformanceCase<F>(
      'ER6',
      'removing a subscription takes its events with it; a position of none stays none',
      async f => {
        const key = await subscribed(f)
        await f.records.receive(key, batchOf([occurrenceOf('a')], null), WIDE)
        assert.deepEqual(await f.records.read(key), succeed(sampleSubscription()))
        assert.deepEqual(await f.records.remove(key), succeed(true))
        assert.deepEqual(await f.records.read(key), succeed('absent'))
        assert.deepEqual(await f.records.occurrences(key, 0, 10), succeed([]))
      },
    ),
    conformanceCase<F>(
      'ER7',
      'only a batch moves the position: writing the row again keeps the position it got',
      async f => {
        const key = await subscribed(f)
        await f.records.receive(key, batchOf([occurrenceOf('a')], 'c1'), WIDE)
        const moved = { ...sampleSubscription(2), subscribers: ['person', 'notice'], cursor: null }
        assert.deepEqual(await f.records.write(key, moved, 1), succeed('written'))
        assert.deepEqual(await f.records.read(key), succeed({ ...moved, cursor: 'c1' }))
      },
    ),
    conformanceCase<F>(
      'ER8',
      'ending a subscription is one commit: terminated with its reason, a revision on, and its sequence ends with that',
      async f => {
        const key = await subscribed(f)
        await f.records.receive(key, batchOf([occurrenceOf('a')], 'c1'), WIDE)
        const at = '2026-11-27T23:00:00.000Z'
        assert.deepEqual(await f.records.end(key, 'refused', at), succeed('ended'))
        assert.deepEqual(
          await f.records.read(key),
          succeed({
            ...sampleSubscription(2),
            state: 'terminated',
            reason: 'refused',
            cursor: 'c1',
          }),
        )
        const read = await f.records.occurrences(key, 0, 10)
        assert.ok('ok' in read)
        assert.deepEqual(
          read.ok.map(item => item.kind),
          ['event', 'ended'],
        )
        assert.deepEqual(read.ok.at(-1), {
          seq: read.ok.at(-1)?.seq,
          kind: 'ended',
          receivedAt: at,
          reason: 'refused',
        })
        const none = subscriptionKeyOf(f.tenant, 'other.kind')
        assert.deepEqual(await f.records.end(none, 'refused', at), succeed('absent'))
      },
    ),
    conformanceCase<F>(
      'ER9',
      'the delivered mark moves only forward, and writing the row keeps it',
      async f => {
        const key = await subscribed(f)
        assert.deepEqual(await f.records.acknowledge(key, 3), succeed(true))
        assert.deepEqual(await f.records.acknowledge(key, 2), succeed(true))
        assert.deepEqual(await f.records.write(key, sampleSubscription(2), 1), succeed('written'))
        assert.deepEqual(
          await f.records.read(key),
          succeed({ ...sampleSubscription(2), delivered: 3 }),
        )
      },
    ),
  ]
}

export type MemoryEventRecords = EventRecords & Readonly<{ setUnavailable(down: boolean): void }>

const keyText = (key: SubscriptionKey) =>
  JSON.stringify([
    tenantText(key.tenant),
    key.holding,
    JSON.stringify(key.account),
    key.name,
    key.arguments,
  ])

export function createMemoryEventRecords(): MemoryEventRecords {
  const rows = new Map<string, { key: SubscriptionKey; row: SubscriptionRow }>()
  const stored = new Map<string, StoredOccurrence[]>()
  let seq = 0
  let down = false
  const away = () => Promise.resolve(fail('unavailable' as const))
  return {
    async list(tenant) {
      if (down) return away()
      return succeed(
        [...rows.values()].filter(entry => tenantText(entry.key.tenant) === tenantText(tenant)),
      )
    },
    async read(key) {
      if (down) return away()
      return succeed(rows.get(keyText(key))?.row ?? 'absent')
    },
    async write(key, row, expected) {
      if (down) return away()
      const current = rows.get(keyText(key))?.row.revision ?? 'absent'
      if (current !== expected) return fail('conflict')
      const kept = rows.get(keyText(key))?.row
      const cursor = kept?.cursor ?? row.cursor
      rows.set(keyText(key), { key, row: { ...row, cursor, delivered: kept?.delivered ?? 0 } })
      return succeed('written')
    },
    async remove(key) {
      if (down) return away()
      rows.delete(keyText(key))
      stored.delete(keyText(key))
      return succeed(true)
    },
    async receive(key, batch, bounds) {
      if (down) return away()
      const entry = rows.get(keyText(key))
      if (entry === undefined) return succeed('absent')
      const items = stored.get(keyText(key)) ?? []
      if (batch.gap !== null)
        items.push({ seq: (seq += 1), kind: 'gap', receivedAt: batch.at, reason: batch.gap })
      let count = 0
      for (const event of batch.events) {
        if (items.some(item => item.kind === 'event' && item.eventId === event.eventId)) continue
        items.push({ seq: (seq += 1), kind: 'event', receivedAt: batch.at, ...event })
        count += 1
      }
      const floor = Date.parse(batch.at) - bounds.maxAgeMs
      const events = items.filter(item => item.kind === 'event')
      const old = events.filter(item => Date.parse(item.receivedAt) < floor)
      const over = events.length - old.length - bounds.maxEvents
      const dropped = new Set<StoredOccurrence>([
        ...old,
        ...events.filter(item => !old.includes(item)).slice(0, Math.max(0, over)),
      ])
      const kept = items.filter(item => !dropped.has(item))
      if (dropped.size > 0)
        kept.push({ seq: (seq += 1), kind: 'gap', receivedAt: batch.at, reason: 'trimmed' })
      stored.set(keyText(key), kept)
      if (batch.cursor !== null)
        rows.set(keyText(key), { key, row: { ...entry.row, cursor: batch.cursor } })
      return succeed({ stored: count })
    },
    async end(key, reason, at) {
      if (down) return away()
      const entry = rows.get(keyText(key))
      if (entry === undefined) return succeed('absent')
      const items = stored.get(keyText(key)) ?? []
      items.push({ seq: (seq += 1), kind: 'ended', receivedAt: at, reason })
      stored.set(keyText(key), items)
      const row = {
        ...entry.row,
        state: 'terminated' as const,
        reason,
        revision: entry.row.revision + 1,
      }
      rows.set(keyText(key), { key, row })
      return succeed('ended')
    },
    async acknowledge(key, through) {
      if (down) return away()
      const entry = rows.get(keyText(key))
      if (entry !== undefined && through > entry.row.delivered)
        rows.set(keyText(key), { key, row: { ...entry.row, delivered: through } })
      return succeed(true)
    },
    async occurrences(key, after, limit) {
      if (down) return away()
      return succeed(
        (stored.get(keyText(key)) ?? []).filter(item => item.seq > after).slice(0, limit),
      )
    },
    setUnavailable: value => {
      down = value
    },
  }
}
