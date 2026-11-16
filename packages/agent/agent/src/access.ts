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

const ACCESS_OWNER = 'agentAccessCheck'

export type AccessGuard<P> = (
  input: Access<P>,
  operation: AgentAccessOperation,
  target: AgentAccessTarget,
) => Promise<Outcome<Extract<AgentAccessDecision, { kind: 'allowed' }>, Failure>>

export function accessGuard<P>(tenant: TenantId, access: AgentAccessCheck<P>): AccessGuard<P> {
  return async (input, operation, target) => {
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

function isDecision<K extends AgentAccessDecision['kind']>(
  value: unknown,
  kind: K,
): value is Extract<AgentAccessDecision, { kind: K }> {
  return typeof value === 'object' && value !== null && Reflect.get(value, 'kind') === kind
}
