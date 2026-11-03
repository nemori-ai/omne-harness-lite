// The two tenant helpers the Model application module shares (review R2-D108 N5): the equality of
// two tenant ids, and the key of one `(tenant, call)` pair for the tables the composition and the
// qualification registry keep. A tenant that does not encode has no key and equals nothing.
import { tenantCodec, tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import type { ModelCallId } from '@omne-harness/model-contract'

/** Two tenant ids are the same tenant only when both encode and compare equal. */
export function sameTenant(left: TenantId, right: TenantId): boolean {
  return tenantCodec.encode(left).ok && tenantCodec.encode(right).ok && tenantEquals(left, right)
}

/** The table key of one call of one tenant; `undefined` when the tenant does not encode. */
export function callKey(tenant: TenantId, call: ModelCallId): string | undefined {
  const text = tenantCodec.encode(tenant)
  return text.ok ? JSON.stringify([text.value, call]) : undefined
}
