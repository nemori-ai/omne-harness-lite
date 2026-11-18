import { z } from 'zod'
import { subjectAccepted, type EventTypeDeclaration } from './declarations.ts'
import { isLive, sameTerm, type Subscription } from './model.ts'
import {
  eventTypeNameSchema,
  levelSchema,
  noteSchema,
  recipientKey,
  recipientRefSchema,
  sameRecipient,
  scopeSchema,
  sourceNameSchema,
  termSchema,
  type Basis,
  type Instant,
  type Level,
  type RecipientRef,
  type TenantId,
  type Term,
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

/** How the owner lets agents subscribe: every request takes effect, or each one is confirmed. */
export type ConsentMode =
  | Readonly<{ kind: 'automatic'; generation: number }>
  | Readonly<{ kind: 'per-request' }>

/** The owner's answer on one card. `content` is what the owner saw when answering. */
export type Confirmation = Readonly<{ decision: string; content: string; approved: boolean }>

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
  | 'confirmation-mismatch'
  | 'out-of-range'

export type SubscriptionDecision =
  | Readonly<{ kind: 'set'; basis: Basis }>
  | Readonly<{ kind: 'recalled'; current: Subscription }>
  | Readonly<{ kind: 'needs-confirmation'; content: string }>
  | Readonly<{ kind: 'refused'; reason: SubscriptionRefusal }>

const RANK: Record<Level, number> = { off: 0, weak: 1, strong: 2 }

/** The exact content an owner confirms: a confirmation of other content does not match. */
export function confirmationContent(tenant: TenantId, change: SubscriptionChange): string {
  const { recipient, source, type, scope, level, note, term } = change
  return JSON.stringify([tenant, recipientKey(recipient), source, type, scope, level, note, term])
}

function notLonger(next: Term, current: Term): boolean {
  if (current.kind === 'standing') return true
  if (current.kind === 'once') return next.kind === 'once'
  return next.kind === 'until' && next.at <= current.at
}

function scopeFits(change: SubscriptionChange, declared: EventTypeDeclaration): boolean {
  const { scope } = change
  if (scope.kind === 'all') return true
  if (declared.subject.presence === 'none') return false
  return scope.kind === 'subject-prefix' || subjectAccepted(declared.subject, scope.equals)
}

export type SubscriptionDecisionInput = Readonly<{
  tenant: TenantId
  change: SubscriptionChange
  current: Subscription | null
  actor: SubscriptionActor
  declared: EventTypeDeclaration
  /** Read only when an agent subscribes anew or raises a subscription. */
  mode: ConsentMode | null
  confirmation: Confirmation | null
  now: Instant
}>

function consent(input: SubscriptionDecisionInput): SubscriptionDecision {
  const { mode, confirmation, tenant, change } = input
  if (mode?.kind === 'automatic')
    return { kind: 'set', basis: { kind: 'blanket', generation: mode.generation } }
  const content = confirmationContent(tenant, change)
  if (confirmation === null) return { kind: 'needs-confirmation', content }
  return confirmation.approved && confirmation.content === content
    ? { kind: 'set', basis: { kind: 'granular', decision: confirmation.decision } }
    : { kind: 'refused', reason: 'confirmation-mismatch' }
}

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

/** Lower or equal level, the same note, a term that is not longer: this needs nobody's consent. */
function lowers(current: Subscription, change: SubscriptionChange): boolean {
  return (
    RANK[change.level] <= RANK[current.level] &&
    current.note === change.note &&
    notLonger(change.term, current.term)
  )
}

/** Whether setting a subscription takes effect, needs the owner's confirmation, or is refused. */
export function decideSubscription(input: SubscriptionDecisionInput): SubscriptionDecision {
  const { change, actor, now } = input
  const refusal = admissibility(input)
  if (refusal !== null) return { kind: 'refused', reason: refusal }
  const current = input.current !== null && isLive(input.current, now) ? input.current : null
  if (current !== null && unchanged(current, change)) return { kind: 'recalled', current }
  if (actor.kind === 'owner') return { kind: 'set', basis: { kind: 'owner' } }
  return current !== null && lowers(current, change)
    ? { kind: 'set', basis: current.basis }
    : consent(input)
}
