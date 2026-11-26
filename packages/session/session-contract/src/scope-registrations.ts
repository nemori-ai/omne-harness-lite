import type { SessionEntry } from './entries.ts'
import { initializationRegistrationCommit } from './initialization-plan.ts'
import type { ContextScopeBinding, WorkSnapshot } from './values.ts'

type Registered = Extract<SessionEntry, { declaration: unknown; scope: string | null }>

/** The registrations the creation recorded, declared again for a scope minted later. */
export function bornRegistrations(
  snapshot: Pick<WorkSnapshot, 'tenant' | 'session' | 'contextScopes' | 'initialization'>,
  scope: ContextScopeBinding,
): Registered[] {
  const original = snapshot.contextScopes?.[0]?.scope
  return (snapshot.initialization?.registrations ?? [])
    .filter(item => item.decision.scope === original)
    .map(({ plan, prepared, decision }): Registered => {
      const born = {
        ...decision,
        scope: scope.scope,
        commit: initializationRegistrationCommit({
          tenant: snapshot.tenant,
          session: snapshot.session,
          createOperation: scope.operation,
          owner: plan.owner,
          item: plan.item,
        }),
      }
      const { need, binding, parameters } = born
      return {
        kind: 'session.context-registration-changed',
        declaration: {
          kind: 'context-registration',
          need,
          binding,
          parameters,
          registration: prepared,
        },
        scope: scope.scope,
        initialization: { createOperation: scope.operation, plan, prepared, decision: born },
      }
    })
}
