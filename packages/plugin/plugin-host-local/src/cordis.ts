import type { Context, Plugin } from '@deepseek-ai/cordis'
import { assetCategoriesKey } from '@omne-harness/assets-cordis-contract'
import type { AssetCategoriesService } from '@omne-harness/assets-cordis-contract/cordis'
import { pluginBodyContract, pluginCategoryDisplay, pluginPluginsPoint } from './category.ts'

/** Registers Plugin as a category of the assets. Its contract asks the other categories as they stand when a package is judged. */
export const pluginCategoryPlugin: Plugin.Object = {
  name: 'plugin-category',
  inject: [assetCategoriesKey],
  apply(ctx: Context) {
    const categories: AssetCategoriesService = ctx.assetCategories
    const contract = pluginBodyContract(categories.view)
    ctx.assetCategories.contribute({ contract, display: pluginCategoryDisplay }, pluginPluginsPoint)
  },
}
