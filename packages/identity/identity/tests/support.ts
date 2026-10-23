// Fixtures of the identity tests: parsed tenants.
import { accountCodec, organizationCodec, tenant, type TenantId } from '@omne-harness/legal-identity'

export const ORGANIZATION_TEXT = 'org_abcdefghjkmnpqrstvwxyz2345'
export const ADMIN_ACCOUNT_TEXT = 'acc_abcdefghjkmnpqrstvwxyz2345'

export function parsedTenant(organization: string, account: string): TenantId {
  const org = organizationCodec.parse(organization)
  const acc = accountCodec.parse(account)
  if (!org.ok || !acc.ok) throw new Error('fixture did not parse')
  return tenant(org.value, acc.value)
}
