import type {
  Beat,
  BoxEntry,
  DeliveryResult,
  DeliveryUnit,
  Destination,
  DestinationRef,
  EventFacts,
  EventTypeName,
  Instant,
  Marks,
  NotificationRecord,
  RecipientRef,
  SendIdentity,
  SourceName,
  Subscription,
  SubscriptionKey,
} from '@omne-harness/notification-contract'

export type SendRecord = Readonly<{
  identity: SendIdentity
  event: EventFacts
  /** The content comes from outside this system, as its type declared when it was accepted. */
  external: boolean
  acceptedAt: Instant
  recipients: readonly RecipientRef[]
}>

/** A unit with what its deliveries came to. Members and body never change after it is formed. */
export type StoredUnit = DeliveryUnit &
  Readonly<{
    attempts: number
    state: 'pending' | 'delivered' | 'stopped'
    dueAt: Instant
    last: DeliveryResult | null
  }>

/** One tenant's facts inside one storage transaction. Synchronous: a script runs to completion in the storage worker. */
export interface NotificationTxn {
  send(source: SourceName, eventId: string): SendRecord | null
  insertSend(record: SendRecord): void

  /** Every recipient of the tenant. The person is always among them. */
  recipients(): readonly RecipientRef[]
  ensureRecipient(recipient: RecipientRef): void

  subscriptionsFor(source: SourceName, type: EventTypeName): readonly Subscription[]
  expireSubscription(key: SubscriptionKey): void
  subscription(key: SubscriptionKey): Subscription | null
  subscriptionsOf(recipient: RecipientRef): readonly Subscription[]
  putSubscription(subscription: Subscription): void
  deleteSubscription(key: SubscriptionKey): void
  setBeat(recipient: RecipientRef, beat: Beat): void

  nextSequence(): number
  notification(recipient: RecipientRef, identity: SendIdentity): NotificationRecord | null
  insertNotification(record: NotificationRecord): void
  setMarks(recipient: RecipientRef, identity: SendIdentity, marks: Marks): void
  sameKey(
    recipient: RecipientRef,
    source: SourceName,
    replaceKey: string,
  ): readonly NotificationRecord[]
  currentSequence(): number
  /** Unresolved strong notifications past a position that may be pushed, in inbox order. */
  pendingStrong(recipient: RecipientRef, after: number): readonly BoxEntry[]
  unresolved(recipient: RecipientRef): readonly BoxEntry[]

  destinations(recipient: RecipientRef): readonly Destination[]
  putDestination(destination: Destination): void
  deleteDestination(ref: DestinationRef): void

  unit(id: string): StoredUnit | null
  putUnit(unit: StoredUnit): void

  reminded(recipient: RecipientRef, item: string): boolean
  insertReminder(recipient: RecipientRef, item: string, at: Instant): void
}

/** The unit a channel sees: what was fixed when it was formed, without the record of its deliveries. */
export function unitOf(stored: StoredUnit): DeliveryUnit {
  const { id, destination, kind, members, body, formedAt } = stored
  return { id, destination, kind, members, body, formedAt }
}
