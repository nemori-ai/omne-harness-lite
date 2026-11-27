import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'

/** The application decides whether this login acts for the tenant; the plugin cannot read a login. */
export interface InterfacePrincipals {
  actingFor(
    login: LoginIdentity,
    tenant: string,
  ): Promise<{ readonly ok: Principal } | { readonly refused: 'denied' | 'basis-unavailable' }>
}
