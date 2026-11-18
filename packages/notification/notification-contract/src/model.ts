import type {
  Basis,
  BoxedLevel,
  Cause,
  EventTypeName,
  Instant,
  Level,
  Marks,
  RecipientRef,
  Scope,
  SendIdentity,
  SourceName,
  Term,
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
  /** The position in the inbox: later accepted, larger. */
  sequence: number
  level: BoxedLevel
  cause: Cause
  acceptedAt: Instant
  marks: Marks
  replaceKey: string | null
}>

export type Selected = Readonly<{
  recipient: RecipientRef
  level: BoxedLevel
  cause: Cause
  /** The subscription that set the level. A `once` subscription expires in the same commit. */
  hit: SubscriptionKey | null
}>

export function subscriptionKeyOf(subscription: Subscription): SubscriptionKey {
  const { recipient, source, type, scope } = subscription
  return { recipient, source, type, scope }
}

/** A subscription hits only while its term holds. */
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
