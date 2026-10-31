// The one guard in front of every public operation of the provider (SPEC "租户与作用域绑定" and
// "主体资格核验"): the tenant of the Access against the binding first, then exactly one
// access.check. Only allowed lets the operation run. Each public operation checks independently.
import type {
  Access,
  AgentAccessCheck,
  AgentAccessDecision,
  AgentAccessOperation,
  AgentAccessTarget,
  Failure,
} from '@omne-harness/agent-contract'
import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import { succeed, fail, type Outcome } from '@omne-harness/operation-result'
import { isTenantId } from './configuration.ts'

/** The service key of the access check, which names it as the owner of its unavailability. */
const ACCESS_OWNER = 'agentAccessCheck'

export type AccessGuard<P> = (
  input: Access<P>,
  operation: AgentAccessOperation,
  target: AgentAccessTarget,
) => Promise<Outcome<Extract<AgentAccessDecision, { kind: 'allowed' }>, Failure>>

/**
 * Builds the guard of one runtime. A missing tenant, or one that legal-identity did not mint, is
 * `invalid` (SPEC: an Access is judged by its structure at the boundary). Another tenant is
 * `denied` and is not told apart from an object that does not exist. None of them reaches
 * access.check. The check gets only the principal and tenant of the input. A check that rejects,
 * or that answers anything other than one of the three decisions, is `unavailable`, never a pass.
 */
export function accessGuard<P>(tenant: TenantId, access: AgentAccessCheck<P>): AccessGuard<P> {
  return async (input, operation, target) => {
    // The type requires the tenant; an untyped caller can still leave it out.
    if ((input.tenant as TenantId | undefined | null) == null)
      return fail({ kind: 'invalid', field: 'tenant', reason: 'missing' })
    if (!isTenantId(input.tenant)) return fail({ kind: 'invalid', field: 'tenant', reason: 'type' })
    if (!tenantEquals(input.tenant, tenant)) return fail({ kind: 'denied', action: operation })
    let decision: unknown
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
    // The port's type promises a decision, but a provider can answer anything. Only a recognised
    // decision is read; anything else fails closed.
    if (isDecision(decision, 'allowed')) return succeed(decision)
    if (isDecision(decision, 'denied')) return fail({ kind: 'denied', action: operation })
    if (isDecision(decision, 'unavailable') && typeof decision.diagnostic === 'string')
      return fail({ kind: 'unavailable', owner: ACCESS_OWNER, diagnostic: decision.diagnostic })
    return fail({
      kind: 'unavailable',
      owner: ACCESS_OWNER,
      diagnostic: `access check of ${operation} answered outside the contract`,
    })
  }
}

/** Whether an answer of the check is an object with the decision kind `kind`. */
function isDecision<K extends AgentAccessDecision['kind']>(
  value: unknown,
  kind: K,
): value is Extract<AgentAccessDecision, { kind: K }> {
  return typeof value === 'object' && value !== null && Reflect.get(value, 'kind') === kind
}
