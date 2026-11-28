import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { TargetTenantPrincipals } from './ports.ts'

const UNAVAILABLE = Object.freeze({ outcome: 'basis-unavailable' as const })
const DENIED = Object.freeze({ outcome: 'denied' as const })

export function tenantText(tenant: TenantId): string {
  const text = tenantCodec.encode(tenant)
  if (!text.ok) throw new TypeError('plugin-access: tenant is not a minted TenantId')
  return text.value
}

/** Steps one and two of every handler: whether this login may act for the tenant, then its principal. */
export async function actingFor(
  principals: TargetTenantPrincipals,
  login: LoginIdentity,
  tenant: string,
): Promise<Principal | typeof DENIED | typeof UNAVAILABLE> {
  const issued = await principals
    .actingFor(login, tenant)
    .catch(() => ({ refused: 'basis-unavailable' as const }))
  if ('refused' in issued) return issued.refused === 'denied' ? DENIED : UNAVAILABLE
  return issued.ok
}
