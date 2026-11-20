import type { Access, TenantId, WorkspaceId } from '@omne-harness/legal-identity'
import type { InstanceId, RelationOperation } from '@omne-harness/workspace-contract'

/** The names this group gives its operations when it asks whether an action is admitted. */
export type WorkspaceAction =
  | 'workspace.register'
  | 'workspace.list'
  | 'workspace.recall'
  | 'workspace.view'
  | 'workspace.attach'
  | 'workspace.associate'
  | 'workspace.dissociate'
  | 'workspace.destroy'
  | `workspace.${RelationOperation}`

/** What this group needs to know about the caller. */
export interface WorkspaceAuthority<P> {
  /** Whether this tenant is a member of its organization now. */
  standing(access: Access<P>): Promise<'member' | 'not-member' | 'unavailable'>
  /** Whether this subject may do this to this target now. The target is a workspace or the node. */
  admit(
    access: Access<P>,
    action: WorkspaceAction,
    target: string,
  ): Promise<'allowed' | 'denied' | 'unavailable'>
  /** Whether this is a tenant that could take part now. */
  isTenant(tenant: TenantId): Promise<'member' | 'not-member' | 'unavailable'>
}

export interface Minting {
  workspace(): WorkspaceId
  instance(): InstanceId
}
