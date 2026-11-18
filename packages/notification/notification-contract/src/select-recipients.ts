import type { EventTypeFacts } from './declarations.ts'
import { isLive, scopeMatches, scopeRank, type Selected, type Subscription } from './model.ts'
import {
  sameRecipient,
  type Cause,
  type EventFacts,
  type Instant,
  type RecipientRef,
} from './values.ts'

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

function causeOf(named: boolean, subscription: Subscription | null): Cause {
  if (named) return { kind: 'named' }
  if (subscription === null) return { kind: 'type-default' }
  return { kind: 'subscription', scope: subscription.scope, note: subscription.note }
}

/** One recipient's answer: selected with a level and a cause, or not selected. */
function selectOne(
  recipient: RecipientRef,
  event: EventFacts,
  declared: EventTypeFacts,
  subscriptions: readonly Subscription[],
  now: Instant,
): Selected | null {
  const subscription = mostSpecific(recipient, event.subject, subscriptions, now)
  const value = subscription === null ? declared.defaults[recipient.kind] : subscription.level
  const named = event.named.some(entry => sameRecipient(entry, recipient))
  if (value === 'off')
    return named ? { recipient, level: 'weak', cause: { kind: 'named' }, hit: null } : null
  return {
    recipient,
    level: value,
    cause: causeOf(named, subscription),
    hit: subscription,
  }
}

/** Who gets this event, how urgent, and why. The recipient that emitted it is never selected. */
export function selectRecipients(
  event: EventFacts,
  declared: EventTypeFacts,
  recipients: readonly RecipientRef[],
  subscriptions: readonly Subscription[],
  now: Instant,
): readonly Selected[] {
  const emitter = event.origin?.emitter ?? null
  return recipients
    .filter(recipient => emitter === null || !sameRecipient(emitter, recipient))
    .map(recipient => selectOne(recipient, event, declared, subscriptions, now))
    .filter(entry => entry !== null)
}
