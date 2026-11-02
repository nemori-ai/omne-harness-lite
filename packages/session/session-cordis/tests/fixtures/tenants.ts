// Two tenants and the access policy of the tests. A principal is a text that carries its tenant:
// `a:` for tenant A, `b:` for tenant B, and `system:` for the internal principals.
import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import type { SessionAccessRequest } from '@omne-harness/session-contract'
import {
  evidence,
  memoryAccess,
  memoryOtherAccess,
  type SessionAccessScript,
} from '@omne-harness/session-contract/testing'

export const TENANT_A: TenantId = memoryAccess('a:tester').tenant
export const TENANT_B: TenantId = memoryOtherAccess('b:stranger').tenant

function tenantOf(principal: string): TenantId | null {
  if (principal.startsWith('a:')) return TENANT_A
  if (principal.startsWith('b:')) return TENANT_B
  return null
}

export function prefixOf(tenant: TenantId): string {
  return tenantEquals(tenant, TENANT_A) ? 'a' : 'b'
}

/** A principal acts on its own tenant; `system:` principals act on any tenant and the system scope. */
export function policy(request: SessionAccessRequest<string>): SessionAccessScript {
  const principal = request.access.principal
  const allowed: SessionAccessScript = {
    kind: 'allowed',
    evidence: evidence(`access/${request.operation}`),
  }
  if (principal.startsWith('system:')) return allowed
  const own = tenantOf(principal)
  if (!('tenant' in request.access) || own === null) return { kind: 'denied' }
  return tenantEquals(request.access.tenant, own) ? allowed : { kind: 'denied' }
}
