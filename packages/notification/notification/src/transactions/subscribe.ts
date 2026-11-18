import {
  sameSubscription,
  type Beat,
  type RecipientRef,
  type Subscription,
  type SubscriptionKey,
} from '@omne-harness/notification-contract'
import type { NotificationTxn } from '../txn.ts'

/** `expected` is the subscription the decision was made on. A different one now is stale. */
export type SubscribeCommand = Readonly<{
  key: SubscriptionKey
  expected: Subscription | null
  next: Subscription | null
}>

export type SubscribeResult = Readonly<{ kind: 'written' }> | Readonly<{ kind: 'stale' }>

export function writeSubscription(
  txn: NotificationTxn,
  command: SubscribeCommand,
): SubscribeResult {
  if (!sameSubscription(txn.subscription(command.key), command.expected)) return { kind: 'stale' }
  if (command.next === null) txn.deleteSubscription(command.key)
  else {
    txn.ensureRecipient(command.key.recipient)
    txn.putSubscription(command.next)
  }
  return { kind: 'written' }
}

export type BeatCommand = Readonly<{ recipient: RecipientRef; beat: Beat }>

export function writeBeat(txn: NotificationTxn, command: BeatCommand): void {
  txn.ensureRecipient(command.recipient)
  txn.setBeat(command.recipient, command.beat)
}
