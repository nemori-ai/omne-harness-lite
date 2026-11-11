import { inputDigestV2 } from '@omne-harness/sql-contract'
import type { ReadPort, ParticipantPort } from '@omne-harness/sql-contract/worker'
import type { OperationBinding, Execution } from './operation-schema.ts'
import { boundOperation, conflict, operationParams } from './operation.ts'
import { canonical, equal } from './encoding.ts'
import { validateStageEnvelope } from './sql-stage-binding.ts'
import {
  persistStageSchema,
  sqlEnvelopeSchema,
  type PersistStage,
  type SqlStage,
} from './sql-stage-schema.ts'

function parseEnvelope(raw: unknown) {
  if (Buffer.byteLength(canonical(raw)) > 4 * 1024 * 1024)
    throw new Error('Governance SQL envelope exceeds budget')
  const envelope = sqlEnvelopeSchema.parse(raw)
  if (!equal(raw, envelope)) throw new Error('Noncanonical governance SQL envelope')
  return envelope
}
export function readSqlStage(port: ReadPort, binding: OperationBinding, stage: SqlStage) {
  const found = boundOperation(port, binding)
  if (found.kind !== 'found') return found
  const row = port.execute(
    'SELECT envelope_json,input_digest FROM gc_sql_stage WHERE scope_key=? AND command_owner=? AND principal_ref=? AND operation_id=? AND stage=? LIMIT 1',
    [...operationParams(binding.ref), stage],
  ).rows[0]
  if (!row) return { kind: 'unplanned' as const }
  const envelope = parseEnvelope(JSON.parse(String(row[0])))
  const inputDigest = inputDigestV2(envelope)
  if (inputDigest !== row[1]) throw new Error('Corrupt governance SQL envelope digest')
  validateStageEnvelope(port, binding, found.record, stage, envelope)
  return { kind: 'stored' as const, stage, envelope, inputDigest }
}
export function persistSqlStage(port: ParticipantPort, raw: PersistStage) {
  const envelope = parseEnvelope(raw.envelope)
  const { binding, stage } = persistStageSchema.parse(raw)
  const found = boundOperation(port, binding)
  if (found.kind !== 'found') return found
  const previous = readSqlStage(port, binding, stage)
  if (previous.kind === 'stored') return equal(previous.envelope, envelope) ? previous : conflict()
  if (stage === 'apply' && (found.record.state === 'committed' || found.record.state === 'aborted'))
    return found
  validateStageEnvelope(port, binding, found.record, stage, envelope)
  port.execute(
    'INSERT INTO gc_sql_stage (scope_key,command_owner,principal_ref,operation_id,stage,envelope_json,input_digest) VALUES (?,?,?,?,?,?,?)',
    [...operationParams(binding.ref), stage, canonical(envelope), inputDigestV2(envelope)],
  )
  return readSqlStage(port, binding, stage)
}

export function requireApplyStage(
  port: ReadPort,
  binding: OperationBinding,
  original: Execution | null,
  execution: Execution,
) {
  const saved = readSqlStage(port, binding, 'apply')
  if (saved.kind !== 'stored' || !equal(original, execution))
    throw new Error('Governance apply requires its saved SQL envelope')
}
