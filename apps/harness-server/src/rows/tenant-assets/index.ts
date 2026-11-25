import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { createTenantManagement, createTenantPublishing } from '@omne-harness/assets'
import {
  createTenantLayerStore,
  createTenantPublisher,
  type AssetsLocal,
} from '@omne-harness/assets-local'
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
import { dynamisKey, type DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import { every } from '@omne-harness/time-source'
import { defineRow } from '../../row.ts'
import {
  tenantDomainRegistrationKey,
  type TenantDomainRegistration,
} from '../governance/tenant-domain-registration-service.ts'
import { runTimeOf } from '../../entry/time.ts'
import { releaseOf } from '../../entry/tool-release.ts'
import { productionStorageCatalog } from '../storage/production-catalog.ts'
import { publishActing } from './acting.ts'
import { createAssetChangeFeed } from './changes.ts'
import { heldOnRegistry } from './held.ts'
import { publishStandingOf } from './held-standing.ts'
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
  ctx.effect(
    () =>
      every(
        runTimeOf(ctx),
        Math.max(1000, Math.floor(idleMs / 2)),
        () => {
          void host
            .opened()
            .then(all => Promise.all(all.map(assets => assets.uploads.sweep())))
            .catch(() => undefined)
        },
        { background: true },
      ),
    'tenant-assets.sweep-uploads',
  )
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
      () => (ctx.get(dynamisKey) as DynamisService | undefined)?.registry(),
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
      async register(tenant) {
        const registration = ctx.get(tenantDomainRegistrationKey) as
          | TenantDomainRegistration
          | undefined
        return (await registration?.ensure({ tenant }))?.kind === 'ready'
      },
    })
    const layerSources = held.sourcesOf(tenantRef => host.open(tenantRef))
    const official = () => ctx.assetCategories.official()
    provideTenantAssets(ctx, {
      open: tenantRef => host.open(tenantRef),
      standing: tenantRef => host.standing(tenantRef),
      layerSources,
      official,
    })
    const layerStoreOf = (tenant: string, assets: AssetsLocal | undefined) =>
      assets === undefined
        ? undefined
        : createTenantLayerStore(assets, tenant, categories, layerSources(tenant))
    const acting = publishActing({ verifier: ctx.principalVerifier, standing: ctx.tenantStanding })
    const publishing = createTenantPublishing({
      acting,
      categories,
      standing: async (tenant, capability) => publishStandingOf(ctx, capability, tenant),
      async publisherOf(tenant) {
        const assets = await host.openForWriting(tenant)
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
        storeOf: async tenant => layerStoreOf(tenant, await host.open(tenant)),
        writableStoreOf: async tenant => layerStoreOf(tenant, await host.openForWriting(tenant)),
        official,
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
