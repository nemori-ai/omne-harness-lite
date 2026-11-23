import type { Context, Plugin } from '@deepseek-ai/cordis'
import { assetCategoriesKey } from '@omne-harness/assets-cordis-contract'
import type { AssetCategoriesService } from '@omne-harness/assets-cordis-contract/cordis'
import { pluginEffect, type PluginEffectPorts } from './category-effect.ts'
import { pluginBodyContract, pluginCategoryDisplay, pluginPluginsPoint } from './category.ts'

/** Registers Plugin as a category of the assets; with ports it also tells what a change of a plugin does. */
export function pluginCategory(ports?: (ctx: Context) => PluginEffectPorts): Plugin.Object {
  return {
    name: 'plugin-category',
    inject: [assetCategoriesKey],
    apply(ctx: Context) {
      const categories: AssetCategoriesService = ctx.assetCategories
      // The contract asks the other categories as they stand when a package is judged, so it is given the view.
      const contract = pluginBodyContract(categories.view)
      const effect = ports === undefined ? {} : { effect: pluginEffect(ports(ctx)) }
      ctx.assetCategories.contribute(
        { contract, display: pluginCategoryDisplay, ...effect },
        pluginPluginsPoint,
      )
    },
  }
}
