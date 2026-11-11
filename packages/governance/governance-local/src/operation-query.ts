import {
  GovernanceOperationQuerySchema,
  type GovernanceOperationRef,
  type GovernanceScope,
  type GovernanceQueries,
} from '@omne-harness/governance-contract'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import type { GovernanceAdmission } from './admission.ts'
import type { SqlOperationCoordinator } from './sql-coordinator.ts'
import { canonical, equal } from './encoding.ts'
import { originalOperation } from './registrar-results.ts'

function captureQuery(raw: unknown) {
  try {
    if (Buffer.byteLength(canonical(raw)) > 16 * 1024)
      return { kind: 'limited' as const, resource: 'query-bytes' }
    const parsed = GovernanceOperationQuerySchema.safeParse(raw)
    if (parsed.success && equal(parsed.data, raw))
      return { kind: 'query' as const, query: parsed.data }
  } catch {
    /* Non-JSON local inputs are invalid transport values. */
  }
  return { kind: 'invalid-input' as const, field: 'query', reason: 'shape' }
}
async function observeOperation(sql: SqlOperationCoordinator, ref: GovernanceOperationRef) {
  const found = await sql.lookup(ref)
  if (found.kind === 'found')
    return originalOperation({ ref, requestDigest: found.record.requestDigest }, found.record)
  if (found.kind !== 'absent') return { kind: 'unknown' as const, operation: ref }
  const proof = await sql.uncommitted(ref)
  const latest = await sql.lookup(ref)
  if (latest.kind === 'found')
    return originalOperation({ ref, requestDigest: latest.record.requestDigest }, latest.record)
  return latest.kind === 'absent' && proof.kind === 'not-committed'
    ? proof
    : { kind: 'unknown' as const, operation: ref }
}
export function createOperationQuery(
  options: Readonly<{
    scope: GovernanceScope
    admission: GovernanceAdmission
    sql: SqlOperationCoordinator
    accepting: () => boolean
  }>,
): GovernanceQueries<ActingForTenantPrincipal>['queryOperation'] {
  const scope = structuredClone(options.scope)
  return async (access, raw) => {
    if (!options.accepting()) return { kind: 'unavailable', owner: 'governance-provider' }
    const captured = captureQuery(raw)
    if (captured.kind !== 'query') return captured
    if (!equal(captured.query.scope, scope) || !access) return { kind: 'denied' }
    const context = { principal: access.principal, tenant: access.tenant }
    try {
      const admitted = await options.admission.check(context, { action: 'operation-read', scope })
      if (admitted.kind !== 'admitted') return admitted
      return await observeOperation(options.sql, {
        ...captured.query,
        principalRef: admitted.principalRef,
      })
    } catch {
      return { kind: 'unavailable', owner: 'governance-operation' }
    }
  }
}
