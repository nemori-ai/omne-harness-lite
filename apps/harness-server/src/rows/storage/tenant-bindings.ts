import type {
  SqlStorage,
  TenantDomainListing,
  TenantDomainLookup,
} from '@omne-harness/sql-contract'
import type { TenantDomainRegistration } from '../governance/tenant-domain-registration-service.ts'
import { tenantDomainOf } from '../schedule/tenant-domain.ts'

export type Combination = Readonly<{ combinationVersion: string; manifestDigest: string }>
export type DomainBinding = Combination & Readonly<{ transactionDomain: string }>
type Participants = Parameters<SqlStorage['registerCombination']>[0]['participants']

export type TenantBindingPorts<T extends string> = Readonly<{
  storage: Pick<SqlStorage, 'registerCombination'>
  lookup: TenantDomainLookup
  /** Taken at each first ask of a tenant; absent while nobody can register a domain. */
  registration(): TenantDomainRegistration | undefined
  combination(): Promise<Combination>
  listing(): Promise<TenantDomainListing>
  /** Told why a tenant that has a domain got no binding: the callers only see an unavailable basis. */
  report(tenant: T, reason: string): void
}>

/** Each tenant's rows of one domain live in the tenant's own transaction domain, where the combination
 * of the domain is registered. A cache: no binding is asked again. */
export function createDomainBindings<T extends string>(
  ports: TenantBindingPorts<T>,
  participants: Participants,
  tenantOf: (text: string) => T,
) {
  const bound = new Map<T, Promise<DomainBinding | null>>()
  let combination: Promise<Combination> | undefined

  async function open(tenant: T): Promise<DomainBinding | null> {
    const domain = await tenantDomainOf(
      { lookup: ports.lookup, registration: ports.registration() },
      tenant,
    )
    if (domain === undefined) return null
    const pending = (combination ??= ports.combination())
    const fixed = await pending.catch(error => {
      combination = undefined
      throw error
    })
    const { scope, transactionDomain } = domain
    const registered = await ports.storage.registerCombination({
      scope,
      transactionDomain,
      ...fixed,
      participants,
    })
    if (registered.kind === 'registered') return { transactionDomain, ...fixed }
    ports.report(tenant, `the storage answered ${registered.kind}`)
    return null
  }

  return {
    bind(tenant: T): Promise<DomainBinding | null> {
      const known = bound.get(tenant)
      if (known !== undefined) return known
      const opening = open(tenant)
        .catch((error: unknown) => {
          ports.report(tenant, String(error))
          return null
        })
        .then(binding => {
          if (binding === null) bound.delete(tenant)
          return binding
        })
      bound.set(tenant, opening)
      return opening
    },
    async tenants(): Promise<readonly T[] | null> {
      const listing = await ports.listing().catch(() => null)
      if (listing === null || listing.kind !== 'ready') return null
      return listing.entries.flatMap(({ tenant, domain }) =>
        domain.scope.kind === 'tenant' && domain.scope.tenant === tenant ? [tenantOf(tenant)] : [],
      )
    },
  }
}
