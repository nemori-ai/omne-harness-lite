import {
  createCatalog,
  createGovernance,
  createInstances,
  createManagementTypes,
  type WorkspaceAuthority,
} from '@omne-harness/workspace'
import type {
  ManagementTypes,
  WorkspaceCatalog,
  WorkspaceGovernance,
  WorkspaceInstances,
} from '@omne-harness/workspace-contract'
import { createMinting } from './minting.ts'
import { createSqlWorkspaceStore, type WorkspaceSqlOptions } from './storage/store.ts'

export type WorkspaceLocalOptions<P> = Readonly<{
  sql: WorkspaceSqlOptions
  authority: WorkspaceAuthority<P>
  /** The name of this node. One position belongs to at most one active instance of a node. */
  node: string
}>

export type WorkspaceLocalApplication<P> = Readonly<{
  governance: WorkspaceGovernance<P>
  instances: WorkspaceInstances<P>
  catalog: WorkspaceCatalog<P>
  types: ManagementTypes
}>

/** The workspace rules over SQL storage. It holds no fact of its own: every one is in the store. */
export function createWorkspaceLocalApplication<P>(
  options: WorkspaceLocalOptions<P>,
): WorkspaceLocalApplication<P> {
  if (options.node === '') throw new TypeError('the node name is empty')
  const types = createManagementTypes()
  const deps = {
    authority: options.authority,
    store: createSqlWorkspaceStore(options.sql),
    types,
    minting: createMinting(),
    node: options.node,
  }
  return {
    governance: createGovernance(deps),
    instances: createInstances(deps),
    catalog: createCatalog(deps),
    types,
  }
}
