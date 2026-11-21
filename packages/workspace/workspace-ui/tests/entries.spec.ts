import { expect, it } from 'vitest'

it('the root entry gives the page, the list of instances and the commits, without Cordis', async () => {
  const root = (await import('@omne-harness/workspace-ui')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'REGISTER_HINT',
    'WorkspacesPage',
    'commit',
    'createWorkspaceChoices',
    'recheck',
  ])
})

it('the Cordis entry gives the module, the client service name, the page and the key of the list', async () => {
  const cordis = (await import('@omne-harness/workspace-ui/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis).sort()).toEqual([
    'WORKSPACES_PAGE_ID',
    'WORKSPACES_PAGE_ORDER',
    'workspaceChoicesKey',
    'workspaceClientService',
    'workspaceUiModule',
  ])
  expect(cordis['workspaceChoicesKey']).toBe('workspace.choices')
  expect(cordis['workspaceClientService']).toBe('protocol:workspace/v1')
  expect(cordis['workspaceUiModule']).toMatchObject({
    name: 'workspace-ui',
    inject: ['shell', 'protocol:workspace/v1'],
  })
})
