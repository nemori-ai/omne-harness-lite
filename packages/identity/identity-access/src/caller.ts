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

/**
 * The login and the acting tenant of a principal `actFor` issued: the work of an
 * `identity-login` principal is the login's text. `undefined` for a principal of another shape,
 * which this member never issued.
 */
export function actingOf(
  principal: Principal,
): Readonly<{ login: LoginStateId; tenant: TenantId }> | undefined {
  const acting = principal as unknown as ActingForTenantPrincipal
  if (acting.kind !== 'acting-for-tenant' || acting.work.owner !== LOGIN_WORK_OWNER)
    return undefined
  const login = loginStateCodec.parse(acting.work.work)
  return login.ok ? { login: login.value, tenant: acting.tenant } : undefined
}

export function loginTextOf(login: LoginStateId): string {
  const encoded = loginStateCodec.encode(login)
  if (!encoded.ok) throw new TypeError('identity-access: login is not a minted LoginStateId')
  return encoded.value
}
