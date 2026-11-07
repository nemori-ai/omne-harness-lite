import {
  GovernanceCatalogRequestSchema,
  GovernanceScopeSchema,
  GovernanceIdSchema,
  type GovernanceScope,
  type GovernanceQueries,
} from '@omne-harness/governance-contract'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import type { GovernanceAdmission } from './admission.ts'
import { mutationCombinationSchema, type MutationCombination } from './registrar-execution.ts'
import { canonical, equal } from './encoding.ts'
import { captureCatalog, type CatalogCaptureOptions } from './catalog-capture.ts'
export type GovernanceCatalogOptions = CatalogCaptureOptions &
  Readonly<{
    scope: GovernanceScope
    epoch: string
    combination: MutationCombination
    admission: GovernanceAdmission
    accepting: () => boolean
  }>
const unavailable = () => ({ kind: 'unavailable' as const, owner: 'governance-catalog' })
function captureRequest(raw: unknown) {
  try {
    if (Buffer.byteLength(canonical(raw)) > 32 * 1024)
      return { kind: 'limited' as const, resource: 'catalog-request' }
    const parsed = GovernanceCatalogRequestSchema.safeParse(raw)
    if (
      parsed.success &&
      equal(raw, parsed.data) &&
      new Set(parsed.data.targets.map(canonical)).size === parsed.data.targets.length
    )
      return { kind: 'request' as const, request: parsed.data }
  } catch {
    /* Reject non-JSON local values at the boundary. */
  }
  return { kind: 'invalid-input' as const, field: 'catalog', reason: 'shape' }
}
export function createGovernanceCatalog(
  input: GovernanceCatalogOptions,
): GovernanceQueries<ActingForTenantPrincipal>['readCatalog'] {
  const options = {
    ...input,
    domain: structuredClone(input.domain),
    scope: GovernanceScopeSchema.parse(input.scope),
    epoch: GovernanceIdSchema.parse(input.epoch),
    destination: GovernanceIdSchema.parse(input.destination),
    combination: mutationCombinationSchema.parse(input.combination),
  }
  if (
    options.domain.scope.kind !== 'tenant' ||
    options.domain.scope.tenant !== options.scope.tenantRef
  )
    throw new TypeError('Governance catalog requires its tenant domain')
  return (access, raw) => readCatalog(options, access, raw)
}
async function readCatalog(
  options: GovernanceCatalogOptions,
  access: Parameters<GovernanceQueries<ActingForTenantPrincipal>['readCatalog']>[0],
  raw: unknown,
): ReturnType<GovernanceQueries<ActingForTenantPrincipal>['readCatalog']> {
  if (!options.accepting()) return unavailable()
  const request = captureRequest(raw)
  if (request.kind !== 'request') return request
  if (!access || !equal(request.request.scope, options.scope)) return { kind: 'denied' }
  const context = { principal: access.principal, tenant: access.tenant }
  try {
    const admitted = await options.admission.check(context, {
      scope: options.scope,
      action: request.request.mode === 'management' ? 'catalog-management' : 'catalog-runtime',
    })
    if (admitted.kind !== 'admitted') return admitted
    if (!options.accepting()) return unavailable()
    return await captureCatalog(options, admitted, request.request)
  } catch {
    return unavailable()
  }
}
