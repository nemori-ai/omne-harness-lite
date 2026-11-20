import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import type { Usage } from '@omne-harness/usage-contract'

/** Issues the principal acting for a tenant on behalf of this login, or says why it cannot. */
export interface UsagePrincipals {
  actingFor(
    login: LoginIdentity,
    tenant: string,
  ): Promise<{ readonly ok: Principal } | { readonly refused: 'denied' | 'basis-unavailable' }>
}

export type UsageFace = Usage<Principal>
