import type {
  AuthorityAnswer,
  CallContext,
  Instant,
  RecipientRef,
  SourceName,
} from '@omne-harness/notification-contract'

export type AuthorityAction =
  | Readonly<{ kind: 'send-as'; source: SourceName }>
  | Readonly<{ kind: 'read-inbox'; recipient: RecipientRef }>
  | Readonly<{ kind: 'dispose'; recipient: RecipientRef }>
  | Readonly<{ kind: 'subscribe-for'; recipient: RecipientRef }>
  | Readonly<{ kind: 'manage-destinations'; recipient: RecipientRef }>
  | Readonly<{ kind: 'list-catalog' }>
  | Readonly<{ kind: 'be-recipient'; recipient: RecipientRef }>

/** Declared here, implemented by identity and authorization through the assembly. */
export interface NotificationAuthority {
  /** Whether this subject may do this now. Asked on every operation, never cached. */
  decide(ctx: CallContext, action: AuthorityAction): Promise<AuthorityAnswer>
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
