import type { Context } from '@deepseek-ai/cordis'
import {
  AuthorizationRecordsService,
  CatalogStoreService,
  ContinuationRecordsService,
  mcpAuthorizationRecordsKey,
  mcpCatalogStoreKey,
  mcpContinuationRecordsKey,
  mcpTaskRecordsKey,
  TaskRecordsService,
} from '@omne-harness/mcp-cordis-contract/cordis'
import type {
  AuthorizationRecords,
  CatalogStore,
  ContinuationRecords,
  TaskRecords,
} from '@omne-harness/mcp-contract/provider'
import {
  createSqlAuthorizationRecords,
  createSqlCatalogStore,
  createSqlContinuationRecords,
  createSqlTaskRecords,
  mcpStoreParticipant,
  type McpSqlOptions,
} from '@omne-harness/mcp-storage-sql'
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

function sqlOptions(ctx: Context): McpSqlOptions {
  const logger = ctx.logger('mcp-storage-sql')
  const storage = ctx.get(storageKey) as SqlStorage
  const bind = createTenantBindings({
    storage,
    lookup: ctx.get(tenantDomainLookupKey) as TenantDomainLookup,
    registration: () =>
      ctx.get(tenantDomainRegistrationKey) as TenantDomainRegistration | undefined,
    combination: mcpCombination,
    report: (tenant, reason) => logger.warn('no mcp storage for tenant %s: %s', tenant, reason),
    participants: MCP_PARTICIPANTS,
  })
  return { storage, bind }
}

/** The catalogs of MCP over the SQL storage of the tree, one storage domain per tenant. */
class SqlCatalogStore extends CatalogStoreService {
  declare readonly read: CatalogStore['read']
  declare readonly write: CatalogStore['write']

  constructor(ctx: Context) {
    super(ctx)
    Object.assign(this, createSqlCatalogStore(sqlOptions(ctx)))
  }
}

/** The task table of MCP in the same storage domain of the tenant. */
class SqlTaskRecords extends TaskRecordsService {
  declare readonly record: TaskRecords['record']
  declare readonly read: TaskRecords['read']
  declare readonly move: TaskRecords['move']
  declare readonly following: TaskRecords['following']

  constructor(ctx: Context) {
    super(ctx)
    Object.assign(this, createSqlTaskRecords(sqlOptions(ctx)))
  }
}

/** The continuation records of MCP in the same storage domain of the tenant. */
class SqlContinuationRecords extends ContinuationRecordsService {
  declare readonly mark: ContinuationRecords['mark']

  constructor(ctx: Context) {
    super(ctx)
    Object.assign(this, createSqlContinuationRecords(sqlOptions(ctx)))
  }
}

/** The OAuth grants of MCP in the storage domain of their tenant; the tokens are not here. */
class SqlAuthorizationRecords extends AuthorizationRecordsService {
  declare readonly begin: AuthorizationRecords['begin']
  declare readonly take: AuthorizationRecords['take']
  declare readonly void: AuthorizationRecords['void']
  declare readonly read: AuthorizationRecords['read']
  declare readonly write: AuthorizationRecords['write']
  declare readonly remove: AuthorizationRecords['remove']
  declare readonly registration: AuthorizationRecords['registration']
  declare readonly register: AuthorizationRecords['register']

  constructor(ctx: Context) {
    super(ctx)
    Object.assign(this, createSqlAuthorizationRecords(sqlOptions(ctx)))
  }
}

export const mcpStorageSqlRow = defineRow({
  row: 'mcp-storage-sql',
  implementation: 'real',
  manifest: {
    provides: [
      mcpCatalogStoreKey,
      mcpContinuationRecordsKey,
      mcpTaskRecordsKey,
      mcpAuthorizationRecordsKey,
    ],
    injects: [storageKey, tenantDomainLookupKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: {
    name: 'mcp-storage-sql',
    inject: [storageKey, tenantDomainLookupKey],
    apply(ctx: Context) {
      new SqlCatalogStore(ctx)
      new SqlContinuationRecords(ctx)
      new SqlTaskRecords(ctx)
      new SqlAuthorizationRecords(ctx)
    },
  },
})
