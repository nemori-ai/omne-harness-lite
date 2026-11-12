// The port the access pipeline asks identity (RFC-0015 §5 AccessIdentity). The interface belongs to
// access; identity's adapter implements it. The pipeline only passes what it gets on: it never reads
// a login or a principal, and it never caches a result.
import type { LoginIdentity, Principal } from './contribution.ts'

/** Why the caller could not be established. A thrown error counts as `basis-unavailable`. */
export type IdentityFailure = { readonly outcome: 'denied' | 'basis-unavailable' }

export type LoginResult =
  | { readonly outcome: 'identified'; readonly login: LoginIdentity }
  | IdentityFailure

export type ActForResult =
  | { readonly outcome: 'issued'; readonly principal: Principal }
  | IdentityFailure

export type AccessIdentity = {
  /** Recognises the login proof of the `Authorization` header, as given. */
  readonly identifyLogin: (proof: string) => Promise<LoginResult>
  /**
   * Issues the subject acting for `tenant`, the `Omne-Acting-Tenant` header text as given. Whether
   * the text is a tenant, and one this login may act for, is identity's to judge.
   */
  readonly actFor: (login: LoginIdentity, tenant: string) => Promise<ActForResult>
  /** One successful business access. The pipeline does not wait for it; a failure changes no answer. */
  readonly reportAccess: (login: LoginIdentity) => Promise<void>
}
