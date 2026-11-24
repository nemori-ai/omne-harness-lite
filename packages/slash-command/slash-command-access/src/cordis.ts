import type { Context, Plugin } from '@deepseek-ai/cordis'
import { accessRegistryKey, defineAccessPlugin } from '@omne-harness/access-cordis-contract/cordis'
import { slashCommandProtocol } from '@omne-harness/slash-command-protocol'
import { createSlashCommandContribution, type SlashCommandAccessPorts } from './index.ts'

export function createSlashCommandAccessPlugin(
  ports: (ctx: Context) => SlashCommandAccessPorts,
): Plugin.Object {
  return {
    name: 'slash-command-access',
    inject: [accessRegistryKey],
    apply(ctx: Context) {
      ctx.plugin(
        defineAccessPlugin({
          name: 'slash-command-access.contribution',
          protocol: slashCommandProtocol,
          handlers: () => createSlashCommandContribution(ports(ctx)),
        }),
      )
    },
  }
}
