import {
  systemScope,
  tenantScope,
  type ActingScope,
  type TenantId,
} from '@omne-harness/legal-identity'

declare const tenant: TenantId

// An empty tenant cannot be written: a tenant scope needs a TenantId, a system scope has no tenant.
// @ts-expect-error a tenant scope without a tenant is not an ActingScope
const _tenantWithoutTenant: ActingScope = { kind: 'tenant' }
// @ts-expect-error a tenant scope with null as the tenant is not an ActingScope
const _tenantWithNull: ActingScope = { kind: 'tenant', tenant: null }
// @ts-expect-error a tenant scope with undefined as the tenant is not an ActingScope
const _tenantWithUndefined: ActingScope = { kind: 'tenant', tenant: undefined }
// @ts-expect-error a system scope does not carry a tenant
const _systemWithTenant: ActingScope = { kind: 'system', tenant }
// @ts-expect-error a scope with another kind is not an ActingScope
const _otherKind: ActingScope = { kind: 'organization' }
// @ts-expect-error tenantScope() needs the tenant
const _noArgument: ActingScope = tenantScope()

const _tenant: ActingScope = tenantScope(tenant)
const _system: ActingScope = systemScope()

// Reading the tenant narrows on `kind`: the system branch has no tenant member.
declare const scope: ActingScope
if (scope.kind === 'tenant') {
  const _narrowed: TenantId = scope.tenant
} else {
  // @ts-expect-error the system branch has no tenant member
  const _absent = scope.tenant
}
