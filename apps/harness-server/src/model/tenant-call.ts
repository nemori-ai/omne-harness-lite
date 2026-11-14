import { tenantCodec, tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import type { ModelCallId } from '@omne-harness/model-contract'

export function sameTenant(left: TenantId, right: TenantId): boolean {
  return tenantCodec.encode(left).ok && tenantCodec.encode(right).ok && tenantEquals(left, right)
}

export function callKey(tenant: TenantId, call: ModelCallId): string | undefined {
  const text = tenantCodec.encode(tenant)
  return text.ok ? JSON.stringify([text.value, call]) : undefined
}
