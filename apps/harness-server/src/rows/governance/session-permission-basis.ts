import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { canonicalText } from '@omne-harness/authorization'
import { tenantCodec, organizationCodec } from '@omne-harness/legal-identity'
import {
  GovernanceExternalWriteBasisSchema,
  GovernanceExternalWriteExecutionSchema,
  GovernanceDefinitionProjectionSchema,
  governanceExternalWriteBasisFact,
  governanceDefinitionProjectionFact,
  type GovernanceExternalWriteBasis,
} from '@omne-harness/governance-local'
import { judgePermissionAssignment, type PermissionConstraint } from '@omne-harness/permissions'
import {
  SessionCommitBasisSchema,
  SESSION_COMMIT_BASIS,
  sessionCommitDigest,
  type SessionCommitBasis,
} from '@omne-harness/session-storage-sql/participants'
import type { SqlMaterialCatalog } from '@omne-harness/sql-contract'
import type { SessionPermissionQualification } from './session-permission-qualification.ts'
import {
  SESSION_PERMISSION_WRITE_PROTOCOL,
  sessionPermissionCoordination,
} from './session-permission-result.ts'
import { SESSION_PERMISSION_OWN_LOGIN_POLICY } from '../authorization/session-permission-write.ts'
import { sessionPermissionResolvedQualificationSchema } from './session-permission-discovery.ts'
import { sessionPermissionMaterial } from './session-permission-material.ts'
import { targetSnapshotFact, type TargetSnapshot } from './target-snapshot.ts'

export const sessionPermissionBasisConfigurationSchema = z.strictObject({
  mode: z.enum(['clear', 'unmapped', 'mapped']),
  requiredConstraintIds: z.array(z.string().min(1)).max(64),
})
export type SessionPermissionBasisConfiguration = z.infer<
  typeof sessionPermissionBasisConfigurationSchema
>
export function sessionPermissionBasisIdentity(configuration: SessionPermissionBasisConfiguration) {
  return {
    participant: `harness.session-permission-basis.${configuration.mode}`,
    protocol: `harness-session-permission-basis/1/${createHash('sha256').update(canonicalText(configuration)).digest('hex')}`,
  }
}
export function sessionPermissionBasisParticipant(
  configuration: SessionPermissionBasisConfiguration,
): SqlMaterialCatalog['participants'][number] {
  const fixed = sessionPermissionBasisConfigurationSchema.parse(configuration)
  const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js'
  const file = new URL(`./session-permission-basis-participant.${extension}`, import.meta.url)
  const codeDigest = createHash('sha256').update(readFileSync(file)).digest('hex')
  file.searchParams.set('configuration', JSON.stringify(fixed))
  return {
    ...sessionPermissionBasisIdentity(fixed),
    moduleUrl: file.href,
    codeDigest,
    ownedTables: [],
    readTables: [],
    allowedFunctions: [],
    grouping: 'groupable',
    requiresFacts: [
      governanceExternalWriteBasisFact,
      ...(fixed.mode === 'clear' ? [] : [governanceDefinitionProjectionFact]),
      ...(fixed.mode === 'mapped' ? [targetSnapshotFact] : []),
    ],
    providesFacts: [SESSION_COMMIT_BASIS],
  }
}
function originalQualification(basis: GovernanceExternalWriteBasis) {
  const qualification = sessionPermissionResolvedQualificationSchema.safeParse(
    basis.command.write.qualification,
  )
  const execution = GovernanceExternalWriteExecutionSchema.safeParse(
    basis.request.execution.authority,
  )
  if (!qualification.success || !execution.success) return null
  const own = execution.data.commands.filter(command => command.participant === 'session')
  if (own.length !== 1 || execution.data.writer !== 'session') return null
  const selected = qualification.data
  const q = selected.original
  if (canonicalText(own[0]) !== canonicalText(q.commandFacts)) return null
  if (canonicalText(q.commandFacts.facts['command']) !== canonicalText(basis.command.write.command))
    return null
  const ref = basis.request.binding.ref
  const observed = {
    owner: basis.command.write.owner,
    protocol: basis.command.write.protocol,
    requestDigest: execution.data.requestDigest,
    tenantRef: q.tenantRef,
    session: q.session,
    operation: q.operation,
    commandDigest: q.commandDigest,
    principalRef: q.principalRef,
    policy: q.policy,
  }
  const expected = {
    owner: 'session',
    protocol: SESSION_PERMISSION_WRITE_PROTOCOL,
    requestDigest: basis.request.binding.requestDigest,
    tenantRef: ref.scope.tenantRef,
    session: basis.command.write.targetRef,
    operation: ref.operationId,
    commandDigest: basis.command.write.commandDigest,
    principalRef: ref.principalRef,
    policy: SESSION_PERMISSION_OWN_LOGIN_POLICY,
  }
  if (canonicalText(observed) !== canonicalText(expected)) return null
  return { qualification: q, selected, commandsDigest: sessionCommitDigest(own) }
}

function sourceSelectionMatches(
  selected: Extract<z.infer<typeof sessionPermissionResolvedQualificationSchema>, { kind: 'set' }>,
  basis: GovernanceExternalWriteBasis,
  values: TargetSnapshot | null,
  mode: SessionPermissionBasisConfiguration['mode'],
) {
  const selection = selected.settings
  if (selection.kind !== mode) return false
  if (selection.kind === 'unmapped') return basis.command.source === null
  return (
    values !== null &&
    basis.source !== null &&
    canonicalText(values.binding.target) === canonicalText(selection.target) &&
    canonicalText(basis.command.source) === canonicalText(selection.source) &&
    canonicalText(basis.source.source) === canonicalText(selection.source)
  )
}

function assignmentScope(
  basis: GovernanceExternalWriteBasis,
  qualification: SessionPermissionQualification,
  values: TargetSnapshot | null,
) {
  const tenant = tenantCodec.parse(qualification.tenantRef)
  if (!tenant.ok) return undefined
  const organization = organizationCodec.encode(tenant.value.organization)
  if (!organization.ok) return undefined
  return {
    tenantId: qualification.tenantRef,
    sessionId: qualification.session,
    organizationId: organization.value,
    deploymentId: basis.request.binding.ref.scope.deploymentId,
    logicalServiceId: basis.request.binding.ref.scope.logicalServiceId,
    targetId: values === null ? qualification.session : canonicalText(values.binding.target),
  }
}

function currentDefinition(
  basis: GovernanceExternalWriteBasis,
  qualification: SessionPermissionQualification,
  rawProjection: unknown,
  configuration: SessionPermissionBasisConfiguration,
  values: TargetSnapshot | null,
  selected: Extract<z.infer<typeof sessionPermissionResolvedQualificationSchema>, { kind: 'set' }>,
) {
  const projection = GovernanceDefinitionProjectionSchema.safeParse(rawProjection)
  const scope = assignmentScope(basis, qualification, values)
  if (!projection.success || scope === undefined) return undefined
  if (!sourceSelectionMatches(selected, basis, values, configuration.mode)) return undefined
  if (canonicalText(projection.data.binding.definition) !== canonicalText(selected.definition))
    return undefined
  const ref = basis.request.binding.ref
  const constraints: PermissionConstraint[] = configuration.requiredConstraintIds.map(id => ({
    id,
    kind: 'unavailable',
    sourceRef: id,
  }))
  const material = sessionPermissionMaterial({
    binding: {
      scope: ref.scope,
      epoch: basis.epoch,
      principalRef: ref.principalRef,
      captureId: ref.operationId,
      transactionDomain: basis.transactionDomain,
      definition: projection.data.binding.definition,
    },
    projection: projection.data,
    change: qualification.change,
    scope,
    values,
    organization: basis.source,
    requiredConstraintIds: configuration.requiredConstraintIds,
    constraints,
  })
  if (material === undefined || material.declaration.kind !== 'available') return undefined
  const definition = material.declaration.definition
  if ((definition.settings === null) !== (configuration.mode === 'unmapped')) return undefined
  const judgment = judgePermissionAssignment({
    layer: 'session',
    rule: qualification.change.rule,
    current: material,
  })
  return judgment.kind === 'valid' ? definition : undefined
}

export function sessionPermissionWriteBasis(
  raw: unknown,
  projection: unknown,
  configuration: SessionPermissionBasisConfiguration,
  values: TargetSnapshot | null = null,
): SessionCommitBasis | null {
  const parsed = GovernanceExternalWriteBasisSchema.safeParse(raw)
  if (!parsed.success) return null
  const basis = parsed.data
  const original = originalQualification(basis)
  if (original === null) return null
  const q = original.qualification
  const clear = q.change.rule === null
  if (clear !== (configuration.mode === 'clear')) return null
  const definition =
    original.selected.kind === 'clear'
      ? null
      : currentDefinition(basis, q, projection, configuration, values, original.selected)
  if (definition === undefined) return null
  return SessionCommitBasisSchema.parse({
    kind: 'permission-change',
    commandsDigest: original.commandsDigest,
    coordination: sessionPermissionCoordination(basis),
    permissionChange: {
      operation: q.operation,
      commandDigest: q.commandDigest,
      revision: q.permissionRevision,
      definition,
      authority: q.policy,
    },
  })
}
