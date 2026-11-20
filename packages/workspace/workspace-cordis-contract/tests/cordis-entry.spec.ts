import { expect, it } from 'vitest'
import { Service } from '@deepseek-ai/cordis'
import * as entry from '@omne-harness/workspace-cordis-contract/cordis'

const services = [
  [entry.WorkspaceGovernanceService, entry.workspaceGovernanceKey, 'workspaceGovernance'],
  [entry.WorkspaceInstancesService, entry.workspaceInstancesKey, 'workspaceInstances'],
  [entry.WorkspaceCatalogService, entry.workspaceCatalogKey, 'workspaceCatalog'],
  [entry.WorkspaceTypesService, entry.workspaceTypesKey, 'workspaceTypes'],
] as const

it('gives each face and the extension point one service identity', () => {
  for (const [service, key, name] of services) {
    expect(key).toBe(name)
    expect(service.provide).toBe(key)
    expect(service.prototype).toBeInstanceOf(Service)
  }
  expect(new Set(services.map(([, key]) => key)).size).toBe(services.length)
  expect(Object.keys(entry)).toHaveLength(services.length * 2)
})
