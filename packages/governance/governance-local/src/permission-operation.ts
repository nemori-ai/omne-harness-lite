import {
  PermissionCurrentBasisSchema,
  evaluatePermission,
  readPermissionSettingsSource,
  type PermissionEvaluation,
  type PermissionSource,
} from '@omne-harness/permissions'
import type { ParticipantPort } from '@omne-harness/sql-contract/worker'
import type { OperationRecord } from './operation-schema.ts'
import type { ActivationPlan } from './activation-schema.ts'
import { submittedOperation } from './apply-operation.ts'
import { finishOperation } from './operation.ts'
import { readGovernanceStanding } from './standing-custody.ts'
import { readGovernanceSource } from './source-custody.ts'
import { canonical, digest, equal } from './encoding.ts'

type Plan = Extract<ActivationPlan, { kind: 'permission-capture' }>
type Custody = ReturnType<typeof readGovernanceSource>
const unavailable = () => ({
  kind: 'unavailable' as const,
  sourceRef: 'governance.permission-current',
})
const missingOrganization = (): PermissionSource => ({
  kind: 'unavailable',
  sourceRef: 'settings.organization',
})

function organizationSource(custody: Custody, evaluation: PermissionEvaluation): PermissionSource {
  if (custody.kind !== 'held' || evaluation.declaration.kind !== 'available')
    return missingOrganization()
  const { snapshot } = custody
  const candidates = snapshot.projection.sources.filter(
    source =>
      source.scope.kind === 'organization' &&
      source.scope.subjectRef === evaluation.scope.organizationId,
  )
  if (candidates.length !== 1) return missingOrganization()
  const descriptor = candidates[0]!
  const source = snapshot.state.sources.find(item => item.id === descriptor.sourceId)
  if (source === undefined) return missingOrganization()
  const result = readPermissionSettingsSource({
    definition: evaluation.declaration.definition,
    scope: evaluation.scope,
    layer: 'organization',
    sourceRef: digest(snapshot.source),
    revision: digest({
      state: snapshot.state.revision,
      descriptor,
      definition: snapshot.projection.definitionRef,
      owner: snapshot.projection.ownerRevision,
    }),
    observation: {
      kind: 'available',
      definition: snapshot.projection.definition,
      descriptor,
      source,
    },
  })
  return result.kind === 'invalid-input' ? missingOrganization() : result
}

function boundPermissionCommand(plan: Plan, record: OperationRecord) {
  const request = record.request
  if (request.owner !== 'internal.capture' || !('permission' in request.command))
    throw new Error('Wrong permission capture request')
  const { command } = request
  const current = plan.current
  const binding = plan.request.binding
  const expected = {
    binding,
    epoch: record.epoch,
    transactionDomain: record.sqlIdentity.transactionDomain,
    target: command.target,
    source: command.source,
    qualification: command.qualification,
  }
  const { evaluation: _evaluation, ...observed } = current
  if (!equal(observed, expected)) throw new Error('Permission current binding changed')
  if (
    command.permission.scope.tenantId !== binding.ref.scope.tenantRef ||
    command.permission.scope.deploymentId !== binding.ref.scope.deploymentId ||
    command.permission.scope.logicalServiceId !== binding.ref.scope.logicalServiceId ||
    command.permission.scope.targetId !== canonical(command.target)
  )
    throw new Error('Permission current binding changed')
  return command
}

export function applyPermissionCapture(port: ParticipantPort, plan: Plan) {
  const { binding, execution } = plan.request
  const candidate = submittedOperation(port, binding, execution)
  if (candidate.kind !== 'ready') return candidate
  const command = boundPermissionCommand(plan, candidate.record)
  const current = plan.current
  if (readGovernanceStanding(port, binding).kind !== 'held') return unavailable()
  const custody = readGovernanceSource(port, binding)
  if (custody.kind !== 'held' && custody.kind !== 'requested' && custody.kind !== 'not-required')
    return unavailable()
  const organization: PermissionSource =
    command.source !== null
      ? organizationSource(custody, current.evaluation)
      : current.evaluation.declaration.kind === 'available' &&
          current.evaluation.declaration.definition.settings === null
        ? { kind: 'absent', revision: current.evaluation.targetRevision }
        : command.permission.scope.organizationId === null
          ? { kind: 'absent', revision: 'not-applicable' }
          : missingOrganization()
  const result = PermissionCurrentBasisSchema.parse({
    kind: 'current',
    request: command.permission,
    evaluation: { ...current.evaluation, sources: { ...current.evaluation.sources, organization } },
  })
  if (evaluatePermission(result.evaluation).kind === 'invalid-input')
    throw new Error('Invalid permission current material')
  return finishOperation(
    port,
    binding,
    custody.kind === 'requested' ? 'aborted' : 'committed',
    result,
  )
}
