import { z } from 'zod'
import { createTenantPublishing } from '@omne-harness/assets'
import { createTenantPublisher } from '@omne-harness/assets-local'
import { assetCategoriesKey, assetPublishingKey } from '@omne-harness/assets-cordis-contract'
import { AssetPublishingService } from '@omne-harness/assets-cordis-contract/cordis'
import { principalVerifierKey, tenantStandingKey } from '@omne-harness/identity/cordis'
import { storageKey, tenantDomainLookupKey } from '@omne-harness/sql-contract/cordis'
import { defineRow } from '../../row.ts'
import { releaseOf } from '../../entry/tool-release.ts'
import { productionStorageCatalog } from '../storage/production-catalog.ts'
import { publishActing } from './acting.ts'
import { openTenantAssets, TenantAssetsHost } from './host.ts'
import { provideTenantAssets, tenantAssetsKey } from './service.ts'

export const tenantAssetsRowConfig = z.strictObject({ packageRoot: z.string().min(1) })

export const tenantAssetsRow = defineRow({
  row: 'tenant-assets',
  implementation: 'real',
  manifest: {
    provides: [tenantAssetsKey, assetPublishingKey],
    injects: [
      storageKey,
      tenantDomainLookupKey,
      principalVerifierKey,
      tenantStandingKey,
      assetCategoriesKey,
    ],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'body', phase: 'composition' },
  async body(ctx, raw) {
    const config = tenantAssetsRowConfig.parse(raw)
    const release = releaseOf(ctx)
    const store = {
      storage: ctx.storage,
      materials: await productionStorageCatalog(async () => release),
      packageRoot: config.packageRoot,
      categories: ctx.assetCategories.view,
    }
    const host = new TenantAssetsHost({
      domains: ctx.tenantDomainLookup,
      open: domain => openTenantAssets(store, domain),
    })
    provideTenantAssets(ctx, host)
    new AssetPublishingService(
      ctx,
      createTenantPublishing({
        acting: publishActing({ verifier: ctx.principalVerifier, standing: ctx.tenantStanding }),
        categories: ctx.assetCategories.view,
        async publisherOf(tenant) {
          const assets = await host.open(tenant)
          return assets === undefined ? undefined : createTenantPublisher(assets, tenant)
        },
      }),
    )
    ctx.effect(
      () => () => {
        void host.close()
      },
      'tenant-assets.close',
    )
    return {
      async stop() {
        await host.close()
        return { kind: 'settled' }
      },
    }
  },
})
