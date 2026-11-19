import type { Context, Plugin } from '@deepseek-ai/cordis'
import { accessRegistryKey, defineAccessPlugin } from '@omne-harness/access-cordis-contract/cordis'
import { assetsProtocol } from '@omne-harness/assets-protocol'
import { createAssetsContribution } from './contribution.ts'
import type {
  CategoriesPort,
  ChangesPort,
  ManagementPort,
  TargetTenantPrincipals,
  TenantSettingsPort,
} from './ports.ts'

export type AssetsAccessPluginInput = Readonly<{
  principals: (ctx: Context) => TargetTenantPrincipals
  settings: (ctx: Context) => TenantSettingsPort | undefined
  categories: (ctx: Context) => CategoriesPort | undefined
  management: (ctx: Context) => ManagementPort | undefined
  changes: (ctx: Context) => ChangesPort | undefined
}>

const ASSETS_ACCESS_PLUGIN = 'assets-access'

export function createAssetsAccessPlugin(input: AssetsAccessPluginInput): Plugin.Object {
  return {
    name: ASSETS_ACCESS_PLUGIN,
    inject: [accessRegistryKey],
    apply(ctx: Context) {
      ctx.plugin(
        defineAccessPlugin({
          name: `${ASSETS_ACCESS_PLUGIN}.contribution`,
          protocol: assetsProtocol,
          handlers: () =>
            createAssetsContribution({
              settings: () => input.settings(ctx),
              categories: () => input.categories(ctx),
              management: () => input.management(ctx),
              changes: () => input.changes(ctx),
              principals: input.principals(ctx),
            }),
        }),
      )
    },
  }
}
