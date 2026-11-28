import { afterEach, describe, expect, it } from 'vitest'
import type {
  ConsumerAnswer,
  ConsumerNotice,
  EventConsumer,
  SubscriptionRef,
} from '@omne-harness/mcp-contract/provider'
import { jsonOf } from '@omne-harness/mcp-contract/testing'
import { alice, home } from './doubles/identities.ts'
import { desk, eventOf, eventWorld, offering, settle, typeOf } from './doubles/events.ts'

type World = ReturnType<typeof eventWorld>
type Heard =
  | Readonly<{ kind: 'deliver'; ref: SubscriptionRef; ids: readonly string[] }>
  | Readonly<{ kind: 'report'; ref: SubscriptionRef; notice: ConsumerNotice }>

const opened: World[] = []
afterEach(async () => {
  await Promise.all(opened.splice(0).map(each => each.services.connections.closeAll()))
})

const created = { name: 'incident.created', arguments: jsonOf({}), subscriber: 'alice' }
const script = [
  { discover: offering },
  { listEventTypes: { events: [typeOf('incident.created')] } },
] as const

/** A consumer that answers in turn from `answer`, and writes down what it was handed. */
function consumerOf(answer: (call: number) => ConsumerAnswer = () => 'accepted') {
  const heard: Heard[] = []
  const consumer: EventConsumer = {
    async deliver(ref, events) {
      heard.push({ kind: 'deliver', ref, ids: events.map(event => event.eventId) })
      return answer(heard.length)
    },
    async report(ref, notice) {
      heard.push({ kind: 'report', ref, notice })
      return answer(heard.length)
    },
  }
  return { consumer, heard }
}

const delivered = (heard: readonly Heard[]) =>
  heard.flatMap(item => (item.kind === 'deliver' ? item.ids : []))

function arranged(consumer: EventConsumer, records?: World['records']) {
  const made = eventWorld({ script, consumer, ...(records === undefined ? {} : { records }) })
  opened.push(made)
  return made
}

describe('kept events are handed to the consumer (C306, MC-37)', () => {
  it('each event comes with its subscription and its identifier, in order, once it is kept, and is marked taken', async () => {
    const { consumer, heard } = consumerOf()
    const made = arranged(consumer)
    await made.services.subscriptions.subscribe(alice, desk, created)
    await settle()
    made.streams[0]?.send({ kind: 'event', event: eventOf('a'), cursor: 'c1' })
    made.streams[0]?.send({ kind: 'event', event: eventOf('b'), cursor: 'c2' })
    await settle()
    expect(delivered(heard)).toEqual(['a', 'b'])
    expect(heard[0]?.ref).toEqual({
      tenant: home,
      holding: desk.holding,
      endpoint: 'desk',
      name: 'incident.created',
      arguments: '{}',
      subscribers: ['alice'],
    })
    const rows = await made.records.list(home)
    expect('ok' in rows && rows.ok[0]?.row.delivered).toBe(2)
  })

  it('a consumer that cannot take them now leaves them kept; they come again later with the same identifiers', async () => {
    const { consumer, heard } = consumerOf(call => (call === 1 ? 'not-now' : 'accepted'))
    const made = arranged(consumer)
    await made.services.subscriptions.subscribe(alice, desk, created)
    await settle()
    made.streams[0]?.send({ kind: 'event', event: eventOf('a'), cursor: 'c1' })
    await settle()
    await settle()
    expect(heard.map(item => item.kind === 'deliver' && item.ids)).toEqual([['a'], ['a']])
    expect(made.pauses.length).toBeGreaterThanOrEqual(1)
  })

  it('after a restart, what the consumer did not take is handed over again with the same identifiers, and what it took is not', async () => {
    const first = consumerOf(call => (call === 1 ? 'accepted' : 'unknown'))
    const before = arranged(first.consumer)
    await before.services.subscriptions.subscribe(alice, desk, created)
    await settle()
    before.streams[0]?.send({ kind: 'event', event: eventOf('a'), cursor: 'c1' })
    await settle()
    before.streams[0]?.send({ kind: 'event', event: eventOf('b'), cursor: 'c2' })
    await settle()
    expect(delivered(first.heard).slice(0, 2)).toEqual(['a', 'b'])
    await before.services.connections.closeAll()
    const second = consumerOf()
    const after = eventWorld({
      script: [{ discover: offering }],
      records: before.records,
      eventStore: before.eventStore,
      consumer: second.consumer,
    })
    opened.push(after)
    await after.services.subscriptions.read(alice, desk, { ...created, after: 0, limit: 10 })
    await settle()
    expect(delivered(second.heard)).toEqual(['b'])
  })

  it('a gap and the end are reported, each after what came before it', async () => {
    const { consumer, heard } = consumerOf()
    const made = arranged(consumer)
    await made.services.subscriptions.subscribe(alice, desk, created)
    await settle()
    made.streams[0]?.send({ kind: 'active', cursor: 'c0', truncated: true, heartbeatMs: 0 })
    made.streams[0]?.send({ kind: 'event', event: eventOf('x'), cursor: 'c1' })
    await settle()
    // The end comes while nothing is being handed over: it is handed over on its own.
    made.streams[0]?.send({ kind: 'terminated', code: -32024, data: null })
    await settle()
    expect(
      heard.map(item =>
        item.kind === 'deliver' ? item.ids.join() : `${item.notice.kind}:${item.notice.reason}`,
      ),
    ).toEqual(['gap:peer-truncated', 'x', 'terminated:refused'])
  })
})
