import { expect, it } from 'vitest'

it('the public entry exports the SQL repository, its materials, the minting and the application', async () => {
  const root = (await import('@omne-harness/workspace-local')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'createDomainBinding',
    'createMinting',
    'createSqlWorkspaceStore',
    'createWorkspaceLocalApplication',
    'workspacePersistenceParticipant',
    'workspaceSqlMaterials',
    'workspaceStorageDomain',
  ])
})
