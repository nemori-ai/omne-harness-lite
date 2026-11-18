import type {
  Beat,
  InboxPage,
  InboxQuery,
  Marks,
  NotificationRef,
  NotificationView,
  RecipientRef,
  SendIdentity,
  Subscription,
  SubscriptionKey,
  TenantId,
} from '@omne-harness/notification-contract'
import type { AcceptCommand, AcceptResult } from './transactions/accept.ts'
import type { MarkCommand, MarkResult } from './transactions/mark.ts'
import type { BeatCommand, SubscribeCommand, SubscribeResult } from './transactions/subscribe.ts'
import type { SendRecord } from './txn.ts'

/** What a commit answered. `unknown`: it is not known whether the facts were written. */
export type StoreAnswer<T> =
  | Readonly<{ kind: 'committed'; value: T }>
  | Readonly<{ kind: 'rolled-back' }>
  | Readonly<{ kind: 'unknown' }>

/** A read either returns the facts or says it could not read. It never answers empty instead. */
export type StoreRead<T> = Readonly<{ kind: 'read'; value: T }> | Readonly<{ kind: 'unavailable' }>

export type SendView = Readonly<{
  record: SendRecord
  notifications: readonly Readonly<{ recipient: RecipientRef; marks: Marks }>[]
}>

/** The repository, in the words of the domain. Each write is one commit of one tenant and runs one script. */
export interface NotificationStore {
  accept(tenant: TenantId, command: AcceptCommand): Promise<StoreAnswer<AcceptResult>>
  mark(tenant: TenantId, command: MarkCommand): Promise<StoreAnswer<MarkResult>>
  subscribe(tenant: TenantId, command: SubscribeCommand): Promise<StoreAnswer<SubscribeResult>>
  setBeat(tenant: TenantId, command: BeatCommand): Promise<StoreAnswer<null>>

  send(tenant: TenantId, identity: SendIdentity): Promise<StoreRead<SendView | null>>
  /** One page of an inbox in the order of acceptance. */
  box(tenant: TenantId, query: InboxQuery): Promise<StoreRead<InboxPage>>
  notification(tenant: TenantId, ref: NotificationRef): Promise<StoreRead<NotificationView | null>>
  subscription(tenant: TenantId, key: SubscriptionKey): Promise<StoreRead<Subscription | null>>
  subscriptions(
    tenant: TenantId,
    recipient: RecipientRef,
  ): Promise<StoreRead<readonly Subscription[]>>
  beat(tenant: TenantId, recipient: RecipientRef): Promise<StoreRead<Beat>>
}
