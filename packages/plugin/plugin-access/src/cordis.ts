import type { Context, Plugin } from '@deepseek-ai/cordis'
import { accessRegistryKey, defineAccessPlugin } from '@omne-harness/access-cordis-contract/cordis'
import { pluginProtocol } from '@omne-harness/plugin-protocol'
import { createPluginContribution } from './contribution.ts'
import type { PluginReports, PluginSource, TargetTenantPrincipals } from './ports.ts'

export type PluginAccessPluginInput = Readonly<{
  principals: (ctx: Context) => TargetTenantPrincipals
  source: (ctx: Context) => PluginSource
  reports: (ctx: Context) => PluginReports
}>

const PLUGIN_ACCESS_PLUGIN = 'plugin-access'

/** Mounts plugin/v1 on the access registry of the tree. */
export function createPluginAccessPlugin(input: PluginAccessPluginInput): Plugin.Object {
  return {
    name: PLUGIN_ACCESS_PLUGIN,
    inject: [accessRegistryKey],
    apply(ctx: Context) {
      ctx.plugin(
        defineAccessPlugin({
          name: `${PLUGIN_ACCESS_PLUGIN}.contribution`,
          protocol: pluginProtocol,
          handlers: () =>
            createPluginContribution({
              principals: input.principals(ctx),
              source: input.source(ctx),
              reports: input.reports(ctx),
            }),
        }),
      )
    },
  }
}
