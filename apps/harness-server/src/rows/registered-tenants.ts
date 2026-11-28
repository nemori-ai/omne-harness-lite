import type { TenantDomainListing } from '@omne-harness/sql-contract'

export type RegisteredTenantsPorts = Readonly<{
  listing(): Promise<TenantDomainListing>
  open(tenant: string): void | Promise<void>
  warn(message: string): void
}>

const CONCURRENCY = 4

const textOf = (error: unknown): string =>
  error instanceof Error ? error.message : 'a thrown value that is not an error'

export async function openRegisteredTenants(
  label: string,
  ports: RegisteredTenantsPorts,
): Promise<number> {
  let listing: TenantDomainListing
  try {
    listing = await ports.listing()
  } catch {
    ports.warn(`${label}: the tenant domain listing threw; tenants open on first use`)
    return 0
  }
  if (listing.kind !== 'ready') {
    ports.warn(
      `${label}: the tenant domain listing answered ${listing.kind}; tenants open on first use`,
    )
    return 0
  }
  const tenants = listing.entries.flatMap(({ tenant, domain }) =>
    domain.scope.kind === 'tenant' ? [tenant] : [],
  )
  const waiting = [...tenants]
  const work = async (): Promise<void> => {
    for (let tenant = waiting.shift(); tenant !== undefined; tenant = waiting.shift()) {
      try {
        await ports.open(tenant)
      } catch (error) {
        ports.warn(
          `${label}: the tenant ${tenant} did not open: ${textOf(error)}; it opens on first use`,
        )
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tenants.length) }, work))
  return tenants.length
}
