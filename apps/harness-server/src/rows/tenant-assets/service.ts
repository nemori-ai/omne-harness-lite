import { Service, type Context } from '@deepseek-ai/cordis'
import type { AssetLayerSource, OfficialAssets } from '@omne-harness/assets'
import type { AssetsLocal } from '@omne-harness/assets-local'
import type { HeldNames } from './held.ts'

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
  /** Every official asset the deployment brings now, with its body and, for a directory category, its files. */
  abstract readonly official: OfficialAssets
  /** What one tenant sees on the point of a category now, name by name; undefined while it is not on the registry. */
  abstract readonly heldNames: (tenantRef: string, category: string) => HeldNames | undefined
}
export const tenantAssetsKey = TenantAssetsService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    tenantAssets: TenantAssetsService
  }
}

type Provided = Pick<
  TenantAssetsService,
  'open' | 'standing' | 'layerSources' | 'official' | 'heldNames'
>

class TenantAssetsImpl extends TenantAssetsService {
  readonly open: TenantAssetsService['open']
  readonly standing: TenantAssetsService['standing']
  readonly layerSources: TenantAssetsService['layerSources']
  readonly official: TenantAssetsService['official']
  readonly heldNames: TenantAssetsService['heldNames']
  constructor(ctx: Context, assets: Provided) {
    super(ctx)
    this.open = tenantRef => assets.open(tenantRef)
    this.standing = tenantRef => assets.standing(tenantRef)
    this.layerSources = tenantRef => assets.layerSources(tenantRef)
    this.official = () => assets.official()
    this.heldNames = (tenantRef, category) => assets.heldNames(tenantRef, category)
  }
}

export function provideTenantAssets(ctx: Context, assets: Provided) {
  return new TenantAssetsImpl(ctx, assets)
}
