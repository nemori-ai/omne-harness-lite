import {
  channelNameSchema,
  type ChannelContribution,
  type RecipientRef,
  type TenantId,
} from '@omne-harness/notification-contract'
import type { NotificationStore, StoreAnswer } from '@omne-harness/notification'

/** What an observer is told: something may have changed, never what. The observer reads again. */
export type NotificationChange =
  | Readonly<{ kind: 'inbox'; tenant: TenantId; recipient: RecipientRef | null }>
  | Readonly<{ kind: 'catalog' }>

export type NotificationChangeListener = Readonly<{
  changed(change: NotificationChange): void
  /** The feed is gone and nothing more arrives. */
  closed(): void
}>

export type NotificationChanges = Readonly<{
  /** A listener that subscribes after the feed closed is told so at once. */
  subscribe(listener: NotificationChangeListener): () => void
  emit(change: NotificationChange): void
  close(): void
}>

export function createChanges(report: (error: unknown) => void): NotificationChanges {
  const listeners = new Set<NotificationChangeListener>()
  let closed = false
  const tell = (call: () => void) => {
    try {
      call()
    } catch (error) {
      report(error)
    }
  }
  return {
    subscribe(listener) {
      if (closed) tell(() => listener.closed())
      else listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    emit(change) {
      for (const listener of listeners) tell(() => listener.changed(change))
    },
    close() {
      closed = true
      const told = [...listeners]
      listeners.clear()
      for (const listener of told) tell(() => listener.closed())
    },
  }
}

export const IN_APP = channelNameSchema.parse('in-app')

/** The channel of the application's own surfaces. Delivering is telling the observers; nobody watching is still delivered, because the notification is in the inbox. */
export function inAppChannel(changes: NotificationChanges): ChannelContribution {
  return {
    name: IN_APP,
    label: '应用内',
    address: { hint: '留空', accepts: address => address === '' },
    leavesSystem: false,
    defaultMinIntervalMs: 0,
    async deliver({ tenant, recipient }) {
      changes.emit({ kind: 'inbox', tenant, recipient })
      return { kind: 'delivered' }
    },
  }
}

const WRITES = ['accept', 'mark', 'subscribe', 'setBeat', 'destination'] as const

/** Tells the observers after every commit that changed what a client can read. */
export function observed(
  store: NotificationStore,
  changes: NotificationChanges,
): NotificationStore {
  const wrapped: Partial<Record<(typeof WRITES)[number], unknown>> = {}
  for (const name of WRITES) {
    const write = store[name] as (tenant: TenantId, command: never) => Promise<StoreAnswer<unknown>>
    wrapped[name] = async (tenant: TenantId, command: never) => {
      const answer = await write(tenant, command)
      if (answer.kind !== 'rolled-back') changes.emit({ kind: 'inbox', tenant, recipient: null })
      return answer
    }
  }
  return { ...store, ...wrapped } as NotificationStore
}
