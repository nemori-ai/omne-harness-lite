import type { CallContext, Instant, SessionRef, TenantId } from '@omne-harness/dispatch-contract'

export type AuthorityAction = 'dispatch' | 'withdraw' | 'report' | 'message' | 'read'
export type AuthorityAnswer = 'permitted' | 'denied' | 'unavailable'

export interface DispatchAuthority {
  /** Whether this subject may do this now. Asked on every operation, never cached. */
  decide(ctx: CallContext, action: AuthorityAction): Promise<AuthorityAnswer>
}

/** Asks the authority; a failure to answer is `unavailable`, never an allowance. */
export async function ask(
  authority: DispatchAuthority,
  ctx: CallContext,
  action: AuthorityAction,
): Promise<AuthorityAnswer> {
  try {
    return await authority.decide(ctx, action)
  } catch {
    return 'unavailable'
  }
}

/** A read either returns the fact or says it could not read. It never answers empty instead. */
export type PortRead<T> = Readonly<{ kind: 'read'; value: T }> | Readonly<{ kind: 'unavailable' }>

export type ContextMoment =
  | Readonly<{ kind: 'moment'; moment: string }>
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'too-large' }>

export interface ContextCopies {
  /** Fixes the moment of the dispatcher's conversation the dispatching call was made in: the copy read later by it is the same. */
  moment(tenant: TenantId, dispatcher: SessionRef, call: string): Promise<PortRead<ContextMoment>>
}

export interface AgentDefinitions {
  /** The type of the definition of this name as the tenant sees it now, or null when it sees none. */
  typeOf(tenant: TenantId, name: string): Promise<PortRead<'master' | 'non-master' | null>>
}

export interface Clock {
  now(): Instant
}

/** A wake-up. It may come early, late, twice or never: the registry holds what is to be done. */
export interface ReconcileHints {
  wake(tenant: TenantId): void
}
