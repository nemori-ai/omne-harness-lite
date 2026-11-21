import type { Context, Plugin } from '@deepseek-ai/cordis'
import { accessRegistryKey, defineAccessPlugin } from '@omne-harness/access-cordis-contract/cordis'
import { workspaceProtocol } from '@omne-harness/workspace-protocol'
import { createWorkspaceContribution } from './contribution.ts'
import type { WorkspaceFaces, WorkspacePrincipals } from './ports.ts'

export type WorkspaceAccessPluginInput = Readonly<{
  principals: (ctx: Context) => WorkspacePrincipals
  faces: (ctx: Context) => WorkspaceFaces | undefined
}>

const WORKSPACE_ACCESS_PLUGIN = 'workspace-access'

export function createWorkspaceAccessPlugin(input: WorkspaceAccessPluginInput): Plugin.Object {
  return {
    name: WORKSPACE_ACCESS_PLUGIN,
    inject: [accessRegistryKey],
    apply(ctx: Context) {
      ctx.plugin(
        defineAccessPlugin({
          name: `${WORKSPACE_ACCESS_PLUGIN}.contribution`,
          protocol: workspaceProtocol,
          handlers: () =>
            createWorkspaceContribution({
              principals: input.principals(ctx),
              faces: () => input.faces(ctx),
            }),
        }),
      )
    },
  }
}
