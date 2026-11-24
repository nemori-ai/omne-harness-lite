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
  abstract readonly standing: (
    tenantRef: string,
  ) => Promise<'registered' | 'unregistered' | 'unknown'>
  /** The official and the tenant layer of one tenant: the one source of candidates for every category. */
  abstract readonly layerSources: (tenantRef: string) => readonly AssetLayerSource[]
}
export const tenantAssetsKey = TenantAssetsService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    tenantAssets: TenantAssetsService
  }
}

type Provided = Pick<TenantAssetsService, 'open' | 'standing' | 'layerSources'>

class TenantAssetsImpl extends TenantAssetsService {
  readonly open: TenantAssetsService['open']
  readonly standing: TenantAssetsService['standing']
  readonly layerSources: TenantAssetsService['layerSources']
  constructor(ctx: Context, assets: Provided) {
    super(ctx)
    this.open = tenantRef => assets.open(tenantRef)
    this.standing = tenantRef => assets.standing(tenantRef)
    this.layerSources = tenantRef => assets.layerSources(tenantRef)
  }
}

export function provideTenantAssets(ctx: Context, assets: Provided) {
  return new TenantAssetsImpl(ctx, assets)
}
