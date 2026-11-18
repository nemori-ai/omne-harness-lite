import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import type {
  CallContext,
  NotificationCatalog,
  NotificationDestinations,
  NotificationInbox,
  NotificationSending,
  NotificationSubscriptions,
  TenantId,
} from '@omne-harness/notification-contract'

/** The application decides whether this login acts for the tenant; the plugin cannot read a login. */
export interface NotificationPrincipals {
  actingFor(
    login: LoginIdentity,
    tenant: string,
  ): Promise<{ readonly ok: Principal } | { readonly refused: 'denied' | 'basis-unavailable' }>
  /** The call context of the person the tenant is: the actor is the owner. */
  contextOf(principal: Principal, tenant: string): CallContext
}

/** Taken at each call; absent while the notification row is not there. */
export type NotificationFaces = Readonly<{
  sending: NotificationSending
  inbox: NotificationInbox
  subscriptions: NotificationSubscriptions
  destinations: NotificationDestinations
  catalog: NotificationCatalog
}>

export type NotificationChange =
  | Readonly<{ kind: 'inbox'; tenant: TenantId }>
  | Readonly<{ kind: 'catalog' }>

export type NotificationChangeListener = Readonly<{
  changed(change: NotificationChange): void
  /** The feed is gone. Nothing more arrives; the observer opens again. */
  closed(): void
}>

export interface NotificationChangeFeed {
  subscribe(listener: NotificationChangeListener): () => void
}
