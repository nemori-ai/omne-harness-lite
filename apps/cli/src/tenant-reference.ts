import { checkedTenantBinding, type TenantBinding } from './state-layout-values.ts'
import { StateLayoutFailure } from './state-layout.ts'
import { payloadJSON } from './input.ts'

/** CLI references include the full center and account scope. They are never paths. */
export function tenantReference(binding: TenantBinding): string {
  return JSON.stringify(checkedTenantBinding(binding))
}
export function parseTenantReference(text: string): TenantBinding {
  if (Buffer.byteLength(text) > 64 * 1024) throw new StateLayoutFailure('invalid-binding')
  return checkedTenantBinding(payloadJSON(text))
}
