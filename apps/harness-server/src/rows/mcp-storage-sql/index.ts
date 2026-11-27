import type { Context } from '@deepseek-ai/cordis'
import { CatalogStoreService, mcpCatalogStoreKey } from '@omne-harness/mcp-cordis-contract/cordis'
import type { CatalogStore } from '@omne-harness/mcp-contract/provider'
import { createSqlCatalogStore, mcpStoreParticipant } from '@omne-harness/mcp-storage-sql'
import {
  combinationManifest,
  manifestDigest,
  type SqlStorage,
  type TenantDomainLookup,
} from '@omne-harness/sql-contract'
import { storageKey, tenantDomainLookupKey } from '@omne-harness/sql-contract/cordis'
import { defineRow } from '../../row.ts'
import {
  tenantDomainRegistrationKey,
  type TenantDomainRegistration,
} from '../governance/tenant-domain-registration-service.ts'
import { createTenantBindings, type Combination } from '../media-storage-sql/binding.ts'
import { productionStorageCatalog } from '../storage/production-catalog.ts'

const MCP_PARTICIPANTS = [mcpStoreParticipant]

/** The storage combination of the MCP participant, from the catalogue of the running code. */
export async function mcpCombination(): Promise<Combination> {
  const catalog = await productionStorageCatalog()
  const manifest = combinationManifest({ catalog, participants: MCP_PARTICIPANTS })
  if (manifest.kind !== 'manifest') throw new Error('mcp combination is not registrable')
  const digest = manifestDigest(manifest.manifest)
  return { combinationVersion: `harness-mcp/${digest.slice(0, 16)}`, manifestDigest: digest }
}

/** The catalogs of MCP over the SQL storage of the tree, one storage domain per tenant. */
class SqlCatalogStore extends CatalogStoreService {
  static readonly inject = [storageKey, tenantDomainLookupKey]
  declare readonly read: CatalogStore['read']
  declare readonly write: CatalogStore['write']

  constructor(ctx: Context) {
    super(ctx)
    const logger = ctx.logger('mcp-storage-sql')
    const bind = createTenantBindings({
      storage: ctx.get(storageKey) as SqlStorage,
      lookup: ctx.get(tenantDomainLookupKey) as TenantDomainLookup,
      registration: () =>
        ctx.get(tenantDomainRegistrationKey) as TenantDomainRegistration | undefined,
      combination: mcpCombination,
      report: (tenant, reason) => logger.warn('no mcp storage for tenant %s: %s', tenant, reason),
      participants: MCP_PARTICIPANTS,
    })
    Object.assign(this, createSqlCatalogStore({ storage: ctx.get(storageKey) as SqlStorage, bind }))
  }
}

export const mcpStorageSqlRow = defineRow({
  row: 'mcp-storage-sql',
  implementation: 'real',
  manifest: {
    provides: [mcpCatalogStoreKey],
    injects: [storageKey, tenantDomainLookupKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: SqlCatalogStore,
})
