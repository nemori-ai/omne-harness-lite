import type { ClientOf } from '@omne-harness/sdk/core'
import { needProtocol, serviceKey } from '@omne-harness/shell-contract'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { workspaceProtocol, type WorkspaceProtocol } from '@omne-harness/workspace-protocol'
import { createWorkspaceChoices, type WorkspaceChoices } from './model/choices.ts'
import { WorkspacesPage } from './view/workspaces-page.tsx'

export const WORKSPACES_PAGE_ID = 'workspaces'
export const WORKSPACES_PAGE_ORDER = 14

/** The instances a tenant can work in, on the client tree while `workspace/v1` is mounted. */
export const workspaceChoicesKey = serviceKey<WorkspaceChoices>('workspace.choices')

/** The workspaces page, placed always; the list of instances only while `workspace/v1` is served. */
export const workspaceUiModule = defineUiModule({
  name: 'workspace-ui',
  needs: { workspace: needProtocol<ClientOf<WorkspaceProtocol>>(workspaceProtocol) },
  apply(shell, { workspace: client }, provide) {
    const choices = createWorkspaceChoices(client)
    provide(workspaceChoicesKey, choices)
    shell.contribute('pages', {
      id: WORKSPACES_PAGE_ID,
      title: '工作区',
      order: WORKSPACES_PAGE_ORDER,
      icon: 'resource',
      render: ({ scope }) =>
        scope === undefined ? null : (
          <WorkspacesPage client={client} tenant={scope} onChange={choices.touch} />
        ),
    })
  },
})
