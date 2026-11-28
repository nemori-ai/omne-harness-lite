import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import type { TenantId } from '@omne-harness/legal-identity'
import type { Ack, Outcome } from '@omne-harness/operation-result'
import type { EndpointHolding, EndpointName } from './brands.ts'
import type { PeerAccount } from './values.ts'

/** One subscription of omne to one kind of events of an endpoint, for one peer account and one set of arguments. */
export type SubscriptionKey = Readonly<{
  tenant: TenantId
  holding: EndpointHolding
  account: PeerAccount
  name: string
  arguments: string
}>

export type SubscriptionState = 'receiving' | 'waiting' | 'terminated'

export type TerminationReason = 'refused' | 'type-gone' | 'schema-changed' | 'unavailable'

export type SubscriptionRow = Readonly<{
  endpoint: EndpointName
  delivery: 'poll' | 'push'
  arguments: JsonValue
  cursor: string | null
  state: SubscriptionState
  reason: TerminationReason | null
  subscribers: readonly string[]
  revision: number
  delivered: number
}>

export type Occurrence = Readonly<{
  eventId: string
  name: string
  timestamp: string
  data: JsonValue
}>

export type GapReason = 'peer-truncated' | 'trimmed' | 'possibly-missed'

export type StoredOccurrence =
  | (Readonly<{ seq: number; kind: 'event'; receivedAt: string }> & Occurrence)
  | Readonly<{ seq: number; kind: 'gap'; receivedAt: string; reason: GapReason }>
  | Readonly<{ seq: number; kind: 'ended'; receivedAt: string; reason: TerminationReason }>

/** What one commit takes in: the events, the position after them, and whether the peer said some were missed. */
export type ReceivedBatch = Readonly<{
  events: readonly Occurrence[]
  cursor: string | null
  gap: Extract<GapReason, 'peer-truncated' | 'possibly-missed'> | null
  at: string
}>

export type RetentionBounds = Readonly<{ maxEvents: number; maxAgeMs: number }>

/** The position moves only with a batch taken in and the delivered mark only forward with an acknowledgement; writing the row keeps both; ending is one commit with its last item. */
export interface EventRecords {
  list(
    tenant: TenantId,
  ): Promise<
    Outcome<readonly Readonly<{ key: SubscriptionKey; row: SubscriptionRow }>[], 'unavailable'>
  >
  read(key: SubscriptionKey): Promise<Outcome<SubscriptionRow | 'absent', 'unavailable'>>
  write(
    key: SubscriptionKey,
    row: SubscriptionRow,
    expected: number | 'absent',
  ): Promise<Outcome<'written', 'conflict' | 'unavailable'>>
  remove(key: SubscriptionKey): Promise<Ack<'unavailable'>>
  receive(
    key: SubscriptionKey,
    batch: ReceivedBatch,
    bounds: RetentionBounds,
  ): Promise<Outcome<Readonly<{ stored: number }> | 'absent', 'unavailable' | 'unknown'>>
  occurrences(
    key: SubscriptionKey,
    after: number,
    limit: number,
  ): Promise<Outcome<readonly StoredOccurrence[], 'unavailable'>>
  end(
    key: SubscriptionKey,
    reason: TerminationReason,
    at: string,
  ): Promise<Outcome<'ended' | 'absent', 'unavailable' | 'unknown'>>
  acknowledge(key: SubscriptionKey, seq: number): Promise<Ack<'unavailable'>>
}

export type SubscriptionRef = Readonly<{
  tenant: TenantId
  holding: EndpointHolding
  endpoint: EndpointName
  name: string
  arguments: string
  subscribers: readonly string[]
}>

export type ConsumerNotice =
  | Readonly<{ kind: 'gap'; seq: number; reason: GapReason }>
  | Readonly<{ kind: 'terminated'; seq: number; reason: TerminationReason }>

export type ConsumerAnswer = 'accepted' | 'not-now' | 'unknown'

/** Where kept events go; what was not accepted comes again with the same identifiers, so the consumer keeps one of each. */
export interface EventConsumer {
  deliver(
    ref: SubscriptionRef,
    events: readonly (Occurrence & Readonly<{ seq: number }>)[],
  ): Promise<ConsumerAnswer>
  report(ref: SubscriptionRef, notice: ConsumerNotice): Promise<ConsumerAnswer>
}

const sorted = (value: JsonValue): JsonValue => {
  if (value.kind === 'array') return { kind: 'array', items: value.items.map(sorted) }
  if (value.kind !== 'object') return value
  const entries = [...value.entries]
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map(entry => ({ key: entry.key, value: sorted(entry.value) }))
  return { kind: 'object', entries }
}

/** The arguments of a subscription as one text: members sorted by name, numbers as written. */
export function subscriptionArgumentsText(args: JsonValue): string {
  return writeJsonText(sorted(args))
}
