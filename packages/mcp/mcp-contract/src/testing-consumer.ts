import assert from 'node:assert/strict'
import type { TenantId } from '@omne-harness/legal-identity'
import type { EndpointHolding, EndpointName } from './brands.ts'
import type { ConsumerAnswer, EventConsumer, Occurrence, SubscriptionRef } from './subscriptions.ts'
import { conformanceCase, tenantText, type ConformanceCase } from './testing-case.ts'
import { jsonOf } from './testing-values.ts'

export type EventConsumerFixture = Readonly<{
  consumer: EventConsumer
  tenant: TenantId
  /** The identifiers of the events the consumer keeps for a subscription, in the order it keeps them. */
  kept(ref: SubscriptionRef): Promise<readonly string[]>
}>

export const subscriptionRefOf = (
  tenant: TenantId,
  name = 'incident.created',
): SubscriptionRef => ({
  tenant,
  holding: 'held-desk' as EndpointHolding,
  endpoint: 'desk' as EndpointName,
  name,
  arguments: '{}',
  subscribers: ['person:alice'],
})

const handed = (seq: number, eventId: string): Occurrence & Readonly<{ seq: number }> => ({
  seq,
  eventId,
  name: 'incident.created',
  timestamp: '2026-11-27T22:00:00.000Z',
  data: jsonOf({ id: eventId }),
})

const ANSWERS: readonly ConsumerAnswer[] = ['accepted', 'not-now', 'unknown']

export function mcpEventConsumerConformance(): readonly ConformanceCase<EventConsumerFixture>[] {
  type F = EventConsumerFixture
  return [
    conformanceCase<F>('EC1', 'a batch the consumer says it took is kept, in order', async f => {
      const ref = subscriptionRefOf(f.tenant)
      assert.equal(await f.consumer.deliver(ref, [handed(1, 'a'), handed(2, 'b')]), 'accepted')
      assert.deepEqual(await f.kept(ref), ['a', 'b'])
    }),
    conformanceCase<F>(
      'EC2',
      'an event handed over again with the same identifier is kept once, and one of another subscription is apart',
      async f => {
        const ref = subscriptionRefOf(f.tenant)
        const other = subscriptionRefOf(f.tenant, 'incident.closed')
        await f.consumer.deliver(ref, [handed(1, 'a')])
        assert.equal(await f.consumer.deliver(ref, [handed(1, 'a'), handed(2, 'b')]), 'accepted')
        await f.consumer.deliver(other, [handed(1, 'a')])
        assert.deepEqual(await f.kept(ref), ['a', 'b'])
        assert.deepEqual(await f.kept(other), ['a'])
      },
    ),
    conformanceCase<F>('EC3', 'a gap and an end are answered, not thrown', async f => {
      const ref = subscriptionRefOf(f.tenant)
      const gap = await f.consumer.report(ref, { kind: 'gap', seq: 1, reason: 'trimmed' })
      const end = await f.consumer.report(ref, { kind: 'terminated', seq: 2, reason: 'refused' })
      assert.ok(ANSWERS.includes(gap) && ANSWERS.includes(end))
    }),
  ]
}

export type MemoryEventConsumer = EventConsumer &
  Readonly<{ kept(ref: SubscriptionRef): Promise<readonly string[]> }>

/** A consumer that keeps one of each identifier per subscription, as every consumer must. */
export function createMemoryEventConsumer(): MemoryEventConsumer {
  const kept = new Map<string, string[]>()
  const textOf = (ref: SubscriptionRef) =>
    JSON.stringify([tenantText(ref.tenant), ref.holding, ref.name, ref.arguments])
  return {
    async deliver(ref, events) {
      const ids = kept.get(textOf(ref)) ?? []
      for (const event of events) if (!ids.includes(event.eventId)) ids.push(event.eventId)
      kept.set(textOf(ref), ids)
      return 'accepted'
    },
    async report() {
      return 'accepted'
    },
    kept: async ref => [...(kept.get(textOf(ref)) ?? [])],
  }
}
