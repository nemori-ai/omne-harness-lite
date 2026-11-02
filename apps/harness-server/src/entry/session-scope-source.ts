import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import type { ScopeBindingSource, ScopeRef } from '@omne-harness/runtime-context-contract'
import type { SessionId, SessionPrincipalBindingSource } from '@omne-harness/session-contract'

/** Application consumption projection. AD-03 owns the scope fact; this is not a service key. */
export type SessionScopeOwnership =
  | Readonly<{ kind: 'bound'; tenant: TenantId; session: SessionId; generation: string }>
  | Readonly<{ kind: 'unbound' | 'unavailable' | 'unknown' }>

export interface SessionScopeOwnershipSource {
  lookup(scope: ScopeRef): Promise<SessionScopeOwnership>
}

export type SessionScopeSourceOptions = Readonly<{
  readOwnership: () => SessionScopeOwnershipSource | undefined
  readPrincipalBindings: () => SessionPrincipalBindingSource | undefined
}>

export type SessionScopeSource = Readonly<{
  scopeOwners: SessionScopeOwnershipSource
  bindings: ScopeBindingSource
}>

async function confirmSession(
  ownership: Extract<SessionScopeOwnership, { kind: 'bound' }>,
  readPrincipalBindings: SessionScopeSourceOptions['readPrincipalBindings'],
): Promise<SessionScopeOwnership> {
  const { tenant, session, generation } = ownership
  const principals = readPrincipalBindings()
  if (principals === undefined) return { kind: 'unavailable' }
  const result = await principals.read({ tenant, session })
  if ('failure' in result) return { kind: 'unavailable' }
  if (result.ok.kind === 'not-bound') return { kind: 'unbound' }
  if (!tenantEquals(result.ok.tenant, tenant) || result.ok.session !== session)
    return { kind: 'unavailable' }
  return { kind: 'bound', tenant, session, generation }
}

export function createSessionScopeSource(options: SessionScopeSourceOptions): SessionScopeSource {
  const scopeOwners: SessionScopeOwnershipSource = {
    async lookup(scope) {
      const target = Object.freeze({ ref: scope.ref })
      try {
        const source = options.readOwnership()
        if (source === undefined) return { kind: 'unavailable' }
        const ownership = await source.lookup(target)
        switch (ownership.kind) {
          case 'unbound':
          case 'unavailable':
          case 'unknown':
            return { kind: ownership.kind }
          case 'bound':
            return await confirmSession(ownership, options.readPrincipalBindings)
          default:
            return { kind: 'unavailable' }
        }
      } catch {
        return { kind: 'unavailable' }
      }
    },
  }
  return Object.freeze({
    scopeOwners,
    bindings: {
      async lookup(scope) {
        const owner = await scopeOwners.lookup(scope)
        return owner.kind === 'bound'
          ? { kind: 'bound', tenant: owner.tenant }
          : { kind: owner.kind }
      },
    },
  })
}
