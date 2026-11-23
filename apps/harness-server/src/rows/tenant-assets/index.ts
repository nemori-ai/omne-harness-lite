import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { createTenantManagement, createTenantPublishing } from '@omne-harness/assets'
import { createTenantLayerStore, createTenantPublisher } from '@omne-harness/assets-local'
import {
  assetCategoriesKey,
  assetChangesKey,
  assetManagementKey,
  assetPublishingKey,
} from '@omne-harness/assets-cordis-contract'
import {
  AssetChangesService,
  AssetManagementService,
  AssetPublishingService,
} from '@omne-harness/assets-cordis-contract/cordis'
import { principalVerifierKey, tenantStandingKey } from '@omne-harness/identity/cordis'
import { storageKey, tenantDomainLookupKey } from '@omne-harness/sql-contract/cordis'
import { defineRow } from '../../row.ts'
import { releaseOf } from '../../entry/tool-release.ts'
import { productionStorageCatalog } from '../storage/production-catalog.ts'
import { publishActing } from './acting.ts'
import { createAssetChangeFeed } from './changes.ts'
import { heldOnRegistry } from './held.ts'
import { openTenantAssets, TenantAssetsHost } from './host.ts'
import { provideTenantAssets, tenantAssetsKey } from './service.ts'

const positive = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)

export const tenantAssetsRowConfig = z.strictObject({
  packageRoot: z.string().min(1),
  uploads: z
    .strictObject({
      idleSeconds: positive.default(3600),
      maxOpen: positive.default(8),
      partBytes: positive.default(524_288),
    })
    .prefault({}),
})

/** Sweeps idle uploads of every open tenant on a timer bound to the row's scope. */
function sweepUploads(ctx: Context, host: TenantAssetsHost, idleMs: number): void {
  ctx.effect(() => {
    const timer = setInterval(
      () => {
        void host
          .opened()
          .then(all => Promise.all(all.map(assets => assets.uploads.sweep())))
          .catch(() => undefined)
      },
      Math.max(1000, Math.floor(idleMs / 2)),
    )
    timer.unref()
    return () => clearInterval(timer)
  }, 'tenant-assets.sweep-uploads')
}

export const tenantAssetsRow = defineRow({
  row: 'tenant-assets',
  implementation: 'real',
  manifest: {
    provides: [tenantAssetsKey, assetPublishingKey, assetManagementKey, assetChangesKey],
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
    const categories = ctx.assetCategories.view
    const changes = createAssetChangeFeed()
    const logger = ctx.logger('tenant-assets')
    const held = heldOnRegistry(
      () => ctx.assetCategories,
      message => logger.warn(message),
    )
    ctx.on('dynamis-cordis/changed', () => held.registryChanged())
    const idleMs = config.uploads.idleSeconds * 1000
    const store = {
      storage: ctx.storage,
      materials: await productionStorageCatalog(async () => release),
      packageRoot: config.packageRoot,
      categories,
      uploads: { idleMs, maxOpen: config.uploads.maxOpen, partBytes: config.uploads.partBytes },
      changed: changes.changed,
      heldOf: held.heldOf,
    }
    const host = new TenantAssetsHost({
      domains: ctx.tenantDomainLookup,
      open: domain => openTenantAssets(store, domain),
    })
    const layerSources = held.sourcesOf(tenantRef => host.open(tenantRef))
    provideTenantAssets(ctx, {
      open: tenantRef => host.open(tenantRef),
      standing: tenantRef => host.standing(tenantRef),
      layerSources,
    })
    const acting = publishActing({ verifier: ctx.principalVerifier, standing: ctx.tenantStanding })
    const publishing = createTenantPublishing({
      acting,
      categories,
      async publisherOf(tenant) {
        const assets = await host.open(tenant)
        return assets === undefined ? undefined : createTenantPublisher(assets, tenant)
      },
    })
    new AssetPublishingService(ctx, publishing)
    new AssetManagementService(
      ctx,
      createTenantManagement({
        acting,
        categories,
        publishing,
        async storeOf(tenant) {
          const assets = await host.open(tenant)
          return assets === undefined
            ? undefined
            : createTenantLayerStore(assets, tenant, categories, layerSources(tenant))
        },
      }),
    )
    new AssetChangesService(ctx, changes)
    sweepUploads(ctx, host, idleMs)
    ctx.effect(
      () => () => {
        changes.close()
        void host.close()
      },
      'tenant-assets.close',
    )
    return {
      async stop() {
        changes.close()
        await host.close()
        return { kind: 'settled' }
      },
    }
  },
})
