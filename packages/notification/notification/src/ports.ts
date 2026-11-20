import type {
  AuthorityAnswer,
  CallContext,
  Creator,
  Destination,
  Disclosure,
  Instant,
  RecipientRef,
  SourceName,
  StandingRead,
  TenantId,
} from '@omne-harness/notification-contract'

export type AuthorityAction =
  | Readonly<{ kind: 'send-as'; source: SourceName }>
  | Readonly<{ kind: 'read-inbox'; recipient: RecipientRef }>
  | Readonly<{ kind: 'dispose'; recipient: RecipientRef }>
  | Readonly<{ kind: 'subscribe-for'; recipient: RecipientRef }>
  | Readonly<{ kind: 'manage-destinations'; recipient: RecipientRef }>
  | Readonly<{ kind: 'list-catalog' }>
  | Readonly<{ kind: 'know-source'; source: SourceName }>
  | Readonly<{ kind: 'be-recipient'; recipient: RecipientRef }>

export interface NotificationAuthority {
  /** Whether this subject may do this now. Asked on every operation, never cached. */
  decide(ctx: CallContext, action: AuthorityAction): Promise<AuthorityAnswer>
  /** How much of a notification may leave the system towards this destination. */
  disclosure(tenant: TenantId, destination: Destination): Promise<Disclosure | 'unavailable'>
}

export interface Clock {
  now(): Instant
}

/** Asks the authority; a failure to answer is `unavailable`, never an allowance. */
export async function ask(
  authority: NotificationAuthority,
  ctx: CallContext,
  action: AuthorityAction,
): Promise<AuthorityAnswer> {
  try {
    return await authority.decide(ctx, action)
  } catch {
    return 'unavailable'
  }
}

export interface SubscriptionCreators {
  /** Who acts in this context, as its caller's adapter names it; null when it cannot be named now.
   * Asked only when a subscription is written. */
  creatorOf(ctx: CallContext): Promise<Creator | null>
}

/** This group's need for standing items, in its own shape. The assembly binds the sources' blocks to it. */
export interface StandingItems {
  read(tenant: TenantId): Promise<StandingRead>
}

/** A wake-up. It may come early, late, twice or never: the store holds what is to be done. */
export interface ClockHints {
  wakeAt(tenant: TenantId, instant: Instant): void
}
