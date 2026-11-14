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
export const aliceAway: Access<Principal> = access({ id: 'alice' }, away)
export const principalKey = (principal: Principal): string => principal.id
