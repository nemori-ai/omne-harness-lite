import { join } from 'node:path'
import type { CategoryView, HeldPort } from '@omne-harness/assets'
import { createAssetsLocal, type AssetsLocal, type UploadPolicy } from '@omne-harness/assets-local'
import type { DomainRef, SqlMaterialCatalog, TenantDomainLookup } from '@omne-harness/sql-contract'
import { governanceStorageCombinations } from '../governance/storage-combinations.ts'

type Storage = Parameters<typeof createAssetsLocal>[0]['storage']

export type TenantAssetsStore = Readonly<{
  storage: Storage
  materials: SqlMaterialCatalog
  packageRoot: string
  categories: Pick<CategoryView, 'lookup'>
  uploads?: UploadPolicy
  changed?: (tenant: string) => void
  /** Where what one tenant holds is told; the tenant is the one whose assets are opened, never a field of a request. */
  heldOf?: (tenant: string) => HeldPort
}>

export function domainRoot(packageRoot: string, domain: DomainRef): string {
  return join(packageRoot, Buffer.from(domain.transactionDomain, 'utf8').toString('hex'))
}

export async function openTenantAssets(
  store: TenantAssetsStore,
  domain: DomainRef,
): Promise<AssetsLocal> {
  const combination = governanceStorageCombinations(store.materials).assets
  const registered = await store.storage.registerCombination({ ...domain, ...combination })
  if (registered.kind !== 'registered') throw new Error(`assets combination ${registered.kind}`)
  const { changed, heldOf } = store
  const tenant = domain.scope.kind === 'tenant' ? domain.scope.tenant : undefined
  const assets = createAssetsLocal({
    ...combination,
    domain,
    storage: store.storage,
    categories: store.categories,
    packageRoot: domainRoot(store.packageRoot, domain),
    ...(store.uploads === undefined ? {} : { uploads: store.uploads }),
    ...(changed === undefined || tenant === undefined
      ? {}
      : { onCommitted: () => changed(tenant) }),
    ...(heldOf === undefined || tenant === undefined ? {} : { held: heldOf(tenant) }),
  })
  try {
    await assets.packages.recover()
    await assets.syncHeld()
  } catch (error) {
    await assets.close()
    throw error
  }
  return assets
}

export type TenantAssetsHostOptions = Readonly<{
  domains: TenantDomainLookup
  open(domain: DomainRef): Promise<AssetsLocal>
  /** Registers the domain of a tenant; true when it is ready. Without it a write of a tenant never registered finds nothing. */
  register?(tenantRef: string): Promise<boolean>
}>

/** Opens the local assets of a tenant once and recovers it once: the publish order assumes no second one. */
export class TenantAssetsHost {
  private readonly options: TenantAssetsHostOptions
  private readonly opening = new Map<string, Promise<AssetsLocal | undefined>>()
  private closed = false

  constructor(options: TenantAssetsHostOptions) {
    this.options = options
  }

  open(tenantRef: string): Promise<AssetsLocal | undefined> {
    if (this.closed) return Promise.resolve(undefined)
    const known = this.opening.get(tenantRef)
    if (known !== undefined) return known
    const made = this.make(tenantRef)
    this.opening.set(tenantRef, made)
    void made.then(assets => {
      if (assets === undefined) this.opening.delete(tenantRef)
    })
    return made
  }

  /** The assets of a tenant for a write that was admitted for it: a tenant never registered is registered first. A read never registers. */
  async openForWriting(tenantRef: string): Promise<AssetsLocal | undefined> {
    if ((await this.standing(tenantRef)) === 'unregistered') {
      const ready = await this.options.register?.(tenantRef).catch(() => false)
      if (ready !== true) return undefined
    }
    return this.open(tenantRef)
  }

  /** Whether a tenant has assets to speak of. One whose domain was never registered holds nothing; that is not the same as not knowing. */
  async standing(tenantRef: string): Promise<'registered' | 'unregistered' | 'unknown'> {
    try {
      const found = await this.options.domains.lookup({ tenant: tenantRef })
      if (found.kind === 'unregistered') return 'unregistered'
      const own =
        found.kind === 'ready' &&
        found.domain.scope.kind === 'tenant' &&
        found.domain.scope.tenant === tenantRef
      return own ? 'registered' : 'unknown'
    } catch {
      return 'unknown'
    }
  }

  private async make(tenantRef: string): Promise<AssetsLocal | undefined> {
    try {
      const found = await this.options.domains.lookup({ tenant: tenantRef })
      if (found.kind !== 'ready') return undefined
      const { domain } = found
      if (domain.scope.kind !== 'tenant' || domain.scope.tenant !== tenantRef) return undefined
      const assets = await this.options.open(domain)
      if (!this.closed) return assets
      await assets.close()
      return undefined
    } catch {
      return undefined
    }
  }

  /** The local assets opened so far; a tenant still opening is waited for. */
  async opened(): Promise<AssetsLocal[]> {
    const all = await Promise.all(this.opening.values())
    return all.filter(assets => assets !== undefined)
  }

  async close(): Promise<void> {
    this.closed = true
    const opened = await Promise.all(this.opening.values())
    await Promise.all(opened.map(assets => assets?.close()))
  }
}
