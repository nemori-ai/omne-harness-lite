import { Service, type Context } from '@deepseek-ai/cordis'
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
}
export const tenantAssetsKey = TenantAssetsService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    tenantAssets: TenantAssetsService
  }
}

class TenantAssetsImpl extends TenantAssetsService {
  readonly open: TenantAssetsService['open']
  constructor(ctx: Context, assets: Pick<TenantAssetsService, 'open'>) {
    super(ctx)
    this.open = tenantRef => assets.open(tenantRef)
  }
}

export function provideTenantAssets(ctx: Context, assets: Pick<TenantAssetsService, 'open'>) {
  return new TenantAssetsImpl(ctx, assets)
}
