import { expect, it } from 'vitest'

it('the public entry exports the contribution of the workspace protocol', async () => {
  const root = (await import('@omne-harness/workspace-access')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual(['createWorkspaceContribution'])
})
