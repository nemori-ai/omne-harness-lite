import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import type {
  AuthorityDecision,
  ScopeBinding,
  ScopeBindingSource,
  ScopeRef,
} from '@omne-harness/runtime-context-contract'
import type {
  Access,
  EnvironmentAction,
  EnvironmentAuthority,
} from '@omne-harness/execution-environment-contract'

/** An authorized ordinary access. `current` is the synchronous premise checked at the final step. */
export type Granted = Readonly<{ kind: 'granted'; current: () => boolean }>

/**
 * Why ordinary access did not pass. `refused` covers an authority refusal, an unbound scope and a
 * scope bound to another tenant alike, so the answer never discloses the other tenant.
 */
export type AccessFailure = Readonly<{
  kind: 'refused' | 'unavailable' | 'unknown'
  cause: 'authority' | 'scope-binding'
}>

/** legal-identity's equality is false for any value it did not mint, so it doubles as the mint check. */
export function mintedTenant(tenant: TenantId): boolean {
  return tenantEquals(tenant, tenant)
}

function safeCurrent(current: () => boolean): boolean {
  try {
    return current() === true
  } catch {
    return false
  }
}

async function decide<P>(
  authority: EnvironmentAuthority<P>,
  access: Access<P>,
  action: EnvironmentAction,
): Promise<Granted | AccessFailure> {
  let decision: AuthorityDecision<P>
  try {
    decision = await authority.authorize(access, action)
  } catch {
    return { kind: 'unknown', cause: 'authority' }
  }
  switch (decision?.kind) {
    case 'authorized': {
      const current = decision.current
      if (typeof current !== 'function') return { kind: 'unknown', cause: 'authority' }
      return { kind: 'granted', current: () => safeCurrent(current) }
    }
    case 'refused':
      return { kind: 'refused', cause: 'authority' }
    case 'unavailable':
      return { kind: 'unavailable', cause: 'authority' }
    default:
      return { kind: 'unknown', cause: 'authority' }
  }
}

async function bound(
  bindings: ScopeBindingSource,
  scope: ScopeRef,
  tenant: TenantId,
): Promise<AccessFailure | undefined> {
  let binding: ScopeBinding
  try {
    binding = await bindings.lookup(scope)
  } catch {
    return { kind: 'unknown', cause: 'scope-binding' }
  }
  switch (binding?.kind) {
    case 'bound':
      return tenantEquals(binding.tenant, tenant)
        ? undefined
        : { kind: 'refused', cause: 'scope-binding' }
    case 'unbound':
      return { kind: 'refused', cause: 'scope-binding' }
    case 'unavailable':
      return { kind: 'unavailable', cause: 'scope-binding' }
    default:
      return { kind: 'unknown', cause: 'scope-binding' }
  }
}

export type AccessPorts<P> = Readonly<{
  authority: EnvironmentAuthority<P>
  bindings: ScopeBindingSource
}>

/**
 * Checks ordinary access in the contract's order: the environment authority for the action, then
 * the trusted binding of the target scope to the caller's tenant. A later step does not run after
 * an earlier one fails. Without a scope only the authority is asked.
 */
export async function checkAccess<P>(
  ports: AccessPorts<P>,
  access: Access<P>,
  action: EnvironmentAction,
  scope: ScopeRef | undefined,
): Promise<Granted | AccessFailure> {
  const decision = await decide(ports.authority, access, action)
  if (decision.kind !== 'granted' || scope === undefined) return decision
  const failure = await bound(ports.bindings, scope, access.tenant)
  return failure ?? decision
}
