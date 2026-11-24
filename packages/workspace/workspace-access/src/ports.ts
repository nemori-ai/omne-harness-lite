import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import type {
  WorkspaceCatalog,
  WorkspaceGovernance,
  WorkspaceInstances,
} from '@omne-harness/workspace-contract'

/** The application decides whether this login acts for the tenant; the plugin cannot read a login. */
export interface WorkspacePrincipals {
  actingFor(
    login: LoginIdentity,
    tenant: string,
  ): Promise<{ readonly ok: Principal } | { readonly refused: 'denied' | 'basis-unavailable' }>
}

/** Taken at each call; absent while the workspace row is not there. */
export type WorkspaceFaces = Readonly<{
  governance: WorkspaceGovernance<unknown>
  instances: Pick<WorkspaceInstances<unknown>, 'associate' | 'dissociate'>
  catalog: WorkspaceCatalog<unknown>
}>
