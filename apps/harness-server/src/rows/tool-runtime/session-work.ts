import type { ActingForTenantPrincipal, PrincipalVerifier } from '@omne-harness/identity'
import { tenantCodec, tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import { SESSION_WORK_OWNER, classify } from '../authorization/principals.ts'

export const SESSION_WORK_COMPONENT = 'sessionWorkPrincipals'

export function sessionWorkOf(
  principal: unknown,
  tenant?: TenantId,
): Readonly<{ principal: ActingForTenantPrincipal; session: string }> | undefined {
  const who = classify(principal)
  if (who?.column !== 'work') return undefined
  const p = who.principal
  if (
    p.kind !== 'acting-for-tenant' ||
    p.actor.component !== SESSION_WORK_COMPONENT ||
    p.work.owner !== SESSION_WORK_OWNER ||
    !tenantCodec.encode(p.tenant).ok
  )
    return undefined
  if (tenant !== undefined && (!tenantCodec.encode(tenant).ok || !tenantEquals(p.tenant, tenant)))
    return undefined
  return { principal: p, session: p.work.work }
}

export type VerifiedSessionWork =
  | Readonly<{ kind: 'session'; principal: ActingForTenantPrincipal; session: string }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export async function verifySessionWork(
  verifier: PrincipalVerifier | undefined,
  principal: unknown,
  tenant?: TenantId,
): Promise<VerifiedSessionWork> {
  if (verifier === undefined)
    return { kind: 'unavailable', diagnostic: 'principal verifier absent' }
  let checked: Awaited<ReturnType<PrincipalVerifier['verify']>>
  try {
    checked = await verifier.verify(principal)
  } catch {
    return { kind: 'unavailable', diagnostic: 'principal verification threw' }
  }
  if (checked.kind === 'unavailable')
    return { kind: 'unavailable', diagnostic: 'principal verifier unavailable' }
  if (checked.kind !== 'verified') return { kind: 'denied' }
  const work = sessionWorkOf(checked.principal, tenant)
  return work === undefined ? { kind: 'denied' } : { kind: 'session', ...work }
}
