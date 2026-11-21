import type { Context, Plugin } from '@deepseek-ai/cordis'
import { accessRegistryKey, defineAccessPlugin } from '@omne-harness/access-cordis-contract/cordis'
import { usageProtocol } from '@omne-harness/usage-protocol'
import { createUsageContribution } from './contribution.ts'
import type { UsageFace, UsagePrincipals } from './ports.ts'

export type UsageAccessPluginInput = Readonly<{
  principals: (ctx: Context) => UsagePrincipals
  usage: (ctx: Context) => UsageFace | undefined
}>

const USAGE_ACCESS_PLUGIN = 'usage-access'

export function createUsageAccessPlugin(input: UsageAccessPluginInput): Plugin.Object {
  return {
    name: USAGE_ACCESS_PLUGIN,
    inject: [accessRegistryKey],
    apply(ctx: Context) {
      ctx.plugin(
        defineAccessPlugin({
          name: `${USAGE_ACCESS_PLUGIN}.contribution`,
          protocol: usageProtocol,
          handlers: () =>
            createUsageContribution({
              usage: () => input.usage(ctx),
              principals: input.principals(ctx),
            }),
        }),
      )
    },
  }
}
