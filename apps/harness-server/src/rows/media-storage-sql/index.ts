import type { Context } from '@deepseek-ai/cordis'
import type { MediaIndex } from '@omne-harness/media-contract'
import { MediaIndexService, mediaIndexKey } from '@omne-harness/media-cordis-contract/cordis'
import { createSqlMediaIndex } from '@omne-harness/media-storage-sql'
import type { SqlStorage, TenantDomainLookup } from '@omne-harness/sql-contract'
import { storageKey, tenantDomainLookupKey } from '@omne-harness/sql-contract/cordis'
import { defineRow } from '../../row.ts'
import {
  tenantDomainRegistrationKey,
  type TenantDomainRegistration,
} from '../governance/tenant-domain-registration-service.ts'
import { createTenantBindings, mediaCombination } from './binding.ts'

/** The metadata of media over the SQL storage of the tree, one storage domain per tenant. */
class SqlMediaIndex extends MediaIndexService {
  static readonly inject = [storageKey, tenantDomainLookupKey]
  declare readonly insertUploading: MediaIndex['insertUploading']
  declare readonly attachWrite: MediaIndex['attachWrite']
  declare readonly readUpload: MediaIndex['readUpload']
  declare readonly advance: MediaIndex['advance']
  declare readonly stageOrMerge: MediaIndex['stageOrMerge']
  declare readonly holdIfLive: MediaIndex['holdIfLive']
  declare readonly readLive: MediaIndex['readLive']
  declare readonly markDeleting: MediaIndex['markDeleting']
  declare readonly markDeletingIfExpired: MediaIndex['markDeletingIfExpired']
  declare readonly listDeleting: MediaIndex['listDeleting']
  declare readonly dropRow: MediaIndex['dropRow']

  constructor(ctx: Context) {
    super(ctx)
    const logger = ctx.logger('media-storage-sql')
    const bind = createTenantBindings({
      storage: ctx.get(storageKey) as SqlStorage,
      lookup: ctx.get(tenantDomainLookupKey) as TenantDomainLookup,
      registration: () =>
        ctx.get(tenantDomainRegistrationKey) as TenantDomainRegistration | undefined,
      combination: mediaCombination,
      report: (tenant, reason) => logger.warn('no media storage for tenant %s: %s', tenant, reason),
    })
    Object.assign(this, createSqlMediaIndex({ storage: ctx.get(storageKey) as SqlStorage, bind }))
  }
}

export const mediaStorageSqlRow = defineRow({
  row: 'media-storage-sql',
  implementation: 'real',
  manifest: {
    provides: [mediaIndexKey],
    injects: [storageKey, tenantDomainLookupKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: SqlMediaIndex,
})
