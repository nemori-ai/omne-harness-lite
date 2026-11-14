import { encodeTenantText, readTenantText, type TenantId } from '@omne-harness/public-contract'

export type { TenantId }

export function parseTenantText(text: string): TenantId | undefined {
  return readTenantText(text)
}

export function tenantText(tenant: TenantId): string {
  return encodeTenantText(tenant)
}
