// Test helper: the identities of the test world. Two tenants and three principals: alice and bob
// share the home tenant, mallory is in another. These are facts of the test world, not samples
// of the contract; the contract's sample builders are in `@omne-harness/mcp-contract/testing`.
import {
  access,
  accountCodec,
  organizationCodec,
  tenant,
  type Access,
  type TenantId,
} from '@omne-harness/legal-identity'

export type Principal = Readonly<{ id: string }>

export function tenantOf(last: string): TenantId {
  const organization = organizationCodec.parse(`org_0123456789abcdefghjkmnpqr${last}`)
  const account = accountCodec.parse(`acc_0123456789abcdefghjkmnpqr${last}`)
  if (!organization.ok || !account.ok) throw new TypeError('bad tenant sample')
  return tenant(organization.value, account.value)
}

export const home = tenantOf('s')
export const away = tenantOf('t')
export const alice: Access<Principal> = access({ id: 'alice' }, home)
export const bob: Access<Principal> = access({ id: 'bob' }, home)
export const mallory: Access<Principal> = access({ id: 'mallory' }, away)
/** The same principal text as alice, in the other tenant: what a tenant-blind key would merge. */
export const aliceAway: Access<Principal> = access({ id: 'alice' }, away)
export const principalKey = (principal: Principal): string => principal.id
