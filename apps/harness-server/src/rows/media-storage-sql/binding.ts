import { mediaIndexParticipant, type TenantBinding } from '@omne-harness/media-storage-sql'
import {
  combinationManifest,
  manifestDigest,
  type SqlStorage,
  type TenantDomainLookup,
} from '@omne-harness/sql-contract'
import type { TenantDomainRegistration } from '../governance/tenant-domain-registration-service.ts'
import { tenantDomainOf } from '../schedule/tenant-domain.ts'
import { productionStorageCatalog } from '../storage/production-catalog.ts'

export const MEDIA_PARTICIPANTS = [mediaIndexParticipant]

export type Combination = Readonly<{ combinationVersion: string; manifestDigest: string }>

/** The storage combination of the media participant, from the catalogue of the running code. */
export async function mediaCombination(): Promise<Combination> {
  const catalog = await productionStorageCatalog()
  const manifest = combinationManifest({ catalog, participants: MEDIA_PARTICIPANTS })
  if (manifest.kind !== 'manifest') throw new Error('media combination is not registrable')
  const digest = manifestDigest(manifest.manifest)
  return { combinationVersion: `harness-media/${digest.slice(0, 16)}`, manifestDigest: digest }
}

export type TenantBindingPorts = Readonly<{
  storage: Pick<SqlStorage, 'registerCombination'>
  lookup: TenantDomainLookup
  /** Taken at each first ask of a tenant; absent while nobody can register a domain. */
  registration(): TenantDomainRegistration | undefined
  combination(): Promise<Combination>
  report(tenant: string, reason: string): void
}>

/** The metadata of a tenant's media lives in its own domain. A binding that was had is not asked again. */
export function createTenantBindings(ports: TenantBindingPorts) {
  const bound = new Map<string, Promise<TenantBinding | null>>()
  let combination: Promise<Combination> | undefined

  async function open(tenant: string): Promise<TenantBinding | null> {
    const registration = ports.registration()
    const domain = await tenantDomainOf({ lookup: ports.lookup, registration }, tenant)
    if (domain === undefined) return null
    const fixed = await (combination ??= ports.combination()).catch(error => {
      combination = undefined
      throw error
    })
    const { scope, transactionDomain } = domain
    const registered = await ports.storage.registerCombination({
      scope,
      transactionDomain,
      ...fixed,
      participants: MEDIA_PARTICIPANTS,
    })
    if (registered.kind === 'registered') return { transactionDomain, ...fixed }
    ports.report(tenant, `the storage answered ${registered.kind}`)
    return null
  }

  return function bind(tenant: string): Promise<TenantBinding | null> {
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
  }
}
