import type { PrincipalVerifier } from '@omne-harness/identity'
import { standingPrincipalRef } from '@omne-harness/identity'
import { accountCodec, tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { verifySessionWork } from '../tool-runtime/session-work.ts'

/** Who a domain tool call acts for: the call's tenant and account own it, the session's agent acts. */
export type DomainCaller = Readonly<{
  tenantId: string
  ownerId: string
  principalRef: string
  actorRef: string
  session: string
}>

/** The caller of a session agent's tool call; undefined unless the principal is that session's
 * verified work principal of the call's tenant. Nothing is taken from the model. */
export async function domainCallerOf(
  verifier: PrincipalVerifier | undefined,
  principal: unknown,
  tenant: TenantId,
): Promise<DomainCaller | undefined> {
  const work = await verifySessionWork(verifier, principal, tenant)
  if (work.kind !== 'session') return undefined
  const tenantText = tenantCodec.encode(tenant)
  const account = accountCodec.encode(tenant.account)
  if (!tenantText.ok || !account.ok) return undefined
  const ref = standingPrincipalRef(work.principal)
  return {
    tenantId: tenantText.value,
    ownerId: account.value,
    principalRef: ref,
    actorRef: ref,
    session: work.session,
  }
}
