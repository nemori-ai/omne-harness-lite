// What the opaque `LoginIdentity` and `Principal` of the access entry are on identity's side. Only
// this member creates them (`createAccessIdentity`), so only this member reads them back.
import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import {
  loginStateCodec,
  type AccountId,
  type LoginStateId,
  type TenantId,
} from '@omne-harness/legal-identity'

/** A recognised login: its account, the login itself and its current tenant selection. */
export type Caller = Readonly<{
  account: AccountId
  login: LoginStateId
  loginText: string
  tenant: TenantId
}>

/** The `work.owner` of a principal a login produced (identity ID-16 holder table). */
export const LOGIN_WORK_OWNER = 'identity-login'

export function loginIdentityOf(caller: Caller): LoginIdentity {
  return Object.freeze({ ...caller }) as unknown as LoginIdentity
}

export function callerOf(login: LoginIdentity): Caller {
  return login as unknown as Caller
}

export function principalOf(principal: ActingForTenantPrincipal): Principal {
  return principal as unknown as Principal
}

/** The input every acting-tenant method of the governance port takes (`GovernanceActing`). */
export type Acting = Readonly<{ login: LoginStateId; actingTenant: TenantId }>

/**
 * The login and the acting tenant of a principal `actFor` issued: its work is the login's text.
 * Only `actFor` creates a `Principal`, so text that is not a login is a broken invariant, thrown.
 */
export function actingOf(principal: Principal): Acting {
  const acting = principal as unknown as ActingForTenantPrincipal
  const login = loginStateCodec.parse(acting.work.work)
  if (!login.ok) throw new TypeError('identity-access: the principal was not issued by actFor')
  return { login: login.value, actingTenant: acting.tenant }
}

export function loginTextOf(login: LoginStateId): string {
  const encoded = loginStateCodec.encode(login)
  if (!encoded.ok) throw new TypeError('identity-access: login is not a minted LoginStateId')
  return encoded.value
}
