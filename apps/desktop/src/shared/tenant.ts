import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'

export function tenantText(tenant: TenantId): string {
  const text = tenantCodec.encode(tenant)
  if (!text.ok) throw new TypeError('a tenant decoded from an answer did not encode')
  return text.value
}
