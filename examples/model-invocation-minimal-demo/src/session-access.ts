import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import type {
  AccessDecision,
  AccessIdentity,
  AccessOperation,
  SessionAccess,
  SessionAccessAuthorityOperations,
  SessionAccessIssuer,
  SessionAccessOperations,
  SessionScope,
} from '@omne-harness-lite/session-tenancy'

const rejected = (reason: 'invalidInput' | 'notAuthorized' | 'unavailable' | 'ownerStopped') =>
  ({ kind: 'rejected', reason }) as const
const sameScope = (a: SessionScope, b: SessionScope) =>
  tenantIdEquals(a.tenant, b.tenant) && a.session === b.session
const sameIdentity = (a: AccessIdentity, b: AccessIdentity) =>
  a.binding === b.binding &&
  a.principal === b.principal &&
  a.principalKind === b.principalKind &&
  a.consumer === b.consumer &&
  sameScope(a.scope, b.scope) &&
  a.contextKeys.length === b.contextKeys.length &&
  a.contextKeys.every(key => b.contextKeys.includes(key))
function ownIdentity(identity: AccessIdentity): AccessIdentity {
  return Object.freeze({
    ...identity,
    scope: Object.freeze({
      ...identity.scope,
      tenant: Object.freeze({ ...identity.scope.tenant }),
    }),
    contextKeys: Object.freeze([...identity.contextKeys]),
  })
}
interface Binding {
  readonly ingress: AccessIdentity
  readonly adopted: AccessIdentity
  readonly operations: ReadonlySet<AccessOperation>
}

/** An application generation owns tokens. Only trusted bootstrap receives issuerFor. */
export function createSessionAccessOwner(authority: SessionAccessAuthorityOperations) {
  const bindings = new WeakMap<SessionAccess, Binding>()
  let active = true
  async function check(
    identity: AccessIdentity,
    operation: AccessOperation,
  ): Promise<AccessDecision> {
    if (!active) return rejected('ownerStopped')
    try {
      const result = await authority.check(identity, operation)
      if (!active) return rejected('ownerStopped')
      if (result.kind === 'authorized' && !sameIdentity(identity, result.identity))
        return rejected('unavailable')
      return result
    } catch {
      return rejected(active ? 'unavailable' : 'ownerStopped')
    }
  }
  const operations: SessionAccessOperations = {
    async authorize(access, scope, operation) {
      if (!active) return rejected('ownerStopped')
      const bound = bindings.get(access)
      if (!bound || !sameScope(bound.adopted.scope, scope) || !bound.operations.has(operation))
        return rejected('notAuthorized')
      const current = await check(bound.ingress, operation)
      if (current.kind !== 'authorized') return current
      // Revocation during the authority await must also win.
      if (bindings.get(access) !== bound) return rejected('notAuthorized')
      return { kind: 'authorized', identity: ownIdentity(bound.adopted) }
    },
  }
  function issuerFor(identity: AccessIdentity): SessionAccessIssuer {
    const ingress = ownIdentity(identity)
    return Object.freeze({
      async issue(
        request: Parameters<SessionAccessIssuer['issue']>[0],
      ): ReturnType<SessionAccessIssuer['issue']> {
        if (!active) return rejected('ownerStopped')
        if (
          request.principal !== ingress.principal ||
          request.principalKind !== ingress.principalKind ||
          request.consumer !== ingress.consumer ||
          !sameScope(request.scope, ingress.scope) ||
          request.contextKeys.some(key => !ingress.contextKeys.includes(key))
        )
          return rejected('notAuthorized')
        if (
          request.operations.length === 0 ||
          new Set(request.operations).size !== request.operations.length ||
          new Set(request.contextKeys).size !== request.contextKeys.length
        )
          return rejected('invalidInput')
        // Own inputs before the first authority read. No caller mutation can expand this token.
        const adopted = ownIdentity({ ...ingress, contextKeys: request.contextKeys })
        const permitted = new Set(request.operations)
        for (const operation of permitted) {
          const current = await check(ingress, operation)
          if (current.kind !== 'authorized') return current
        }
        if (!active) return rejected('ownerStopped')
        // The public brand has no runtime authority; membership in this private map does.
        const access = Object.freeze(Object.create(null)) as SessionAccess
        bindings.set(access, { ingress, adopted, operations: permitted })
        return { kind: 'issued', access }
      },
      revoke(access: SessionAccess) {
        bindings.delete(access)
      },
    })
  }
  return Object.freeze({
    operations,
    issuerFor,
    /** Private grant provenance only. The caller must recheck current authority in its unit. */
    captureIdentity(access: SessionAccess, scope: SessionScope, operation: AccessOperation) {
      const bound = bindings.get(access)
      if (
        !active ||
        !bound ||
        !sameScope(bound.adopted.scope, scope) ||
        !bound.operations.has(operation)
      )
        return undefined
      return bound.ingress
    },
    stop() {
      active = false
    },
  })
}
