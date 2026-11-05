import { encodeTenantText, readTenantText, type TenantId } from '@omne-harness/public-contract'

export type { TenantId }

/** The tenant a text names, or `undefined` when the text is not a tenant text of the contract. */
export function parseTenantText(text: string): TenantId | undefined {
  return readTenantText(text)
}

/** The tenant text of a tenant that `parseTenantText` or a response read produced. */
export function tenantText(tenant: TenantId): string {
  return encodeTenantText(tenant)
}
