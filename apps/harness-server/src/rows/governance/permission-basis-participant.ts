import { z } from 'zod'
import { canonicalText } from '@omne-harness/authorization'
import { SESSION_PERMISSION_CURRENT_FACT } from '@omne-harness/session-storage-sql/participants'
import type { ParticipantModule } from '@omne-harness/sql-contract/worker'
import {
  PERMISSION_BASIS,
  permissionBasisFact,
  permissionBasisRequestSchema,
  permissionBasisSchema,
} from './permission-basis.ts'
import { permissionCurrentMaterial } from './permission-current-material.ts'
import { sessionPermissionSource } from './permission-session-current.ts'
import { targetSnapshotFact } from './target-snapshot.ts'
import { permissionTargetSnapshotSchema } from './unmapped-permission-snapshot.ts'

const unsupported = (reason: string) => ({ kind: 'unsupported' as const, basis: { reason } })

export default {
  ...PERMISSION_BASIS,
  execute(facts, port) {
    const request = permissionBasisRequestSchema.parse(facts['request'])
    const snapshot = permissionTargetSnapshotSchema.parse(port.requireFact(targetSnapshotFact))
    if (canonicalText(snapshot.binding) !== canonicalText(request.snapshot))
      return unsupported('permission-basis-binding')
    const session = port.requireFact(SESSION_PERMISSION_CURRENT_FACT)
    if (canonicalText(session) !== canonicalText(request.session))
      return unsupported('permission-basis-session')
    const evaluation = permissionCurrentMaterial(
      snapshot,
      request.permission,
      request.requiredConstraintIds,
    )
    if (evaluation === undefined) return unsupported('permission-basis-material')
    if (evaluation.declaration.kind !== 'available')
      return unsupported('permission-basis-declaration')
    const source = sessionPermissionSource(
      request.session,
      request.permission,
      evaluation.declaration.definition,
    )
    if (source === undefined) return unsupported('permission-basis-session')
    evaluation.sources.session = source
    evaluation.constraints = evaluation.constraints.map(
      missing => request.constraints.find(current => current.id === missing.id) ?? missing,
    )
    const basis = z
      .json()
      .parse(permissionBasisSchema.parse({ permission: request.permission, evaluation }))
    port.provideFact(permissionBasisFact, basis)
    return { kind: 'participated', response: basis }
  },
} satisfies ParticipantModule
