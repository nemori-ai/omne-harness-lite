import type { DomainRef, TenantDomainLookup } from '@omne-harness/sql-contract'
import type { TenantDomainRegistration } from '../governance/tenant-domain-registration-service.ts'

/**
 * The tenant's own transaction domain, registered the first time a tenant asks. Undefined when it is
 * not there and cannot be registered now, or when the lookup answers a domain of some other scope.
 */
export async function tenantDomainOf(
  ports: Readonly<{
    lookup: TenantDomainLookup
    registration: TenantDomainRegistration | undefined
  }>,
  tenant: string,
): Promise<DomainRef | undefined> {
  const ownOrUndefined = (found: Awaited<ReturnType<TenantDomainLookup['lookup']>>) =>
    found.kind === 'ready' &&
    found.domain.scope.kind === 'tenant' &&
    found.domain.scope.tenant === tenant
      ? found.domain
      : undefined
  const found = await ports.lookup.lookup({ tenant })
  if (found.kind !== 'unregistered') return ownOrUndefined(found)
  if (ports.registration === undefined) return undefined
  if ((await ports.registration.ensure({ tenant })).kind !== 'ready') return undefined
  return ownOrUndefined(await ports.lookup.lookup({ tenant }))
}
