import { join } from 'node:path'
import type { CategoryView } from '@omne-harness/assets'
import { createAssetsLocal, tenantLayerSource, type AssetsLocal } from '@omne-harness/assets-local'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import { createSkillAccess, createSkillCatalog } from '@omne-harness/skill'
import type { SkillAccess, SkillCatalog } from '@omne-harness/skill-contract'
import {
  createContentStoreSource,
  createSkillDecisions,
  skillInputsFromAssets,
  type PackageDirectoryOf,
} from '@omne-harness/skill-host-local'
import type { DomainRef, SqlMaterialCatalog, TenantDomainLookup } from '@omne-harness/sql-contract'
import type { RankingParameters } from '@omne-harness/text-search'
import { governanceStorageCombinations } from '../governance/storage-combinations.ts'
import { sessionWorkOf } from '../tool-runtime/session-work.ts'

type Storage = Parameters<typeof createAssetsLocal>[0]['storage']

export type TenantSkills = Readonly<{
  catalog: SkillCatalog<unknown, unknown>
  access: SkillAccess<unknown, unknown>
  close(): Promise<void>
}>

export type TenantSkillsStore = Readonly<{
  storage: Storage
  materials: SqlMaterialCatalog
  packageRoot: string
  ranking: RankingParameters
  categories: Pick<CategoryView, 'lookup'>
}>

export type TenantSkillsHostOptions = Readonly<{
  domains: TenantDomainLookup
  open(tenant: TenantId, domain: DomainRef): Promise<TenantSkills>
}>

const GRANTED = Object.freeze({ kind: 'granted' } as const)
const REFUSED = Object.freeze({ kind: 'refused' } as const)

export function domainRoot(packageRoot: string, domain: DomainRef): string {
  return join(packageRoot, Buffer.from(domain.transactionDomain, 'utf8').toString('hex'))
}

export function directoryOf(assets: Pick<AssetsLocal, 'packages'>): PackageDirectoryOf {
  return async ({ ref, digest }) => {
    const place = await assets.packages.locate({ assetRef: ref, version: digest })
    switch (place.kind) {
      case 'local-directory':
        return succeed(place.path)
      case 'absent':
        return succeed(null)
      case 'unavailable':
        return fail('unavailable')
    }
  }
}

export async function openTenantSkills(
  options: TenantSkillsStore,
  tenant: TenantId,
  domain: DomainRef,
): Promise<TenantSkills> {
  const combination = governanceStorageCombinations(options.materials).assets
  const registered = await options.storage.registerCombination({ ...domain, ...combination })
  if (registered.kind !== 'registered') throw new Error(`skills combination ${registered.kind}`)
  const assets = createAssetsLocal({
    ...combination,
    domain,
    storage: options.storage,
    categories: options.categories,
    packageRoot: domainRoot(options.packageRoot, domain),
  })
  try {
    await assets.packages.recover()
  } catch (error) {
    await assets.close()
    throw error
  }
  const fromAssets = skillInputsFromAssets<unknown, unknown>({
    sources: [tenantLayerSource(assets)],
    async body(candidate) {
      const read = await assets.readVersion({
        assetRef: candidate.asset,
        version: candidate.version,
      })
      return read.kind === 'version' ? read.version.body : undefined
    },
  })
  const ownWork = (principal: unknown) => sessionWorkOf(principal, tenant) !== undefined
  const { resolution, readCheck } = createSkillDecisions<unknown, unknown>({
    layers: fromAssets.layers,
    identities: fromAssets.identities,
    eligible: async who => (ownWork(who.principal) ? 'yes' : 'no'),
    readable: async who => (ownWork(who.principal) ? GRANTED : REFUSED),
  })
  const source = createContentStoreSource({
    readerOf: ({ ref, digest }) => assets.packages.reader({ assetRef: ref, version: digest }),
    directoryOf: directoryOf(assets),
  })
  return {
    catalog: createSkillCatalog({ resolution, readCheck }, { ranking: options.ranking }),
    access: createSkillAccess({ resolution, readCheck, source }),
    close: () => assets.close(),
  }
}

/** One Skill service set per tenant, made on first use; a set only reads its own tenant domain. */
export class TenantSkillsHost {
  private readonly options: TenantSkillsHostOptions
  private readonly opening = new Map<string, Promise<TenantSkills | undefined>>()
  private closed = false

  constructor(options: TenantSkillsHostOptions) {
    this.options = options
  }

  get(tenant: TenantId): Promise<TenantSkills | undefined> {
    if (this.closed) return Promise.resolve(undefined)
    const encoded = tenantCodec.encode(tenant)
    if (!encoded.ok) return Promise.resolve(undefined)
    const key = encoded.value
    const known = this.opening.get(key)
    if (known !== undefined) return known
    const made = this.open(key, tenant)
    this.opening.set(key, made)
    void made.then(set => {
      if (set === undefined) this.opening.delete(key)
    })
    return made
  }

  private async open(key: string, tenant: TenantId): Promise<TenantSkills | undefined> {
    try {
      const found = await this.options.domains.lookup({ tenant: key })
      if (found.kind !== 'ready') return undefined
      const { domain } = found
      if (domain.scope.kind !== 'tenant' || domain.scope.tenant !== key) return undefined
      const set = await this.options.open(tenant, domain)
      if (!this.closed) return set
      await set.close()
      return undefined
    } catch {
      return undefined
    }
  }

  async close(): Promise<void> {
    this.closed = true
    const sets = await Promise.all(this.opening.values())
    await Promise.all(sets.map(set => set?.close()))
  }
}

const CATALOG_UNKNOWN = Object.freeze(fail('unknown' as const))
const ACCESS_UNKNOWN = Object.freeze(fail({ kind: 'unknown' } as const))

/** The two Skill services over all tenants: each call goes to the set of its own tenant. */
export function routedSkills(host: TenantSkillsHost): Readonly<{
  catalog: SkillCatalog<unknown, unknown>
  access: SkillAccess<unknown, unknown>
}> {
  return {
    catalog: {
      async summaries(access, scope, capabilities) {
        const set = await host.get(access.tenant)
        return set === undefined
          ? CATALOG_UNKNOWN
          : set.catalog.summaries(access, scope, capabilities)
      },
      async search(access, scope, query) {
        const set = await host.get(access.tenant)
        return set === undefined ? CATALOG_UNKNOWN : set.catalog.search(access, scope, query)
      },
    },
    access: {
      async read(access, scope, target, options) {
        const set = await host.get(access.tenant)
        return set === undefined ? ACCESS_UNKNOWN : set.access.read(access, scope, target, options)
      },
      async list(access, scope, capability, options) {
        const set = await host.get(access.tenant)
        return set === undefined
          ? ACCESS_UNKNOWN
          : set.access.list(access, scope, capability, options)
      },
    },
  }
}
