// The Cordis binding: the access plugin of `assets/v1`. It depends on the access registry only and
// mounts the contribution on its own scope (`defineAccessPlugin`). The settings face is not a key
// this member knows: the assembly gives a function that takes it from the tree at every call, so a
// face that is reloaded makes the calls of that moment answer `basis-unavailable` and does not take
// the protocol down.
import type { Context, Plugin } from '@deepseek-ai/cordis'
import { accessRegistryKey, defineAccessPlugin } from '@omne-harness/access-cordis-contract/cordis'
import { assetsProtocol } from '@omne-harness/assets-protocol'
import { createAssetsContribution } from './contribution.ts'
import type { TargetTenantPrincipals, TenantSettingsPort } from './ports.ts'

/** What only the application assembly can give the plugin. */
export type AssetsAccessPluginInput = Readonly<{
  /** Built once when the plugin loads, over what the assembly's scope sees. */
  principals: (ctx: Context) => TargetTenantPrincipals
  /** The settings face of this moment, or `undefined` while it is not on the tree. */
  settings: (ctx: Context) => TenantSettingsPort | undefined
}>

const ASSETS_ACCESS_PLUGIN = 'assets-access'

/** The access plugin of `assets/v1`. It has no configuration. */
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
