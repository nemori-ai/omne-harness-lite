import type { ParticipantPort } from '@omne-harness/sql-contract/worker'
import { boundOperation, finishOperation, conflict } from './operation.ts'
import { executionSchema, type OperationBinding, type Execution } from './operation-schema.ts'
import { adoptContributions } from './adoption.ts'
import type { AdoptionEvidence } from './adoption-schema.ts'
import { equal } from './encoding.ts'
import { readScope } from './scope.ts'
import { registerContribution, releaseContribution } from './contribution.ts'

function submittedOperation(
  port: ParticipantPort,
  binding: OperationBinding,
  execution: Execution,
) {
  const found = boundOperation(port, binding)
  if (found.kind !== 'found') return found
  const record = found.record
  if (record.state === 'committed' || record.state === 'aborted') return found
  if (record.state !== 'submitted' || !equal(record.execution, execution)) return conflict()
  const current = readScope(port, binding.ref.scope)
  if (current?.state !== 'open' || current.epoch !== record.epoch)
    return finishOperation(port, binding, 'aborted', { kind: 'conflict', reason: 'basis' })
  return { kind: 'ready' as const, record, current }
}

/** Authority in the saved execution must come from the trusted admission coordinator. */
export function applyOperation(
  port: ParticipantPort,
  binding: OperationBinding,
  raw: Execution,
  evidence?: AdoptionEvidence,
) {
  const candidate = submittedOperation(port, binding, executionSchema.parse(raw))
  if (candidate.kind !== 'ready') return candidate
  const { record, current } = candidate
  if (
    current.declarationRevision >= Number.MAX_SAFE_INTEGER - 1 ||
    current.adoptionRevision >= Number.MAX_SAFE_INTEGER - 1
  )
    return finishOperation(port, binding, 'aborted', { kind: 'limited', resource: 'revision' })
  const result =
    record.request.owner === 'adopt'
      ? adoptContributions(
          port,
          binding,
          record.epoch,
          record.sqlIdentity.transactionDomain,
          record.request.command,
          evidence,
        )
      : record.request.owner === 'contribute'
        ? registerContribution(port, binding, record.epoch, record.request.command)
        : releaseContribution(port, binding, record.epoch, record.request.command)
  const success =
    result.kind === 'adopted' ||
    result.kind === 'registered' ||
    result.kind === 'released' ||
    result.kind === 'already-released'
  return finishOperation(port, binding, success ? 'committed' : 'aborted', result)
}
