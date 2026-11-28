import type { Context, Plugin } from '@deepseek-ai/cordis'
import { assetCategoriesKey } from '@omne-harness/assets-cordis-contract'
import type { BodyContract } from '@omne-harness/assets'
import type { AssetCategoriesService } from '@omne-harness/assets-cordis-contract/cordis'
import { pluginEffect, type PluginEffectPorts } from './category-effect.ts'
import {
  pluginBodyContract,
  pluginCategoryDisplay,
  pluginPluginsPoint,
  skinBodyContract,
} from './category.ts'
import { skinCategoryDisplay, skinSkinsPoint } from './skin-category.ts'

export type PluginCategoryOptions = Readonly<{
  /** What the application adds to the contract of the category plugin: the gates a plugin's tools are asked by. */
  gated?: (contract: BodyContract) => BodyContract
}>

/** Registers the two categories of the assets that are Plugin's: plugin, and skin, which is a plugin narrowed. With ports each also tells what a change of one of its own does. */
export function pluginCategory(
  ports?: (ctx: Context) => PluginEffectPorts,
  options: PluginCategoryOptions = {},
): Plugin.Object {
  return {
    name: 'plugin-category',
    inject: [assetCategoriesKey],
    apply(ctx: Context) {
      const categories: AssetCategoriesService = ctx.assetCategories
      // A contract asks the other categories as they stand when a package is judged, so it is given the view.
      const { view } = categories
      const effect = ports === undefined ? {} : { effect: pluginEffect(ports(ctx)) }
      categories.contribute(
        {
          contract: (options.gated ?? (contract => contract))(pluginBodyContract(view)),
          display: pluginCategoryDisplay,
          ...effect,
        },
        pluginPluginsPoint,
      )
      categories.contribute(
        { contract: skinBodyContract(view), display: skinCategoryDisplay, ...effect },
        skinSkinsPoint,
      )
    },
  }
}
