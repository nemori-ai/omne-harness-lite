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

it('the Cordis entry gives the module, the page, the key of the list and the parts', async () => {
  const cordis = (await import('@omne-harness/workspace-ui/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis).sort()).toEqual([
    'WORKSPACES_PAGE_ID',
    'WORKSPACES_PAGE_ORDER',
    'workspaceChoicesKey',
    'workspaceParts',
    'workspaceUiModule',
  ])
  expect(cordis['workspaceChoicesKey']).toBe('workspace.choices')
  expect(cordis['workspaceUiModule']).toMatchObject({ name: 'workspace-ui' })
})
