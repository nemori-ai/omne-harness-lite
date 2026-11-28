import { fail } from '@omne-harness/operation-result'
import type {
  ConsumerAnswer,
  EventConsumer,
  EventRecords,
  StoredOccurrence,
  SubscriptionKey,
  SubscriptionRef,
  SubscriptionRow,
} from '@omne-harness/mcp-contract/provider'
import { coalesced, type Pause } from './follow.ts'
import { ask } from './port.ts'

export type DeliveryDependencies = Readonly<{
  key: SubscriptionKey
  records: EventRecords
  consumer: EventConsumer
  pause: Pause
  backoffCapMs: number
  signal: AbortSignal
}>

const PAGE = 50

const refOf = (key: SubscriptionKey, row: SubscriptionRow): SubscriptionRef => ({
  tenant: key.tenant,
  holding: key.holding,
  endpoint: row.endpoint,
  name: key.name,
  arguments: key.arguments,
  subscribers: row.subscribers,
})

type Handed = Readonly<{ through: number; answer: ConsumerAnswer }>

const answered = (call: () => Promise<ConsumerAnswer>) =>
  call().then(
    answer => answer,
    () => 'unknown' as const,
  )

/** Hands the items over in their order: a run of events at once, a gap or the end each alone; stops at the first not taken. */
async function handOver(
  consumer: EventConsumer,
  ref: SubscriptionRef,
  items: readonly StoredOccurrence[],
): Promise<Handed> {
  let through = 0
  for (let at = 0; at < items.length;) {
    const item = items[at]
    if (item === undefined) break
    if (item.kind === 'event') {
      const run: Extract<StoredOccurrence, { kind: 'event' }>[] = []
      for (let next = items[at]; next?.kind === 'event'; next = items[at]) {
        run.push(next)
        at += 1
      }
      const events = run.map(({ seq, eventId, name, timestamp, data }) => ({
        seq,
        eventId,
        name,
        timestamp,
        data,
      }))
      const answer = await answered(() => consumer.deliver(ref, events))
      if (answer !== 'accepted') return { through, answer }
      through = run.at(-1)?.seq ?? through
      continue
    }
    const notice =
      item.kind === 'gap'
        ? ({ kind: 'gap', seq: item.seq, reason: item.reason } as const)
        : ({ kind: 'terminated', seq: item.seq, reason: item.reason } as const)
    const answer = await answered(() => consumer.report(ref, notice))
    if (answer !== 'accepted') return { through, answer }
    through = item.seq
    at += 1
  }
  return { through, answer: 'accepted' }
}

/** Keeps the consumer caught up with one subscription: what it did not take is handed over again, with the same identifiers. */
export function createDelivery(deps: DeliveryDependencies): () => void {
  const { key, records, consumer, pause, backoffCapMs, signal } = deps
  async function catchUp(): Promise<void> {
    for (let attempt = 0; !signal.aborted;) {
      const read = await ask(() => records.read(key), fail('unavailable' as const))
      if ('failure' in read || read.ok === 'absent') return
      const row = read.ok
      const page = await ask(
        () => records.occurrences(key, row.delivered, PAGE),
        fail('unavailable' as const),
      )
      if ('failure' in page || page.ok.length === 0) return
      const handed = await handOver(consumer, refOf(key, row), page.ok)
      const marked =
        handed.through > row.delivered
          ? await ask(() => records.acknowledge(key, handed.through), fail('unavailable' as const))
          : { ok: true }
      if (handed.answer === 'accepted' && 'ok' in marked) {
        attempt = 0
        continue
      }
      await pause(Math.min(250 * 2 ** attempt, backoffCapMs))
      attempt += 1
    }
  }
  return coalesced(catchUp)
}

export type Deliveries = Readonly<{
  nudge(text: string, key: SubscriptionKey, records: EventRecords, backoffCapMs: number): void
  forget(text: string): void
  close(): void
}>

/** One delivery loop per subscription, while there is a consumer; none at all without one. */
export function createDeliveries(consumer: EventConsumer | undefined, pause: Pause): Deliveries {
  const loops = new Map<string, () => void>()
  const closing = new AbortController()
  return {
    nudge(text, key, records, backoffCapMs) {
      if (consumer === undefined || closing.signal.aborted) return
      const loop =
        loops.get(text) ??
        createDelivery({ key, records, consumer, pause, backoffCapMs, signal: closing.signal })
      loops.set(text, loop)
      loop()
    },
    forget: text => {
      loops.delete(text)
    },
    close() {
      closing.abort()
      loops.clear()
    },
  }
}
