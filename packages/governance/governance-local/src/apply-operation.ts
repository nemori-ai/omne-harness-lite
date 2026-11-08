import type { ParticipantPort } from '@omne-harness/sql-contract/worker'
import { boundOperation, finishOperation, conflict } from './operation.ts'
import {
  executionSchema,
  type OperationBinding,
  type Execution,
  type OperationRecord,
} from './operation-schema.ts'
import { adoptContributions } from './adoption.ts'
import type { AdoptionEvidence } from './adoption-schema.ts'
import { equal } from './encoding.ts'
import { readScope } from './scope.ts'
import { registerContribution, releaseContribution } from './contribution.ts'
import { PUBLICATION_REVISION_LIMIT } from './revision-budget.ts'

export function submittedOperation(
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
    record.request.owner !== 'withdraw' &&
    (current.declarationRevision >= PUBLICATION_REVISION_LIMIT ||
      current.adoptionRevision >= PUBLICATION_REVISION_LIMIT)
  )
    return finishOperation(port, binding, 'aborted', { kind: 'limited', resource: 'revision' })
  const result = evaluateOperation(port, binding, record, evidence)
  const success =
    result.kind === 'adopted' ||
    result.kind === 'registered' ||
    result.kind === 'released' ||
    result.kind === 'already-released'
  return finishOperation(port, binding, success ? 'committed' : 'aborted', result)
}

function evaluateOperation(
  port: ParticipantPort,
  binding: OperationBinding,
  record: OperationRecord,
  evidence: AdoptionEvidence | undefined,
) {
  switch (record.request.owner) {
    case 'adopt':
      return adoptContributions(
        port,
        binding,
        record.epoch,
        record.sqlIdentity.transactionDomain,
        record.request.command,
        evidence,
      )
    case 'contribute':
      return registerContribution(port, binding, record.epoch, record.request.command)
    case 'withdraw':
      return releaseContribution(port, binding, record.epoch, record.request.command)
    case 'internal.external-write':
      throw new Error('External write requires its own planner')
    case 'internal.capture':
      throw new Error('Capture requires its own planner')
  }
}
