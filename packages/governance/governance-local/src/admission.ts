import {
  GovernanceTenantRefSchema,
  type GovernanceScope,
  type GovernanceFailure,
} from '@omne-harness/governance-contract'
import {
  standingPrincipalRef,
  type ActingForTenantPrincipal,
  type PrincipalVerifier,
  type Qualification,
  type TenantStandingSource,
} from '@omne-harness/identity'
import { organizationCodec, tenantCodec, type Access } from '@omne-harness/legal-identity'
import {
  admissionGrantsSchema,
  admissionRequestSchema,
  type AdmissionGrant,
  type AdmissionRequest,
} from './admission-schema.ts'
import { canonical, equal } from './encoding.ts'

type Admission = Readonly<{
  kind: 'admitted'
  principal: ActingForTenantPrincipal
  principalRef: string
  required: readonly Qualification[]
  request: AdmissionRequest
}>
type AdmissionOptions = Readonly<{
  tenantRef: string
  verifier: PrincipalVerifier
  standing: TenantStandingSource
  grants: readonly AdmissionGrant[]
}>
const denied = () => ({ kind: 'denied' as const })
const unavailable = (owner: string) => ({ kind: 'unavailable' as const, owner })
const grantKey = (principalRef: string, request: Pick<AdmissionRequest, 'scope' | 'action'>) =>
  canonical([principalRef, request.scope, request.action])

function sizeWithin(value: unknown, limit: number) {
  try {
    return Buffer.byteLength(canonical(value)) <= limit
  } catch {
    return false
  }
}
function captureRequest(input: AdmissionRequest) {
  if (!sizeWithin(input, 1024 * 1024))
    return { kind: 'limited' as const, resource: 'admission-bytes' }
  const parsed = admissionRequestSchema.safeParse(input)
  if (!parsed.success || !equal(input, parsed.data))
    return { kind: 'invalid-input' as const, field: 'admission', reason: 'shape' }
  return { kind: 'request' as const, request: parsed.data }
}
function grantsByKey(input: readonly AdmissionGrant[], tenantRef: string) {
  if (!sizeWithin(input, 4 * 1024 * 1024)) throw new TypeError('Governance grants exceed budget')
  const grants = admissionGrantsSchema.parse(input)
  const result = new Map<string, AdmissionGrant>()
  for (const item of grants) {
    const key = grantKey(item.principalRef, item)
    if (item.scope.tenantRef !== tenantRef || result.has(key))
      throw new TypeError('Governance grants require one exact tenant, principal, scope and action')
    if (item.action === 'contribute') {
      const owners = item.owners.map(owner => owner.ownerId)
      if (new Set(owners).size !== owners.length)
        throw new TypeError('Governance grants require unique owners')
    }
    result.set(key, item)
  }
  return result
}
function visible(scope: GovernanceScope, principal: ActingForTenantPrincipal) {
  switch (scope.visibility.kind) {
    case 'tenant':
      return scope.visibility.tenantRef === scope.tenantRef
    case 'organization': {
      const organization = organizationCodec.encode(principal.tenant.organization)
      return organization.ok && organization.value === scope.visibility.organizationRef
    }
    case 'public':
      return true
  }
}
function permits(grant: AdmissionGrant, request: AdmissionRequest) {
  if (request.action !== 'contribute') return grant.action === request.action
  if (grant.action !== 'contribute') return false
  const owner = grant.owners.find(item => item.ownerId === request.declaration.reference.ownerId)
  if (!owner) return false
  const allowed = new Set(owner.enforcementBindings.map(canonical))
  return request.declaration.enforcementBindings.every(binding => allowed.has(canonical(binding)))
}

export class GovernanceAdmission {
  private readonly tenantRef: string
  private readonly verifier: PrincipalVerifier
  private readonly standing: TenantStandingSource
  private readonly grants: ReadonlyMap<string, AdmissionGrant>

  constructor(options: AdmissionOptions) {
    this.tenantRef = GovernanceTenantRefSchema.parse(options.tenantRef)
    this.verifier = options.verifier
    this.standing = options.standing
    this.grants = grantsByKey(options.grants, this.tenantRef)
  }

  private async verify(principal: unknown, scope: GovernanceScope) {
    try {
      const verified = await this.verifier.verify(principal)
      if (verified.kind === 'unavailable') return unavailable('identity-verifier')
      if (verified.kind !== 'verified' || verified.principal.kind !== 'acting-for-tenant')
        return denied()
      if (verified.principal !== principal) return denied()
      const tenant = tenantCodec.encode(verified.principal.tenant)
      if (!tenant.ok || tenant.value !== scope.tenantRef || !visible(scope, verified.principal))
        return denied()
      return { kind: 'verified' as const, principal: verified.principal }
    } catch {
      return unavailable('identity-verifier')
    }
  }

  private async current(principal: ActingForTenantPrincipal, required: readonly Qualification[]) {
    try {
      const current = await this.standing.read({ tenant: principal.tenant })
      if (current.kind === 'unavailable') return unavailable('identity-standing')
      if (current.kind !== 'member' || required.some(q => !current.qualifications.includes(q)))
        return denied()
      return { kind: 'qualified' as const }
    } catch {
      return unavailable('identity-standing')
    }
  }

  async check(
    access: Access<unknown>,
    input: AdmissionRequest,
  ): Promise<Admission | GovernanceFailure> {
    if (!access) return denied()
    const captured = captureRequest(input)
    if (captured.kind !== 'request') return captured
    const request = captured.request
    const principal = access.principal
    const tenant = tenantCodec.encode(access.tenant)
    if (!tenant.ok || tenant.value !== this.tenantRef || tenant.value !== request.scope.tenantRef)
      return denied()
    const verified = await this.verify(principal, request.scope)
    if (verified.kind !== 'verified') return verified
    const principalRef = standingPrincipalRef(verified.principal)
    const grant = this.grants.get(grantKey(principalRef, request))
    if (!grant || !permits(grant, request)) return denied()
    const current = await this.current(verified.principal, grant.required)
    if (current.kind !== 'qualified') return current
    return {
      kind: 'admitted',
      principal: verified.principal,
      principalRef,
      required: [...grant.required],
      request,
    }
  }
}
