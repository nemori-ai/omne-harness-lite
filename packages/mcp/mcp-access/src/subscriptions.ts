import type { JsonValue } from '@omne-harness/json-text'
import type { Principal } from '@omne-harness/access-cordis-contract'
import type { Access } from '@omne-harness/legal-identity'
import type {
  EndpointRef,
  GapReason,
  Millis,
  ReadFailure,
  StoredOccurrence,
  SubscriptionView,
  TerminationReason,
} from '@omne-harness/mcp-contract'
import { parseInstant, type Instant } from '@omne-harness/utc-instant'
import type { McpFaces } from './ports.ts'

type Subscriptions = NonNullable<McpFaces['subscriptions']>
type JsonObject = Extract<JsonValue, { readonly kind: 'object' }>

export type Named = Readonly<{
  event: string
  arguments: JsonObject
  subscriber: string
  connectBound: Millis
}>

const UNAVAILABLE = { outcome: 'basis-unavailable' } as const
const NOT_VISIBLE = { outcome: 'not-visible', body: {} } as const
const EMPTY: JsonObject = { kind: 'object', entries: [] }

const objectOf = (value: JsonValue): JsonObject => (value.kind === 'object' ? value : EMPTY)

const subscriptionOf = (view: SubscriptionView) => ({
  name: view.name,
  arguments: objectOf(view.arguments),
  delivery: view.delivery,
  state: view.state,
  reason: view.reason,
  subscribers: view.subscribers,
})

type Item =
  | Readonly<{ seq: number; receivedAt: Instant; kind: 'gap'; reason: GapReason }>
  | Readonly<{ seq: number; receivedAt: Instant; kind: 'ended'; reason: TerminationReason }>
  | Readonly<{
      seq: number
      receivedAt: Instant
      kind: 'event'
      eventId: string
      name: string
      timestamp: string
      data: JsonValue
    }>

function itemOf(item: StoredOccurrence): readonly Item[] {
  const parsed = parseInstant(item.receivedAt)
  if (!parsed.ok) return []
  const receivedAt = parsed.value
  if (item.kind === 'gap') return [{ seq: item.seq, receivedAt, kind: 'gap', reason: item.reason }]
  if (item.kind === 'ended')
    return [{ seq: item.seq, receivedAt, kind: 'ended', reason: item.reason }]
  const { seq, eventId, name, timestamp, data } = item
  return [{ seq, receivedAt, kind: 'event', eventId, name, timestamp, data }]
}

/** A face that refuses as mcp/v1 says it: not for the asker is not visible, the rest is unavailable. */
const refusedOf = (failure: ReadFailure) =>
  failure.kind === 'not-available-to-you' ? NOT_VISIBLE : UNAVAILABLE

const requestOf = (named: Named) => ({
  name: named.event,
  arguments: named.arguments,
  subscriber: named.subscriber,
  connectBound: named.connectBound,
})

/** The asker becomes a subscriber; an answer not known is read back with `read-events`. */
export async function subscribeOn(
  subscriptions: Subscriptions | undefined,
  access: Access<Principal>,
  ref: EndpointRef,
  named: Named,
) {
  if (subscriptions === undefined) return UNAVAILABLE
  try {
    const made = await subscriptions.subscribe(access, ref, requestOf(named))
    if ('ok' in made)
      return { outcome: 'succeeded', body: { subscription: subscriptionOf(made.ok) } } as const
    if (made.failure.kind === 'not-subscribable')
      return { outcome: 'unsupported', body: { reason: made.failure.reason } } as const
    return made.failure.kind === 'unknown'
      ? ({ outcome: 'unknown' } as const)
      : refusedOf(made.failure)
  } catch {
    return { outcome: 'unknown' } as const
  }
}

export async function unsubscribeOn(
  subscriptions: Subscriptions | undefined,
  access: Access<Principal>,
  ref: EndpointRef,
  named: Named,
) {
  if (subscriptions === undefined) return UNAVAILABLE
  try {
    const left = await subscriptions.unsubscribe(access, ref, requestOf(named))
    if ('ok' in left) return { outcome: 'succeeded', body: { unsubscribed: left.ok } } as const
    return left.failure.kind === 'unknown'
      ? ({ outcome: 'unknown' } as const)
      : refusedOf(left.failure)
  } catch {
    return { outcome: 'unknown' } as const
  }
}

export async function readEventsOn(
  subscriptions: Subscriptions | undefined,
  access: Access<Principal>,
  ref: EndpointRef,
  named: Named & Readonly<{ after: number; limit: number }>,
) {
  if (subscriptions === undefined) return UNAVAILABLE
  try {
    const read = await subscriptions.read(access, ref, {
      name: named.event,
      arguments: named.arguments,
      after: named.after,
      limit: named.limit,
      connectBound: named.connectBound,
    })
    if ('failure' in read)
      return read.failure.kind === 'not-subscribed'
        ? ({ outcome: 'not-found', body: {} } as const)
        : refusedOf(read.failure)
    const subscription = subscriptionOf(read.ok.subscription)
    return {
      outcome: 'succeeded',
      body: { subscription, items: read.ok.items.flatMap(itemOf) },
    } as const
  } catch {
    return UNAVAILABLE
  }
}
