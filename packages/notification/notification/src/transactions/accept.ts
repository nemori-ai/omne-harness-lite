import {
  sameSend,
  sameSubscriptionKey,
  selectRecipients,
  supersede,
  UNMARKED,
  type EventTypeFacts,
  type Instant,
  type RecipientRef,
  type Selected,
  type SendRequest,
} from '@omne-harness/notification-contract'
import type { NotificationTxn } from '../txn.ts'

export type AcceptCommand = Readonly<{ request: SendRequest; type: EventTypeFacts; now: Instant }>

export type AcceptResult =
  | Readonly<{ kind: 'accepted'; recipients: readonly RecipientRef[] }>
  | Readonly<{ kind: 'recalled'; recipients: readonly RecipientRef[] }>
  | Readonly<{ kind: 'conflict' }>

const PERSON: RecipientRef = { kind: 'person' }

/** Puts one recipient's notification in its inbox and applies what the event replaces. */
function box(txn: NotificationTxn, command: AcceptCommand, entry: Selected): void {
  const { identity, event } = command.request
  const replaced =
    event.replaceKey === null
      ? []
      : supersede(identity, event, txn.sameKey(entry.recipient, identity.source, event.replaceKey))
  for (const old of replaced) {
    const marks = txn.notification(entry.recipient, old)!.marks
    txn.setMarks(entry.recipient, old, { ...marks, supersededBy: identity })
  }
  txn.insertNotification({
    identity,
    recipient: entry.recipient,
    sequence: txn.nextSequence(),
    level: entry.level,
    cause: entry.cause,
    acceptedAt: command.now,
    marks: UNMARKED,
    replaceKey: event.replaceKey,
    quiet: replaced.length > 0 && !event.renotify,
  })
}

/** One transaction: the send, a notification per recipient, the superseded marks, the expiry of `once` subscriptions. */
export function acceptSend(txn: NotificationTxn, command: AcceptCommand): AcceptResult {
  const { identity, event } = command.request
  const known = txn.send(identity.source, identity.eventId)
  if (known !== null)
    return sameSend(known.event, event)
      ? { kind: 'recalled', recipients: known.recipients }
      : { kind: 'conflict' }
  txn.ensureRecipient(PERSON)
  for (const named of event.named) txn.ensureRecipient(named)
  const subscriptions = txn.subscriptionsFor(identity.source, event.type)
  const selected = selectRecipients(
    event,
    command.type,
    txn.recipients(),
    subscriptions,
    command.now,
  )
  for (const entry of selected) {
    box(txn, command, entry)
    const hit = entry.hit
    if (hit === null) continue
    const subscription = subscriptions.find(candidate => sameSubscriptionKey(candidate, hit))
    if (subscription?.term.kind === 'once') txn.expireSubscription(hit)
  }
  const recipients = selected.map(entry => entry.recipient)
  txn.insertSend({ identity, event, acceptedAt: command.now, recipients })
  return { kind: 'accepted', recipients }
}
