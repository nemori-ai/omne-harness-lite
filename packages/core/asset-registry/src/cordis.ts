import { Context, Service } from '@deepseek-ai/cordis'
import type { AssetRegistryService as Operations0 } from './index.ts'

/** @contract capability.asset-registry */
export abstract class AssetRegistryService extends Service implements Operations0 {
  static readonly provide = 'assetRegistry'
  constructor(ctx: Context) { super(ctx, AssetRegistryService.provide) }
  abstract fill(...args: Parameters<Operations0['fill']>): ReturnType<Operations0['fill']>
  abstract reload(...args: Parameters<Operations0['reload']>): ReturnType<Operations0['reload']>
  abstract refreshAvailability(...args: Parameters<Operations0['refreshAvailability']>): ReturnType<Operations0['refreshAvailability']>
  abstract lookup(...args: Parameters<Operations0['lookup']>): ReturnType<Operations0['lookup']>
  abstract list(...args: Parameters<Operations0['list']>): ReturnType<Operations0['list']>
  abstract markFailed(...args: Parameters<Operations0['markFailed']>): ReturnType<Operations0['markFailed']>
  abstract onAssetChange(...args: Parameters<Operations0['onAssetChange']>): ReturnType<Operations0['onAssetChange']>
}
export const ASSET_REGISTRY = AssetRegistryService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    assetRegistry: AssetRegistryService
  }
}
