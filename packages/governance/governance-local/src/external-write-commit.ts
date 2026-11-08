import type { ParticipantPort, ReadPort } from '@omne-harness/sql-contract/worker'
import { businessRequestSchema } from './operation-schema.ts'
import { boundOperation, finishOperation } from './operation.ts'
import { readScope } from './scope.ts'
import { requireApplyStage } from './sql-stage.ts'
import { readGovernanceStanding } from './standing-custody.ts'
import { readGovernanceSource } from './source-custody.ts'
import { externalWriteExecutionSchema } from './external-write-stage.ts'
import {
  GovernanceExternalWriteBasisSchema,
  GovernanceExternalWriteResultSchema,
  type GovernanceExternalWriteBasis,
  type GovernanceExternalWriteResult,
} from './external-write-protocol.ts'
import { digest, equal } from './encoding.ts'

/** Reads only Governance-owned facts; it does not interpret the external owner's command. */
export function externalWriteBasis(port: ReadPort, raw: unknown): GovernanceExternalWriteBasis {
  const request = businessRequestSchema.parse(raw)
  const found = boundOperation(port, request.binding)
  if (found.kind !== 'found' || found.record.request.owner !== 'internal.external-write')
    throw new Error('External write original operation missing')
  const { record } = found
  const scope = readScope(port, request.binding.ref.scope)
  if (record.state !== 'submitted' || scope?.state !== 'open' || scope.epoch !== record.epoch)
    throw new Error('External write original is not executable')
  requireApplyStage(port, request.binding, record.execution, request.execution)
  const standing = readGovernanceStanding(port, request.binding)
  const source = readGovernanceSource(port, request.binding)
  if (standing.kind !== 'held' || (source.kind !== 'held' && source.kind !== 'not-required'))
    throw new Error('External write requires retained Identity and source')
  return GovernanceExternalWriteBasisSchema.parse({
    request,
    epoch: record.epoch,
    transactionDomain: record.sqlIdentity.transactionDomain,
    command: record.request.command,
    source: source.kind === 'held' ? source.snapshot : null,
  })
}

export function externalWriteResult(
  basis: GovernanceExternalWriteBasis,
  raw: unknown,
): GovernanceExternalWriteResult {
  const result = GovernanceExternalWriteResultSchema.parse(raw)
  const execution = basis.request.execution
  const authority = externalWriteExecutionSchema.parse(execution.authority)
  if (
    !equal(result.binding, basis.request.binding) ||
    result.executionDigest !== digest(execution) ||
    result.writer !== authority.writer
  )
    throw new Error('External write result binding mismatch')
  return result
}

export function finishExternalWrite(port: ParticipantPort, request: unknown, rawResult: unknown) {
  const basis = externalWriteBasis(port, request)
  const result = externalWriteResult(basis, rawResult)
  return finishOperation(port, basis.request.binding, result.outcome, {
    kind: 'external-write-result',
    ...result,
  })
}
