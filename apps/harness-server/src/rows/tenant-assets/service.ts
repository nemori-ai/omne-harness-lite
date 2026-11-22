import { Service, type Context } from '@deepseek-ai/cordis'
import type { AssetLayerSource } from '@omne-harness/assets'
import type { AssetsLocal } from '@omne-harness/assets-local'

/**
 * The one local assets of a tenant, for the rows that hold or read assets (governance, Skills).
 * @owner apps/harness-server/src/rows/tenant-assets
 */
export abstract class TenantAssetsService extends Service {
  static readonly provide = 'tenantAssets'
  constructor(ctx: Context) {
    super(ctx, TenantAssetsService.provide)
  }
  abstract readonly open: (tenantRef: string) => Promise<AssetsLocal | undefined>
  /** The official and the tenant layer of one tenant: the one source of candidates for every category. */
  abstract readonly layerSources: (tenantRef: string) => readonly AssetLayerSource[]
}
export const tenantAssetsKey = TenantAssetsService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    tenantAssets: TenantAssetsService
  }
}

class TenantAssetsImpl extends TenantAssetsService {
  readonly open: TenantAssetsService['open']
  readonly layerSources: TenantAssetsService['layerSources']
  constructor(ctx: Context, assets: Pick<TenantAssetsService, 'open' | 'layerSources'>) {
    super(ctx)
    this.open = tenantRef => assets.open(tenantRef)
    this.layerSources = tenantRef => assets.layerSources(tenantRef)
  }
}

export function provideTenantAssets(
  ctx: Context,
  assets: Pick<TenantAssetsService, 'open' | 'layerSources'>,
) {
  return new TenantAssetsImpl(ctx, assets)
}
