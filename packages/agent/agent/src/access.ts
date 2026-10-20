// The one guard in front of every public operation of the provider (SPEC "租户与作用域绑定" and
// "主体资格核验"): the tenant of the Access against the binding first, then exactly one
// access.check. Only `allowed` lets the operation run, and the decision is never kept, so the next
// operation checks again.
import type {
  Access,
  AgentAccessCheck,
  AgentAccessOperation,
  AgentAccessTarget,
  Failure,
} from '@omne-harness/agent-contract'
import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import { ack, fail, type Ack } from '@omne-harness/operation-result'

/** The service key of the access check, which names it as the owner of its unavailability. */
const ACCESS_OWNER = 'agentAccessCheck'

export type AccessGuard<P> = (
  input: Access<P>,
  operation: AgentAccessOperation,
  target: AgentAccessTarget,
) => Promise<Ack<Failure>>

/**
 * Builds the guard of one runtime. A missing tenant is `invalid`; another tenant is `denied` and is
 * not told apart from an object that does not exist. Neither reaches access.check. The check gets
 * only the principal and tenant of the input. A check that rejects is `unavailable`, never a pass.
 */
export function accessGuard<P>(tenant: TenantId, access: AgentAccessCheck<P>): AccessGuard<P> {
  return async (input, operation, target) => {
    // The type requires the tenant; an untyped caller can still leave it out.
    if ((input.tenant as TenantId | undefined | null) == null)
      return fail({ kind: 'invalid', field: 'tenant', reason: 'missing' })
    if (!tenantEquals(input.tenant, tenant)) return fail({ kind: 'denied', action: operation })
    let decision
    try {
      decision = await access.check({
        access: { principal: input.principal, tenant: input.tenant },
        operation,
        target,
      })
    } catch {
      return fail({
        kind: 'unavailable',
        owner: ACCESS_OWNER,
        diagnostic: `access check of ${operation} failed`,
      })
    }
    switch (decision.kind) {
      case 'allowed':
        return ack()
      case 'denied':
        return fail({ kind: 'denied', action: operation })
      case 'unavailable':
        return fail({ kind: 'unavailable', owner: ACCESS_OWNER, diagnostic: decision.diagnostic })
      default: {
        // A decision outside the contract fails closed instead of passing.
        const _exhaustive: never = decision
        return fail({
          kind: 'unavailable',
          owner: ACCESS_OWNER,
          diagnostic: `access check of ${operation} answered outside the contract`,
        })
      }
    }
  }
}
