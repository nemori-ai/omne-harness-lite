import type { GovernanceScope } from '@omne-harness/governance-contract'
import type { ParticipantPort, ReadPort } from '@omne-harness/sql-contract/worker'
import { z } from 'zod'
import { bootstrapSchema, type Bootstrap } from './operation-schema.ts'
import { digest, scopeKey, equal } from './encoding.ts'
const stateSchema = z.tuple([
  z.string(),
  z.enum(['isolated', 'open', 'closed']),
  z.coerce.number().int().nonnegative(),
  z.coerce.number().int().nonnegative(),
  z.string(),
  z.string().nullable(),
])
export function readScope(port: ReadPort, scope: GovernanceScope) {
  const row = port.execute(
    'SELECT current_epoch,state,declaration_revision,adoption_revision,collection_digest,adoption_digest,tenant_ref,deployment_id,logical_service_id,visibility_kind,visibility_ref FROM gc_scope WHERE scope_key=? LIMIT 1',
    [scopeKey(scope)],
  ).rows[0]
  if (!row) return null
  const expectedVisibility =
    scope.visibility.kind === 'tenant'
      ? scope.visibility.tenantRef
      : scope.visibility.kind === 'organization'
        ? scope.visibility.organizationRef
        : scope.visibility.publisherRef
  if (
    !equal(row.slice(6), [
      scope.tenantRef,
      scope.deploymentId,
      scope.logicalServiceId,
      scope.visibility.kind,
      expectedVisibility,
    ])
  )
    throw new Error('Corrupt governance scope binding')
  const [epoch, state, declarationRevision, adoptionRevision, collectionDigest, adoptionDigest] =
    stateSchema.parse(row.slice(0, 6))
  return { epoch, state, declarationRevision, adoptionRevision, collectionDigest, adoptionDigest }
}
export function bootstrapScope(port: ParticipantPort, raw: Bootstrap) {
  const input = bootstrapSchema.parse(raw)
  const current = readScope(port, input.scope)
  if (current?.epoch === input.epoch) return { kind: 'observed' as const, ...current }
  if ((current?.epoch ?? null) !== input.previousEpoch)
    return { kind: 'conflict' as const, reason: 'basis' as const }
  const key = scopeKey(input.scope)
  if (current) {
    if (
      current.declarationRevision >= Number.MAX_SAFE_INTEGER - 1 ||
      current.adoptionRevision >= Number.MAX_SAFE_INTEGER - 1
    )
      return { kind: 'limited' as const, resource: 'revision' }
    port.execute(
      "UPDATE gc_scope SET current_epoch=?,state='open',declaration_revision=declaration_revision+1,adoption_revision=adoption_revision+1,collection_digest=?,adoption_digest=NULL WHERE scope_key=?",
      [input.epoch, digest([]), key],
    )
  } else {
    const { scope, epoch } = input
    const visibility =
      scope.visibility.kind === 'tenant'
        ? scope.visibility.tenantRef
        : scope.visibility.kind === 'organization'
          ? scope.visibility.organizationRef
          : scope.visibility.publisherRef
    port.execute("INSERT INTO gc_scope VALUES (?,?,?,?,?,?,?,'open',0,0,?,NULL)", [
      key,
      scope.tenantRef,
      scope.deploymentId,
      scope.logicalServiceId,
      scope.visibility.kind,
      visibility,
      epoch,
      digest([]),
    ])
  }
  return { kind: 'opened' as const, scope: input.scope, epoch: input.epoch }
}
