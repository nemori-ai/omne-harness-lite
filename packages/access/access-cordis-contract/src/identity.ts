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
  readonly reportAccess: (login: LoginIdentity) => Promise<void>
}
