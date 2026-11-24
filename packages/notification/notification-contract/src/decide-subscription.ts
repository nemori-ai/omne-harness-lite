import { z } from 'zod'
import { subjectAccepted, type EventTypeDeclaration } from './declarations.ts'
import { isLive, sameTerm, type Subscription } from './model.ts'
import {
  eventTypeNameSchema,
  levelSchema,
  noteSchema,
  recipientRefSchema,
  sameRecipient,
  scopeSchema,
  sourceNameSchema,
  termSchema,
  type Creator,
  type Instant,
  type RecipientRef,
} from './values.ts'

export const subscriptionKeySchema = z
  .strictObject({
    recipient: recipientRefSchema,
    source: sourceNameSchema,
    type: eventTypeNameSchema,
    scope: scopeSchema,
  })
  .readonly()

export const subscriptionChangeSchema = z
  .strictObject({
    recipient: recipientRefSchema,
    source: sourceNameSchema,
    type: eventTypeNameSchema,
    scope: scopeSchema,
    level: levelSchema,
    note: noteSchema.nullable(),
    term: termSchema,
  })
  .readonly()
export type SubscriptionChange = z.infer<typeof subscriptionChangeSchema>

export type SubscriptionActor =
  | Readonly<{ kind: 'owner' }>
  | Readonly<{ kind: 'agent'; recipient: RecipientRef }>

export type SubscriptionRefusal =
  | 'invalid-request'
  | 'invalid-scope'
  | 'invalid-term'
  | 'not-permitted'
  | 'term-in-past'
  | 'not-subscribable'
  | 'scope-does-not-fit'
  | 'not-own-recipient'

export type SubscriptionDecision =
  | Readonly<{ kind: 'set'; creator: Creator }>
  | Readonly<{ kind: 'recalled'; current: Subscription }>
  | Readonly<{ kind: 'refused'; reason: SubscriptionRefusal }>

function scopeFits(change: SubscriptionChange, declared: EventTypeDeclaration): boolean {
  const { scope } = change
  if (scope.kind === 'all') return true
  if (declared.subject.presence === 'none') return false
  return scope.kind === 'subject-prefix' || subjectAccepted(declared.subject, scope.equals)
}

export type SubscriptionDecisionInput = Readonly<{
  change: SubscriptionChange
  current: Subscription | null
  actor: SubscriptionActor
  creator: Creator
  declared: EventTypeDeclaration
  now: Instant
}>

function admissibility(input: SubscriptionDecisionInput): SubscriptionRefusal | null {
  const { change, declared, actor, now } = input
  if (change.term.kind === 'until' && change.term.at <= now) return 'term-in-past'
  if (!declared.subscribable.includes(change.recipient.kind)) return 'not-subscribable'
  if (!scopeFits(change, declared)) return 'scope-does-not-fit'
  const own = actor.kind === 'owner' || sameRecipient(actor.recipient, change.recipient)
  return own ? null : 'not-own-recipient'
}

function unchanged(current: Subscription, change: SubscriptionChange): boolean {
  return (
    current.level === change.level &&
    current.note === change.note &&
    sameTerm(current.term, change.term)
  )
}

/** Whether setting a subscription takes effect, is recalled or is refused. Whether the act may
 * happen was decided where it started; a set records who made it. */
export function decideSubscription(input: SubscriptionDecisionInput): SubscriptionDecision {
  const { change, creator, now } = input
  const refusal = admissibility(input)
  if (refusal !== null) return { kind: 'refused', reason: refusal }
  const current = input.current !== null && isLive(input.current, now) ? input.current : null
  if (current !== null && unchanged(current, change)) return { kind: 'recalled', current }
  return { kind: 'set', creator }
}
