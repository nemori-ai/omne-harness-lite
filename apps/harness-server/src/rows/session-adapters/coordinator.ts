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

export function coordinatorPrincipalsOf(ctx: Context): CoordinatorPrincipalSource<unknown> {
  const principals = ctx[sessionWorkPrincipalsKey]
  return input => principals.forSession({ actor: 'coordinator', ...input })
}
