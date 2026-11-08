import { z } from 'zod'
import {
  SettingsSourceRequestSchema,
  SettingsSourceReceiptSchema,
} from '@omne-harness/settings-local/preparation'
import type { ParticipantPort, ReadPort } from '@omne-harness/sql-contract/worker'
import { boundOperation, conflict, operationParams } from './operation.ts'
import type { OperationBinding, OperationRecord } from './operation-schema.ts'
import { operationSourcePlan } from './operation-schema.ts'
import { canonical, equal } from './encoding.ts'

export const sourceCustodySchema = z.union([
  z.strictObject({ kind: z.literal('not-required') }),
  z.strictObject({ kind: z.literal('requested'), request: SettingsSourceRequestSchema }),
  SettingsSourceReceiptSchema,
])
export type SourceCustody = z.infer<typeof sourceCustodySchema>
export type SourceReceipt = z.infer<typeof SettingsSourceReceiptSchema>

function sourceRequest(binding: OperationBinding, record: OperationRecord) {
  const plan = operationSourcePlan(record.request)
  if (plan === null) return null
  return SettingsSourceRequestSchema.parse({
    source: plan.source,
    destination: {
      ownerRef: 'governance',
      identity: {
        domain: {
          scope: record.sqlIdentity.scope,
          transactionDomain: record.sqlIdentity.transactionDomain,
        },
        principalRef: binding.ref.principalRef,
        operation: {
          protocol:
            record.request.owner === 'internal.external-write'
              ? 'governance-external-write/1'
              : 'governance-permission-capture/1',
          binding,
        },
      },
      attemptId: binding.ref.operationId,
      commandDigest: binding.requestDigest,
      route: plan.route,
    },
  })
}
export function readGovernanceSource(port: ReadPort, binding: OperationBinding) {
  const found = boundOperation(port, binding)
  if (found.kind !== 'found') return found
  const request = sourceRequest(binding, found.record)
  if (request === null) return { kind: 'not-required' as const }
  const row = port.execute(
    'SELECT receipt_json FROM gc_permission_source WHERE scope_key=? AND command_owner=? AND principal_ref=? AND operation_id=? LIMIT 1',
    operationParams(binding.ref),
  ).rows[0]
  if (!row) throw new Error('Missing governance source custody')
  if (row[0] === null) return { kind: 'requested' as const, request }
  const receipt = SettingsSourceReceiptSchema.parse(JSON.parse(z.string().parse(row[0])))
  if (
    !equal(receipt.request, request) ||
    (receipt.kind === 'settled' && receipt.outcome !== found.record.state)
  )
    throw new Error('Corrupt governance source receipt')
  return receipt
}
function receiptReplay(
  previous: Exclude<SourceCustody, { kind: 'not-required' }>,
  receipt: SourceReceipt,
) {
  if (previous.kind === 'settled')
    return receipt.kind === 'held' || equal(previous, receipt) ? previous : conflict()
  if (receipt.kind === 'held' && previous.kind === 'held')
    return equal(previous, receipt) ? previous : conflict()
  return null
}
export function recordGovernanceSource(
  port: ParticipantPort,
  binding: OperationBinding,
  raw: SourceReceipt,
) {
  const receipt = SettingsSourceReceiptSchema.parse(raw)
  const previous = readGovernanceSource(port, binding)
  if (previous.kind === 'not-required') return conflict()
  if (!('request' in previous)) return previous
  if (!equal(previous.request, receipt.request)) return conflict()
  const replay = receiptReplay(previous, receipt)
  if (replay !== null) return replay
  if (receipt.kind === 'settled') {
    const found = boundOperation(port, binding)
    if (found.kind !== 'found') return found
    if (found.record.state !== receipt.outcome) return conflict()
  }
  port.execute(
    'UPDATE gc_permission_source SET receipt_json=? WHERE scope_key=? AND command_owner=? AND principal_ref=? AND operation_id=?',
    [canonical(receipt), ...operationParams(binding.ref)],
  )
  return receipt
}
