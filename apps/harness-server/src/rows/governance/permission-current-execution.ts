import { z } from 'zod'
import type { PermissionConstraint } from '@omne-harness/permissions'
import { canonicalText } from '@omne-harness/authorization'
import {
  GovernancePermissionCurrentSchema,
  governancePermissionCurrentFact,
} from '@omne-harness/governance-local'
import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import { targetSnapshotFact } from './target-snapshot.ts'
import {
  permissionTargetSnapshotSchema,
  type PermissionTargetSnapshot,
} from './unmapped-permission-snapshot.ts'
import { permissionCurrentMaterial } from './permission-current-material.ts'
import { permissionCurrentRequestSchema } from './permission-current.ts'
import type { SessionPermissionCurrent } from '@omne-harness/session-storage-sql/participants'
import { sessionPermissionSource } from './permission-session-current.ts'

function sameCapture(
  snapshot: PermissionTargetSnapshot,
  request: z.infer<typeof permissionCurrentRequestSchema>,
): boolean {
  return (
    canonicalText(snapshot.binding) === canonicalText(request.snapshot) &&
    snapshot.binding.captureId === request.binding.ref.operationId &&
    snapshot.binding.principalRef === request.binding.ref.principalRef &&
    snapshot.binding.epoch === request.epoch &&
    snapshot.binding.transactionDomain === request.transactionDomain &&
    canonicalText(snapshot.binding.scope) === canonicalText(request.binding.ref.scope) &&
    canonicalText(snapshot.binding.target) === canonicalText(request.target)
  )
}

export function executePermissionCurrent(
  facts: Parameters<ParticipantModule['execute']>[0],
  port: Parameters<ParticipantModule['execute']>[1],
  requiredConstraintIds: readonly string[],
  runtime?: Readonly<{
    session: SessionPermissionCurrent
    constraints: readonly PermissionConstraint[]
  }>,
): ReturnType<ParticipantModule['execute']> {
  const request = permissionCurrentRequestSchema.parse(facts['request'])
  const snapshot = permissionTargetSnapshotSchema.parse(port.requireFact(targetSnapshotFact))
  if (!sameCapture(snapshot, request))
    return { kind: 'unsupported', basis: { reason: 'permission-current-binding' } }
  const evaluation = permissionCurrentMaterial(snapshot, request.permission, requiredConstraintIds)
  if (evaluation === undefined)
    return { kind: 'unsupported', basis: { reason: 'permission-current-material' } }
  if (runtime !== undefined) {
    if (evaluation.declaration.kind !== 'available')
      return { kind: 'unsupported', basis: { reason: 'permission-current-declaration' } }
    const source = sessionPermissionSource(
      runtime.session,
      request.permission,
      evaluation.declaration.definition,
    )
    if (source === undefined)
      return { kind: 'unsupported', basis: { reason: 'permission-current-session' } }
    evaluation.sources.session = source
    evaluation.constraints = evaluation.constraints.map(
      missing => runtime.constraints.find(current => current.id === missing.id) ?? missing,
    )
  }
  const { permission: _permission, snapshot: _snapshot, ...bound } = request
  const result = z.json().parse(GovernancePermissionCurrentSchema.parse({ ...bound, evaluation }))
  port.provideFact(governancePermissionCurrentFact, result)
  return { kind: 'participated', response: result }
}
