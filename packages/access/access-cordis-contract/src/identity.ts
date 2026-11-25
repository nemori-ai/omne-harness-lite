import type { LoginIdentity, Principal } from './contribution.ts'

export type IdentityFailure = { readonly outcome: 'denied' | 'basis-unavailable' }

export type LoginResult =
  | { readonly outcome: 'identified'; readonly login: LoginIdentity }
  | IdentityFailure

export type ActForResult =
  | { readonly outcome: 'issued'; readonly principal: Principal }
  | IdentityFailure

export type AccessIdentity = {
  readonly identifyLogin: (proof: string) => Promise<LoginResult>
  readonly actFor: (login: LoginIdentity, tenant: string) => Promise<ActForResult>
  /** The login a member of this server recorded when it identified the person, for the tenant they acted for. */
  readonly resumeLogin: (login: string, tenant: string) => Promise<LoginResult>
  readonly reportAccess: (login: LoginIdentity) => Promise<void>
}
