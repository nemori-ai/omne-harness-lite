import type { OperationRef } from './operation-schema.ts'
import type { ParticipantPort, ReadPort } from '@omne-harness/sql-contract/worker'
import { canonical, digest, equal, operationIdentity, scopeKey } from './encoding.ts'
import {
  acceptSchema,
  bindingSchema,
  executionSchema,
  recordSchema,
  requestRef,
  operationSourcePlan,
  type AcceptOperation,
  type OperationBinding,
  type Execution,
  type OperationRecord,
} from './operation-schema.ts'
import { readScope } from './scope.ts'
export const conflict = () => ({ kind: 'conflict' as const, reason: 'operation' as const })
export const operationParams = (ref: OperationRef) => [
  scopeKey(ref.scope),
  ref.owner,
  ref.principalRef,
  ref.operationId,
]
export function readOperation(port: ReadPort, ref: OperationRef) {
  const row = port.execute(
    'SELECT request_json,request_digest,accepted_epoch,sql_identity_json,state,execution_json,result_json FROM gc_operation WHERE scope_key=? AND command_owner=? AND principal_ref=? AND operation_id=? LIMIT 1',
    operationParams(ref),
  ).rows[0]
  if (!row) return { kind: 'absent' as const }
  const record = recordSchema.parse({
    request: JSON.parse(String(row[0])),
    requestDigest: row[1],
    epoch: row[2],
    sqlIdentity: JSON.parse(String(row[3])),
    state: row[4],
    execution: row[5] === null ? null : JSON.parse(String(row[5])),
    result: row[6] === null ? null : JSON.parse(String(row[6])),
  })
  if (
    !equal(requestRef(ref.principalRef, record.request), ref) ||
    digest(record.request) !== record.requestDigest ||
    !equal(operationIdentity(record.sqlIdentity.transactionDomain, ref), record.sqlIdentity)
  )
    throw new Error('Corrupt governance operation binding')
  return { kind: 'found' as const, record }
}
export function boundOperation(port: ReadPort, raw: OperationBinding) {
  const binding = bindingSchema.parse(raw)
  const found = readOperation(port, binding.ref)
  if (found.kind === 'absent') return found
  return found.record.requestDigest === binding.requestDigest ? found : conflict()
}
export function acceptOperation(port: ParticipantPort, raw: AcceptOperation) {
  if (Buffer.byteLength(canonical(raw)) > 1024 * 1024)
    return { kind: 'limited' as const, resource: 'command-bytes' }
  const input = acceptSchema.parse(raw)
  const ref = requestRef(input.principalRef, input.request)
  const requestDigest = digest(input.request)
  const previous = boundOperation(port, { ref, requestDigest })
  if (previous.kind !== 'absent')
    return previous.kind === 'found' &&
      previous.record.sqlIdentity.transactionDomain !== input.transactionDomain
      ? conflict()
      : previous
  const scope = readScope(port, ref.scope)
  if (scope?.state !== 'open' || scope.epoch !== input.epoch)
    return { kind: 'conflict' as const, reason: 'basis' as const }
  const count = port.execute(
    "SELECT operation_id FROM gc_operation INDEXED BY gc_operation_pending WHERE scope_key=? AND state IN ('accepted','submitted') LIMIT 33",
    [scopeKey(ref.scope)],
  ).rows.length
  if (count >= 32) return { kind: 'limited' as const, resource: 'pending-operations' }
  const sqlIdentity = operationIdentity(input.transactionDomain, ref)
  port.execute(
    "INSERT INTO gc_operation (scope_key,command_owner,principal_ref,operation_id,request_digest,request_json,accepted_epoch,sql_identity_json,state) VALUES (?,?,?,?,?,?,?,?,'accepted')",
    [
      ...operationParams(ref),
      requestDigest,
      canonical(input.request),
      input.epoch,
      canonical(sqlIdentity),
    ],
  )
  if (operationSourcePlan(input.request) !== null)
    port.execute(
      'INSERT INTO gc_permission_source (scope_key,command_owner,principal_ref,operation_id,receipt_json) VALUES (?,?,?,?,NULL)',
      operationParams(ref),
    )
  return readOperation(port, ref)
}
export function submitOperation(port: ParticipantPort, binding: OperationBinding, raw: Execution) {
  if (Buffer.byteLength(canonical(raw)) > 1024 * 1024)
    return { kind: 'limited' as const, resource: 'execution-bytes' }
  const execution = executionSchema.parse(raw)
  const found = boundOperation(port, binding)
  if (found.kind !== 'found') return found
  if (found.record.state !== 'accepted')
    return found.record.execution === null || equal(found.record.execution, execution)
      ? found
      : conflict()
  port.execute(
    "UPDATE gc_operation SET state='submitted',execution_json=? WHERE scope_key=? AND command_owner=? AND principal_ref=? AND operation_id=? AND state='accepted'",
    [canonical(execution), ...operationParams(binding.ref)],
  )
  return readOperation(port, binding.ref)
}
export function finishOperation(
  port: ParticipantPort,
  binding: OperationBinding,
  state: 'committed' | 'aborted',
  result: NonNullable<OperationRecord['result']>,
) {
  const previous = boundOperation(port, binding)
  if (
    previous.kind !== 'found' ||
    previous.record.state === 'committed' ||
    previous.record.state === 'aborted'
  )
    return previous
  if (state === 'committed' && previous.record.state !== 'submitted') return conflict()
  port.execute(
    "UPDATE gc_operation SET state=?,result_json=? WHERE scope_key=? AND command_owner=? AND principal_ref=? AND operation_id=? AND state IN ('accepted','submitted')",
    [state, canonical(result), ...operationParams(binding.ref)],
  )
  return readOperation(port, binding.ref)
}
export function sealOperation(port: ParticipantPort, binding: OperationBinding) {
  const found = boundOperation(port, binding)
  if (
    found.kind !== 'found' ||
    found.record.state === 'committed' ||
    found.record.state === 'aborted'
  )
    return found
  return finishOperation(port, binding, 'aborted', { kind: 'sealed' })
}
