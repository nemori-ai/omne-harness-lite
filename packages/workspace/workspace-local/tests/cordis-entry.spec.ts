import { expect, it } from 'vitest'

it('the cordis entry exports the plugin that binds the workspace services', async () => {
  const cordis = (await import('@omne-harness/workspace-local/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis)).toEqual(['createWorkspaceLocalPlugin'])
})
