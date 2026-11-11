import {
  isQualification,
  standingPrincipalRef,
  type ActingForTenantPrincipal,
  type PrincipalVerifier,
  type TenantStandingSource,
  type StandingReservations,
  type Qualification,
} from '@omne-harness/identity'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { SettingsFailure } from '@omne-harness/settings'
import type { SettingsPreparationOptions } from './preparation-types.ts'
import { createSettingsPreparationBackend } from './preparation-provider.ts'
import { equal } from './encoding.ts'
export type IdentityQualifiedPreparationOptions = {
  backend: Omit<SettingsPreparationOptions<ActingForTenantPrincipal>, 'standing'>
  identity: {
    verifier: PrincipalVerifier
    standing: TenantStandingSource
    reservations: StandingReservations
  }
  required: readonly Qualification[]
}
const forbidden = (): SettingsFailure => ({ kind: 'rejected', reason: 'forbidden' })
export function createIdentityQualifiedSettingsPreparation(
  input: IdentityQualifiedPreparationOptions,
) {
  const required = [
    ...new Set<Qualification>([
      ...input.required,
      ...(input.backend.domain.scope.kind === 'system'
        ? ['organization-settings-manage' as const]
        : []),
    ]),
  ]
  if (!required.every(isQualification)) throw new TypeError('Unknown Identity qualification')
  async function qualify(principal: ActingForTenantPrincipal) {
    const result = await input.identity.verifier.verify(principal)
    if (result.kind === 'unavailable')
      return { kind: 'rejected' as const, reason: 'unavailable' as const }
    if (result.kind !== 'verified' || result.principal.kind !== 'acting-for-tenant')
      return forbidden()
    const encoded = tenantCodec.encode(result.principal.tenant)
    if (!encoded.ok) return forbidden()
    const scope = input.backend.domain.scope
    if (scope.kind === 'tenant' && scope.tenant !== encoded.value) return forbidden()
    const standing = await input.identity.standing.read({ tenant: result.principal.tenant })
    if (standing.kind === 'unavailable')
      return { kind: 'rejected' as const, reason: 'unavailable' as const }
    if (
      standing.kind !== 'member' ||
      required.some(value => !standing.qualifications.includes(value))
    )
      return forbidden()
    return { kind: 'qualified' as const, principal: result.principal, scopeRef: encoded.value }
  }
  return createSettingsPreparationBackend<ActingForTenantPrincipal>({
    ...input.backend,
    access: {
      async authorize(principal, request) {
        const qualified = await qualify(principal)
        if (qualified.kind === 'rejected') return qualified
        const grant = await input.backend.access.authorize(qualified.principal, request)
        if (grant.kind === 'rejected') return grant
        return grant.principalRef === standingPrincipalRef(qualified.principal)
          ? grant
          : forbidden()
      },
    },
    async plan(principal, request) {
      const plan = await input.backend.plan(principal, request)
      if (plan.kind === 'rejected') return plan
      const encoded = tenantCodec.encode(principal.tenant)
      if (!encoded.ok || request.identity.principalRef !== standingPrincipalRef(principal))
        return forbidden()
      const standing = plan.standing
      if (
        standing.kind !== 'identity' ||
        standing.destination !== input.backend.destination ||
        standing.scopeRef !== encoded.value ||
        required.some(value => !standing.required.includes(value))
      )
        return { kind: 'rejected', reason: 'unsupported' }
      return plan
    },
    standing: {
      reserve(principal, request) {
        const encoded = tenantCodec.encode(principal.tenant)
        if (
          !encoded.ok ||
          !equal(
            {
              principalRef: request.binding.principalRef,
              scopeRef: request.binding.scopeRef,
              destination: request.binding.destination,
              owner: request.binding.owner,
            },
            {
              principalRef: standingPrincipalRef(principal),
              scopeRef: encoded.value,
              destination: input.backend.destination,
              owner: 'settings',
            },
          )
        )
          return Promise.resolve({ kind: 'operation-conflict' })
        return input.identity.reservations.reserve({ principal, ...request })
      },
      settle: request => input.identity.reservations.settle(request),
    },
  })
}
