import type { EventTypeFacts } from './declarations.ts'
import {
  isLive,
  scopeMatches,
  scopeRank,
  subscriptionKeyOf,
  type Selected,
  type Subscription,
} from './model.ts'
import { sameRecipient, type EventFacts, type Instant, type RecipientRef } from './values.ts'

function mostSpecific(
  recipient: RecipientRef,
  subject: string | null,
  subscriptions: readonly Subscription[],
  now: Instant,
): Subscription | null {
  let best: Subscription | null = null
  for (const candidate of subscriptions) {
    if (!sameRecipient(candidate.recipient, recipient)) continue
    if (!isLive(candidate, now) || !scopeMatches(candidate.scope, subject)) continue
    if (best === null) {
      best = candidate
      continue
    }
    const [kind, length] = scopeRank(candidate.scope)
    const [bestKind, bestLength] = scopeRank(best.scope)
    if (kind > bestKind || (kind === bestKind && length > bestLength)) best = candidate
  }
  return best
}

/**
 * Decides who gets this event, how urgent it is for each, and why.
 * `subscriptions` are those of the tenant on this source and this event type.
 */
export function selectRecipients(
  event: EventFacts,
  declared: EventTypeFacts,
  recipients: readonly RecipientRef[],
  subscriptions: readonly Subscription[],
  now: Instant,
): readonly Selected[] {
  const selected: Selected[] = []
  for (const recipient of recipients) {
    if (event.origin !== null && sameRecipient(event.origin.emitter, recipient)) continue
    const subscription = mostSpecific(recipient, event.subject, subscriptions, now)
    const value = subscription === null ? declared.defaults[recipient.kind] : subscription.level
    const named = event.named.some(entry => sameRecipient(entry, recipient))
    if (value === 'off' && !named) continue
    const hit = subscription !== null && value !== 'off' ? subscriptionKeyOf(subscription) : null
    selected.push({
      recipient,
      level: value === 'off' ? 'weak' : value,
      cause: named
        ? { kind: 'named' }
        : subscription === null
          ? { kind: 'type-default' }
          : { kind: 'subscription', scope: subscription.scope, note: subscription.note },
      hit,
    })
  }
  return selected
}
