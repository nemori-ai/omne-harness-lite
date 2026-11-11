import type { ActingForTenantPrincipal, PrincipalVerifier } from '@omne-harness/identity'
import { tenantEquals } from '@omne-harness/legal-identity'
import type { AuthorityDecision, ProducerAction } from '@omne-harness/runtime-context-contract'
import { sessionModesProducer } from '@omne-harness/session-adapters/cordis'
import type { SessionWorkPrincipals } from '@omne-harness/session-contract'
import { ENTRY_COMPONENTS, SESSION_MODES_WORK } from './principals.ts'
import type { SessionScopeOwnership, SessionScopeOwnershipSource } from './session-scope-source.ts'

export type SessionModesAuthoritySources = Readonly<{
  verifier: PrincipalVerifier
  scopeOwners?: SessionScopeOwnershipSource | undefined
  sessionWork?: SessionWorkPrincipals<unknown>['forSession'] | undefined
}>

async function supplyPrincipal(
  sources: SessionModesAuthoritySources,
  owner: Extract<SessionScopeOwnership, { kind: 'bound' }>,
): Promise<AuthorityDecision<unknown>> {
  const issued = await sources.sessionWork?.({
    actor: 'coordinator',
    tenant: owner.tenant,
    session: owner.session,
  })
  if (issued === undefined) return { kind: 'unavailable' }
  if ('failure' in issued)
    return { kind: issued.failure.kind === 'denied' ? 'refused' : 'unavailable' }
  const checked = await sources.verifier.verify(issued.ok)
  if (checked.kind === 'unavailable') return { kind: 'unavailable' }
  if (checked.kind === 'rejected') return { kind: 'refused' }
  const principal = checked.principal
  if (
    principal.kind !== 'acting-for-tenant' ||
    principal.actor.component !== ENTRY_COMPONENTS.sessionWork ||
    principal.work.owner !== 'session' ||
    principal.work.work !== owner.session ||
    !tenantEquals(principal.tenant, owner.tenant)
  )
    return { kind: 'refused' }
  return { kind: 'authorized', principal, current: () => true }
}

export async function decideSessionModesProducer(
  sources: SessionModesAuthoritySources,
  principal: ActingForTenantPrincipal,
  action: ProducerAction,
): Promise<AuthorityDecision<unknown>> {
  if (
    principal.actor.component !== ENTRY_COMPONENTS.sessionModes ||
    principal.work.owner !== SESSION_MODES_WORK.owner ||
    principal.work.work !== SESSION_MODES_WORK.work ||
    !tenantEquals(principal.tenant, action.tenant) ||
    action.key !== 'session.modes' ||
    action.producer.producer !== sessionModesProducer.producer
  )
    return { kind: 'refused' }
  if (action.kind === 'register' || action.kind === 'invalidate-tenant')
    return { kind: 'authorized', principal, current: () => true }
  try {
    const owner = await sources.scopeOwners?.lookup(action.scope)
    if (owner === undefined || owner.kind === 'unavailable') return { kind: 'unavailable' }
    if (owner.kind === 'unknown') return { kind: 'unknown' }
    if (owner.kind !== 'bound' || !tenantEquals(owner.tenant, action.tenant))
      return { kind: 'refused' }
    return action.kind === 'supply'
      ? await supplyPrincipal(sources, owner)
      : { kind: 'authorized', principal, current: () => true }
  } catch {
    return { kind: 'unavailable' }
  }
}
