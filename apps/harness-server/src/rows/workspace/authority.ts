import { noArguments, referenceAdmissionCheck } from '@omne-harness/authorization'
import type { Principal, PrincipalVerifier, TenantStandingSource } from '@omne-harness/identity'
import type { Access } from '@omne-harness/legal-identity'
import type { WorkspaceAction, WorkspaceAuthority } from '@omne-harness/workspace'

export const WORKSPACE_OWNER = '@omne-harness/workspace'

/** The identity services now. Absent ones answer `unavailable`: they are taken at every call. */
export type IdentityPorts = Readonly<{
  verifier(): PrincipalVerifier | undefined
  standing(): TenantStandingSource | undefined
}>

/** What an action is done to: the node, when it is not about one workspace. */
const ABOUT_THE_NODE: ReadonlySet<WorkspaceAction> = new Set([
  'workspace.register',
  'workspace.list',
  'workspace.recall',
])

/** Workspace's two questions about a caller, answered by the identity domain. */
export function createWorkspaceAuthority(ports: IdentityPorts): WorkspaceAuthority<unknown> {
  const verifier: PrincipalVerifier = {
    verify: value =>
      ports.verifier()?.verify(value) ??
      Promise.resolve({ kind: 'unavailable', diagnostic: 'principal verifier absent' }),
  }
  const standing: TenantStandingSource = {
    read: input =>
      ports.standing()?.read(input) ??
      Promise.resolve({ kind: 'unavailable', diagnostic: 'tenant standing absent' }),
  }
  const admission = referenceAdmissionCheck({ verifier, standing, permits: null })

  return {
    async standing(access) {
      const reading = await standing.read({ tenant: access.tenant })
      return reading.kind
    },
    async admit(access, action, target) {
      const decision = await admission.check({
        access: access as Access<Principal>,
        operation: { owner: WORKSPACE_OWNER, name: action },
        target: {
          owner: WORKSPACE_OWNER,
          kind: ABOUT_THE_NODE.has(action) ? 'node' : 'workspace',
          key: target,
        },
        arguments: noArguments(),
        requires: [],
        permit: null,
      })
      return decision.kind
    },
  }
}
