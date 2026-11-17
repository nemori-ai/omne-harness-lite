import type { Context, Plugin } from '@deepseek-ai/cordis'
import { accessRegistryKey, defineAccessPlugin } from '@omne-harness/access-cordis-contract/cordis'
import { toolProtocol } from '@omne-harness/tool-protocol'
import { createToolAccessContribution } from './contribution.ts'
import type { ToolCallFaces, ToolCallPrincipals } from './ports.ts'

export type ToolAccessPluginInput = Readonly<{
  principals: (ctx: Context) => ToolCallPrincipals
  faces: (ctx: Context) => ToolCallFaces | undefined
}>

const TOOL_ACCESS_PLUGIN = 'tool-access'

export function createToolAccessPlugin(input: ToolAccessPluginInput): Plugin.Object {
  return {
    name: TOOL_ACCESS_PLUGIN,
    inject: [accessRegistryKey],
    apply(ctx: Context) {
      ctx.plugin(
        defineAccessPlugin({
          name: `${TOOL_ACCESS_PLUGIN}.contribution`,
          protocol: toolProtocol,
          handlers: () =>
            createToolAccessContribution({
              faces: () => input.faces(ctx),
              principals: input.principals(ctx),
            }),
        }),
      )
    },
  }
}
