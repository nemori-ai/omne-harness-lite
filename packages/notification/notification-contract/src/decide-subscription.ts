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
  type Basis,
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

/** What the call an agent subscribes in was released on: all of it, or this one act; held for the
 * tenant or for the session; and the reference to the authorization, kept as it was minted. */
export type ConsentBasis = Readonly<{
  kind: 'blanket' | 'granular'
  scope: 'standing' | 'session'
  grant: string
}>

export type ConsentAnswer =
  | Readonly<{ kind: 'consented'; basis: ConsentBasis }>
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'unavailable' }>

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
  | 'consent-required'

export type SubscriptionDecision =
  | Readonly<{ kind: 'set'; basis: Basis }>
  | Readonly<{ kind: 'recalled'; current: Subscription }>
  | Readonly<{ kind: 'needs-consent' }>
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

/** Whether setting a subscription takes effect, is recalled, is refused, or needs the consent the
 * agent's call was released on. Every change an agent writes needs it, a lower one too. */
export function decideSubscription(input: SubscriptionDecisionInput): SubscriptionDecision {
  const { change, actor, now } = input
  const refusal = admissibility(input)
  if (refusal !== null) return { kind: 'refused', reason: refusal }
  const current = input.current !== null && isLive(input.current, now) ? input.current : null
  if (current !== null && unchanged(current, change)) return { kind: 'recalled', current }
  return actor.kind === 'owner'
    ? { kind: 'set', basis: { kind: 'owner' } }
    : { kind: 'needs-consent' }
}

export type ConsentOutcome =
  | Readonly<{ kind: 'basis'; basis: Basis }>
  | Readonly<{ kind: 'refused'; reason: 'consent-required' }>
  | Readonly<{ kind: 'unavailable' }>

/** The basis a consent gives a subscription. A granular consent is always of this session. */
export function consentBasis(answer: ConsentAnswer): ConsentOutcome {
  switch (answer.kind) {
    case 'consented': {
      const { kind, scope, grant } = answer.basis
      return {
        kind: 'basis',
        basis: kind === 'blanket' ? { kind, scope, grant } : { kind, grant },
      }
    }
    case 'none':
      return { kind: 'refused', reason: 'consent-required' }
    case 'unavailable':
      return { kind: 'unavailable' }
  }
}
