import {
  createCatalog,
  createGovernance,
  createInstances,
  createManagementTypes,
  createSources,
  type WorkspaceAuthority,
} from '@omne-harness/workspace'
import type {
  ManagementTypes,
  SourceDigests,
  SourceFiles,
  WorkspaceCatalog,
  WorkspaceGovernance,
  WorkspaceInstances,
  WorkspaceSources,
} from '@omne-harness/workspace-contract'
import { createMinting } from './minting.ts'
import { createSqlWorkspaceStore, type WorkspaceSqlOptions } from './storage/store.ts'

export type WorkspaceLocalOptions<P> = Readonly<{
  sql: WorkspaceSqlOptions
  authority: WorkspaceAuthority<P>
  /** The name of this node. One position belongs to at most one active instance of a node. */
  node: string
  /** How source roots are read, and the digests their versions are made of. */
  sources: Readonly<{ files: SourceFiles; digests: SourceDigests }>
}>

export type WorkspaceLocalApplication<P> = Readonly<{
  governance: WorkspaceGovernance<P>
  instances: WorkspaceInstances<P>
  catalog: WorkspaceCatalog<P>
  sources: WorkspaceSources<P>
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
    sources: createSources({ ...deps, ...options.sources }),
    types,
  }
}
