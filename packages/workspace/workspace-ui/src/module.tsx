import { protocolServiceName } from '@omne-harness/client-assembly/cordis'
import type { ClientOf } from '@omne-harness/sdk/core'
import { serviceKey } from '@omne-harness/shell-contract'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { workspaceProtocol, type WorkspaceProtocol } from '@omne-harness/workspace-protocol'
import { createWorkspaceChoices, type WorkspaceChoices } from './model/choices.ts'
import { WorkspacesPage } from './view/workspaces-page.tsx'

export const workspaceClientService = protocolServiceName({
  name: workspaceProtocol.name,
  major: workspaceProtocol.major,
})

export const WORKSPACES_PAGE_ID = 'workspaces'
export const WORKSPACES_PAGE_ORDER = 14

/** The instances a tenant can work in, on the client tree while `workspace/v1` is mounted. */
export const workspaceChoicesKey = serviceKey<WorkspaceChoices>('workspace.choices')

/** The workspaces page and the list of instances, there while the `workspace/v1` client is. */
export const workspaceUiModule = defineUiModule<Record<string, ClientOf<WorkspaceProtocol>>>({
  name: 'workspace-ui',
  inject: [workspaceClientService],
  apply(shell, services, provide) {
    const client = services[workspaceClientService]!
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
