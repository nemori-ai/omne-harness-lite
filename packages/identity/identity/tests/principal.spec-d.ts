import type { TenantId } from '@omne-harness/legal-identity'
import type {
  ActingForTenantPrincipal,
  Principal,
  PrincipalIssuer,
  SystemPrincipal,
} from '@omne-harness/identity'

declare const actor: SystemPrincipal
declare const tenant: TenantId
declare const issuer: PrincipalIssuer
const work = { owner: 'session', work: 'ses_1' } as const

// A principal that acts for a tenant cannot be written without the tenant.
// @ts-expect-error the tenant is required
const _noTenant: ActingForTenantPrincipal = { kind: 'acting-for-tenant', actor, work }
const _nullTenant: ActingForTenantPrincipal = {
  kind: 'acting-for-tenant',
  actor,
  // @ts-expect-error null is not a tenant
  tenant: null,
  work,
}
const _systemWithTenant: SystemPrincipal = {
  kind: 'system',
  component: 'scanner',
  // @ts-expect-error a system principal carries no tenant
  tenant,
}
// @ts-expect-error the issuer needs the tenant
issuer.issueActingForTenant({ actor, work })
issuer.issueActingForTenant({
  actor,
  // @ts-expect-error the issuer does not take a tenant text
  tenant: 'org_x/acc_y',
  work,
})

const _acting: ActingForTenantPrincipal = { kind: 'acting-for-tenant', actor, tenant, work }

// Reading the tenant narrows on `kind`: a system principal has none.
declare const principal: Principal
if (principal.kind === 'acting-for-tenant') {
  const _narrowed: TenantId = principal.tenant
} else {
  // @ts-expect-error a system principal has no tenant member
  const _absent = principal.tenant
}
