import {
  standingPrincipalRef,
  type ActingForTenantPrincipal,
  type PrincipalVerifier,
  type TenantStandingSource,
} from '@omne-harness/identity'
import { tenantCodec, organizationCodec } from '@omne-harness/legal-identity'
import type { SourceRequest } from './source-retention-schema.ts'
import type { SettingsFailure } from '@omne-harness/settings'
import { createSettingsSourceReservations, type SettingsSourceOptions } from './source-service.ts'
function matchesOrganization(principal: ActingForTenantPrincipal, request: SourceRequest) {
  const tenant = tenantCodec.encode(principal.tenant)
  const organization = organizationCodec.encode(principal.tenant.organization)
  const destination = request.destination.identity
  return (
    tenant.ok &&
    organization.ok &&
    request.source.target.scopeRef === organization.value &&
    request.source.target.policyId === 'independent' &&
    destination.domain.scope.kind === 'tenant' &&
    destination.domain.scope.tenant === tenant.value &&
    destination.principalRef === standingPrincipalRef(principal)
  )
}
export function createIdentityQualifiedSettingsSources(input: {
  backend: SettingsSourceOptions<ActingForTenantPrincipal>
  identity: { verifier: PrincipalVerifier; standing: TenantStandingSource }
}) {
  if (
    input.backend.domain.scope.kind !== 'system' ||
    input.backend.domain.transactionDomain !== 'system.settings'
  )
    throw new TypeError('Organization sources require system.settings')
  const forbidden = (): SettingsFailure => ({ kind: 'rejected', reason: 'forbidden' })
  return createSettingsSourceReservations<ActingForTenantPrincipal>({
    ...input.backend,
    access: {
      async authorize(caller, request) {
        const verified = await input.identity.verifier.verify(caller)
        if (verified.kind === 'unavailable') return { kind: 'rejected', reason: 'unavailable' }
        if (verified.kind !== 'verified' || verified.principal.kind !== 'acting-for-tenant')
          return forbidden()
        const principal = verified.principal
        if (!matchesOrganization(principal, request)) return forbidden()
        const standing = await input.identity.standing.read({ tenant: principal.tenant })
        if (standing.kind === 'unavailable') return { kind: 'rejected', reason: 'unavailable' }
        if (standing.kind !== 'member') return forbidden()
        return input.backend.access.authorize(principal, request)
      },
    },
  })
}
