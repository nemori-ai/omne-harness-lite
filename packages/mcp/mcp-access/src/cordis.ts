import type { Context, Plugin } from '@deepseek-ai/cordis'
import { accessRegistryKey, defineAccessPlugin } from '@omne-harness/access-cordis-contract/cordis'
import { mcpProtocol } from '@omne-harness/mcp-protocol'
import { createMcpContribution } from './contribution.ts'
import type { McpAccessSettings, McpFaces, McpPrincipals } from './ports.ts'

export type McpAccessPluginInput = Readonly<{
  principals: (ctx: Context) => McpPrincipals
  faces: (ctx: Context) => McpFaces | undefined
}>

const MCP_ACCESS_PLUGIN = 'mcp-access'

export function createMcpAccessPlugin<S extends McpAccessSettings = McpAccessSettings>(
  input: McpAccessPluginInput,
): Plugin.Object {
  return {
    name: MCP_ACCESS_PLUGIN,
    inject: [accessRegistryKey],
    apply(ctx: Context, settings: S) {
      ctx.plugin(
        defineAccessPlugin({
          name: `${MCP_ACCESS_PLUGIN}.contribution`,
          protocol: mcpProtocol,
          handlers: () =>
            createMcpContribution({
              faces: () => input.faces(ctx),
              principals: input.principals(ctx),
              settings,
            }),
        }),
      )
    },
  }
}
