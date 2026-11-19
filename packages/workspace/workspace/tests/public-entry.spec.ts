import { expect, it } from 'vitest'

it('the public entry exports the service factories, the type registry and the scripts', async () => {
  const root = (await import('@omne-harness/workspace')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'associateInstance',
    'createCatalog',
    'createGovernance',
    'createInstances',
    'createManagementTypes',
    'dissociateInstance',
    'once',
    'registerWorkspace',
  ])
})

it('the testing entry exports the memory store, the fakes and the conformance cases', async () => {
  const testing = (await import('@omne-harness/workspace/testing')) as Record<string, unknown>
  expect(Object.keys(testing).sort()).toEqual([
    'createMemoryStore',
    'fakeAccess',
    'fakeAuthority',
    'fakeMinting',
    'fakeTenant',
    'fakeWorkspaceId',
    'fakeWorld',
    'memoryTxn',
    'typeConformanceCases',
  ])
})
