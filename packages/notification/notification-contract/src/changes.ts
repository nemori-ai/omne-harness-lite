import type { RecipientRef, TenantId } from './values.ts'

/** What an observer is told: something may have changed, never what. The observer reads again. */
export type NotificationChange =
  | Readonly<{ kind: 'inbox'; tenant: TenantId; recipient: RecipientRef | null }>
  | Readonly<{ kind: 'catalog' }>

export type NotificationChangeListener = Readonly<{
  changed(change: NotificationChange): void
  /** The feed is gone and nothing more arrives. */
  closed(): void
}>

export interface NotificationChangeFeed {
  /** A listener that subscribes after the feed closed is told so at once. */
  subscribe(listener: NotificationChangeListener): () => void
}
