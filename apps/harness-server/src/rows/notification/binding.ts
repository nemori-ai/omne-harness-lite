import { tenantIdSchema, type TenantId } from '@omne-harness/notification-contract'
import {
  notificationPersistenceParticipant,
  type TenantBinding,
} from '@omne-harness/notification-local'
import type {
  SqlStorage,
  TenantDomainListing,
  TenantDomainLookup,
} from '@omne-harness/sql-contract'
import type { TenantDomainRegistration } from '../governance/tenant-domain-registration-service.ts'
import { tenantDomainOf } from '../schedule/tenant-domain.ts'

export const NOTIFICATION_PARTICIPANTS = [notificationPersistenceParticipant]

export type Combination = Readonly<{ combinationVersion: string; manifestDigest: string }>

export type TenantBindingPorts = Readonly<{
  storage: Pick<SqlStorage, 'registerCombination'>
  lookup: TenantDomainLookup
  /** Taken at each first ask of a tenant; absent while nobody can register a domain. */
  registration(): TenantDomainRegistration | undefined
  combination(): Promise<Combination>
  listing(): Promise<TenantDomainListing>
}>

/** Each tenant's notifications live in its own domain, where the combination is registered. A cache: no binding is asked again. */
export function createTenantBindings(ports: TenantBindingPorts) {
  const bound = new Map<TenantId, Promise<TenantBinding | null>>()
  let combination: Promise<Combination> | undefined

  async function open(tenant: TenantId): Promise<TenantBinding | null> {
    const domain = await tenantDomainOf(
      { lookup: ports.lookup, registration: ports.registration() },
      tenant,
    )
    if (domain === undefined) return null
    const pending = (combination ??= ports.combination())
    const fixed = await pending.catch(error => {
      if (combination === pending) combination = undefined
      throw error
    })
    const { scope, transactionDomain } = domain
    const registered = await ports.storage.registerCombination({
      scope,
      transactionDomain,
      ...fixed,
      participants: NOTIFICATION_PARTICIPANTS,
    })
    return registered.kind === 'registered' ? { transactionDomain, ...fixed } : null
  }

  return {
    bind(tenant: TenantId): Promise<TenantBinding | null> {
      const known = bound.get(tenant)
      if (known !== undefined) return known
      const opening = open(tenant)
        .catch(() => null)
        .then(binding => {
          if (binding === null && bound.get(tenant) === opening) bound.delete(tenant)
          return binding
        })
      bound.set(tenant, opening)
      return opening
    },
    async tenants(): Promise<readonly TenantId[] | null> {
      const listing = await ports.listing().catch(() => null)
      if (listing === null || listing.kind !== 'ready') return null
      return listing.entries.flatMap(({ tenant, domain }) =>
        domain.scope.kind === 'tenant' && domain.scope.tenant === tenant
          ? [tenantIdSchema.parse(tenant)]
          : [],
      )
    },
  }
}
