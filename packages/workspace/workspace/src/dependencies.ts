import type { Minting, WorkspaceAuthority } from './ports.ts'
import type { WorkspaceStore } from './store.ts'
import type { TypeLookup } from './types.ts'

/** What the services of this group are built from. */
export type WorkspaceDependencies<P> = Readonly<{
  authority: WorkspaceAuthority<P>
  store: WorkspaceStore
  types: TypeLookup
  minting: Minting
  /** The node these instances are on. One position belongs to at most one active instance of a node. */
  node: string
}>
