import {
  GovernanceCatalogRequestSchema,
  GovernanceScopeSchema,
  GovernanceIdSchema,
  type GovernanceScope,
  type GovernanceQueries,
} from '@omne-harness/governance-contract'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import { randomUUID } from 'node:crypto'
import type { DomainRef, FactCommandV2, JsonValue } from '@omne-harness/sql-contract'
import type { GovernanceAdmission } from './admission.ts'
import { CATALOG_SNAPSHOT, catalogPageSchema, type CatalogBinding } from './catalog-schema.ts'
import { canonical, equal, json } from './encoding.ts'
import { governanceFailureSchema } from './registrar-results.ts'

export type GovernanceProjectionRead = Readonly<{
  read(
    commands: readonly FactCommandV2[],
  ): Promise<
    Readonly<{ kind: 'completed'; response: JsonValue }> | Readonly<{ kind: 'unavailable' }>
  >
}>
export type GovernanceCatalogOptions = Readonly<{
  domain: DomainRef
  scope: GovernanceScope
  epoch: string
  admission: GovernanceAdmission
  current: (binding: CatalogBinding) => readonly FactCommandV2[]
  projection: GovernanceProjectionRead
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
  } catch {}
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
    const binding: CatalogBinding = {
      scope: request.request.scope,
      principalRef: admitted.principalRef,
      captureId: randomUUID(),
      epoch: options.epoch,
      transactionDomain: options.domain.transactionDomain,
      request: request.request,
    }
    const projected = await options.projection.read([
      ...options.current(binding),
      { participant: CATALOG_SNAPSHOT.participant, facts: { request: json({ binding }) } },
    ])
    if (projected.kind !== 'completed') return unavailable()
    const parsed = catalogPageSchema.or(governanceFailureSchema).safeParse(projected.response)
    if (!parsed.success || !equal(parsed.data, projected.response)) return unavailable()
    if (
      parsed.data.kind === 'page' &&
      (!equal(parsed.data.snapshot.scope, binding.scope) ||
        parsed.data.snapshot.epoch !== binding.epoch)
    )
      return unavailable()
    return options.accepting() ? parsed.data : unavailable()
  } catch {
    return unavailable()
  }
}
