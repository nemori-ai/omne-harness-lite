import type { Context, Plugin } from '@deepseek-ai/cordis'
import { accessRegistryKey, defineAccessPlugin } from '@omne-harness/access-cordis-contract/cordis'
import { assetsProtocol } from '@omne-harness/assets-protocol'
import { createAssetsContribution } from './contribution.ts'
import type { TargetTenantPrincipals, TenantSettingsPort } from './ports.ts'

export type AssetsAccessPluginInput = Readonly<{
  principals: (ctx: Context) => TargetTenantPrincipals
  settings: (ctx: Context) => TenantSettingsPort | undefined
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
              principals: input.principals(ctx),
            }),
        }),
      )
    },
  }
}
