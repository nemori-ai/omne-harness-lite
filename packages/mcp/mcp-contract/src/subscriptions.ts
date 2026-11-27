import type { JsonValue } from '@omne-harness/json-text'
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

/** What one commit takes in: the events, the position after them, and whether the peer said some were missed. */
export type ReceivedBatch = Readonly<{
  events: readonly Occurrence[]
  cursor: string | null
  gap: Extract<GapReason, 'peer-truncated' | 'possibly-missed'> | null
  at: string
}>

export type RetentionBounds = Readonly<{ maxEvents: number; maxAgeMs: number }>

/** The position of a subscription moves only with a batch it took in; writing its row keeps the position. */
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
}
