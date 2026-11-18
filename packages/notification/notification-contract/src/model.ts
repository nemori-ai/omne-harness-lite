import {
  sameRecipient,
  type Basis,
  type BoxedLevel,
  type Cause,
  type EventTypeName,
  type Instant,
  type Level,
  type Marks,
  type RecipientRef,
  type Scope,
  type SendIdentity,
  type SourceName,
  type Term,
} from './values.ts'

export type SubscriptionKey = Readonly<{
  recipient: RecipientRef
  source: SourceName
  type: EventTypeName
  scope: Scope
}>

export type Subscription = SubscriptionKey &
  Readonly<{
    level: Level
    note: string | null
    term: Term
    basis: Basis
    /** Set in the commit that hit a `once` subscription. */
    expired: boolean
  }>

/** One notification in one recipient's inbox. Level and cause are fixed when it is accepted. */
export type NotificationRecord = Readonly<{
  identity: SendIdentity
  recipient: RecipientRef
  sequence: number
  level: BoxedLevel
  cause: Cause
  acceptedAt: Instant
  marks: Marks
  replaceKey: string | null
  /** It replaced an earlier notification and the send did not ask to remind again. */
  quiet: boolean
}>

export type Selected = Readonly<{
  recipient: RecipientRef
  level: BoxedLevel
  cause: Cause
  /** The subscription that set the level. A `once` subscription expires in the same commit. */
  hit: Subscription | null
}>

function scopeKey(scope: Scope): string {
  if (scope.kind === 'subject') return `=${scope.equals}`
  return scope.kind === 'subject-prefix' ? `^${scope.prefix}` : '*'
}
const termKey = (term: Term) => (term.kind === 'until' ? `until ${term.at}` : term.kind)
function basisKey(basis: Basis): string {
  if (basis.kind === 'blanket') return `blanket ${String(basis.generation)}`
  return basis.kind === 'granular' ? `granular ${basis.decision}` : 'owner'
}

export const sameScope = (a: Scope, b: Scope): boolean => scopeKey(a) === scopeKey(b)

export function sameSubscriptionKey(a: SubscriptionKey, b: SubscriptionKey): boolean {
  return (
    sameRecipient(a.recipient, b.recipient) &&
    a.source === b.source &&
    a.type === b.type &&
    sameScope(a.scope, b.scope)
  )
}

export const sameTerm = (a: Term, b: Term): boolean => termKey(a) === termKey(b)

/** Null is "no subscription". Two subscriptions are the same when every stored part agrees. */
export function sameSubscription(a: Subscription | null, b: Subscription | null): boolean {
  if (a === null || b === null) return a === b
  return (
    sameSubscriptionKey(a, b) &&
    a.level === b.level &&
    a.note === b.note &&
    sameTerm(a.term, b.term) &&
    basisKey(a.basis) === basisKey(b.basis) &&
    a.expired === b.expired
  )
}

export function isLive(subscription: Subscription, now: Instant): boolean {
  if (subscription.expired) return false
  return subscription.term.kind !== 'until' || now < subscription.term.at
}

export function scopeMatches(scope: Scope, subject: string | null): boolean {
  if (scope.kind === 'all') return true
  if (subject === null) return false
  return scope.kind === 'subject' ? subject === scope.equals : subject.startsWith(scope.prefix)
}

/** Equality is more specific than a prefix; a longer prefix than a shorter one; `all` is last. */
export function scopeRank(scope: Scope): readonly [number, number] {
  if (scope.kind === 'subject') return [2, 0]
  if (scope.kind === 'subject-prefix') return [1, scope.prefix.length]
  return [0, 0]
}
