// A tenant's wire text: what the acting-tenant header carries and what the session workspace gets.
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'

/** A `TenantId` decoded from an answer was minted by the codec, so writing it back cannot fail. */
export function tenantText(tenant: TenantId): string {
  const text = tenantCodec.encode(tenant)
  if (!text.ok) throw new TypeError('a tenant decoded from an answer did not encode')
  return text.value
}
