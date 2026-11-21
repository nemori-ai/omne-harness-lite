import type { TenantDomainListing } from '@omne-harness/sql-contract'

export type WarmTenantsPorts = Readonly<{
  listing(): Promise<TenantDomainListing>
  warm(tenantRef: string): void
  warn(message: string): void
}>

export async function warmRegisteredTenants(ports: WarmTenantsPorts): Promise<number> {
  let listing: TenantDomainListing
  try {
    listing = await ports.listing()
  } catch {
    ports.warn('governance warm-up: the tenant domain listing threw; tenants open on first use')
    return 0
  }
  if (listing.kind !== 'ready') {
    ports.warn(
      `governance warm-up: the tenant domain listing answered ${listing.kind}; tenants open on first use`,
    )
    return 0
  }
  let warmed = 0
  for (const { tenant, domain } of listing.entries) {
    if (domain.scope.kind !== 'tenant') continue
    ports.warm(tenant)
    warmed += 1
  }
  return warmed
}
