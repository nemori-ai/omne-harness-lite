import type {
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
  acceptedAt: Instant
  recipients: readonly RecipientRef[]
}>

/** One tenant's facts inside one storage transaction. Synchronous: a script runs to completion in the storage worker. */
export interface NotificationTxn {
  send(source: SourceName, eventId: string): SendRecord | null
  insertSend(record: SendRecord): void

  /** Every recipient of the tenant. The person is always among them. */
  recipients(): readonly RecipientRef[]
  /** Records an entrusted agent as a recipient. A second call changes nothing. */
  ensureRecipient(recipient: RecipientRef): void

  subscriptionsFor(source: SourceName, type: EventTypeName): readonly Subscription[]
  expireSubscription(key: SubscriptionKey): void

  /** The next position in the tenant's inboxes. Strictly increasing. */
  nextSequence(): number
  notification(recipient: RecipientRef, identity: SendIdentity): NotificationRecord | null
  insertNotification(record: NotificationRecord): void
  setMarks(recipient: RecipientRef, identity: SendIdentity, marks: Marks): void
  /** One recipient's notifications from one source under one replace key. */
  sameKey(
    recipient: RecipientRef,
    source: SourceName,
    replaceKey: string,
  ): readonly NotificationRecord[]
}
