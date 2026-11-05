// The coordinator principal source that the session-adapters plugins take at construction: the
// principal the assembly issues to the coordinator of one session, answered by `forSession` of the
// trusted `sessionWorkPrincipals` entry object (session-adapters `SessionAgentDriveInput`). The rows
// that need it inject the trusted name and build the function from the injected service; the
// function is a runtime object, never configuration.
import type { Context } from '@deepseek-ai/cordis'
import type { Outcome } from '@omne-harness/operation-result'
import type { SessionFailure, SessionId } from '@omne-harness/session-contract'
import { sessionWorkPrincipalsKey } from '@omne-harness/session-cordis-contract/cordis'
import type { TenantId } from '@omne-harness/legal-identity'

export type CoordinatorPrincipalFailure = Extract<
  SessionFailure,
  { kind: 'denied' | 'unavailable' | 'quarantined' }
>

export type CoordinatorPrincipalSource<P> = (
  input: Readonly<{ tenant: TenantId; session: SessionId }>,
) => Promise<Outcome<P, CoordinatorPrincipalFailure>>

/** The source over the `sessionWorkPrincipals` service that the row context sees. */
export function coordinatorPrincipalsOf(ctx: Context): CoordinatorPrincipalSource<unknown> {
  const principals = ctx[sessionWorkPrincipalsKey]
  return input => principals.forSession({ actor: 'coordinator', ...input })
}
