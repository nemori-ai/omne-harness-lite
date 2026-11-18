import { Service, type Context, type Plugin } from '@deepseek-ai/cordis'
import {
  createCategoryPoint,
  type CategoryContribution,
  type CategoryPoint,
  type CategoryView,
} from '@omne-harness/assets'
import { assetCategoriesKey } from './index.ts'

/** @owner packages/assets/assets-cordis-contract */
export class AssetCategoriesService extends Service {
  static readonly provide = assetCategoriesKey
  readonly view: CategoryView
  protected readonly point: CategoryPoint
  constructor(ctx: Context) {
    super(ctx, AssetCategoriesService.provide)
    const point = createCategoryPoint()
    this.point = point
    this.view = Object.freeze({ lookup: point.lookup, list: point.list })
  }

  contribute(contribution: CategoryContribution): void {
    this.ctx.effect(() => this.point.contribute(contribution), 'assetCategories.contribute')
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    assetCategories: AssetCategoriesService
  }
}

export const assetCategoriesPlugin: Plugin.Object = {
  name: 'asset-categories',
  apply(ctx: Context) {
    new AssetCategoriesService(ctx)
  },
}

export function categoryContributionPlugin(
  name: string,
  contribution: CategoryContribution,
): Plugin.Object {
  return {
    name,
    inject: [assetCategoriesKey],
    apply(ctx: Context) {
      ctx.assetCategories.contribute(contribution)
    },
  }
}
