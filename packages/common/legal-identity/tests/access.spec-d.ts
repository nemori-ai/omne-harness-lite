import { access, type Access, type TenantId } from '@omne-harness/legal-identity'

declare const tenant: TenantId
type Principal = { readonly kind: 'system'; readonly component: string }
declare const principal: Principal

// @ts-expect-error an access basis without a tenant is not an Access
const _noTenant: Access<Principal> = { principal }
// @ts-expect-error an access basis with null as the tenant is not an Access
const _nullTenant: Access<Principal> = { principal, tenant: null }
// @ts-expect-error a tenant text is not a TenantId
const _textTenant: Access<Principal> = { principal, tenant: 'org_x/acc_y' }
// @ts-expect-error access() needs the tenant
const _noArgument: Access<Principal> = access(principal)

const built: Access<Principal> = access(principal, tenant)
// The principal type flows through unchanged.
const _principal: Principal = built.principal
// @ts-expect-error the members are read-only
built.tenant = tenant

// The definition is exactly `Readonly<{ principal: P; tenant: TenantId }>`; the contract members
// re-export it, so this is the shape their consumers accept.
type Local<P> = Readonly<{ principal: P; tenant: TenantId }>
const _toLocal: Local<Principal> = built
declare const local: Local<Principal>
const _fromLocal: Access<Principal> = local
