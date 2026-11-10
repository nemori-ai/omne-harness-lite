import { z } from 'zod'
import {
  GovernanceScopeSchema,
  GovernanceIdSchema,
  GovernanceDigestSchema,
} from '@omne-harness/governance-contract'
import type { ReadPort, ReadHandlerModule } from '@omne-harness/sql-contract/worker'
import { equal, scopeKey, json } from './encoding.ts'
import { readScope } from './scope.ts'
import { operationRefSchema } from './operation-schema.ts'

export const RECOVERY_HANDLER = {
  handler: 'governance.recovery',
  protocol: 'governance-recovery-read/1',
}
const recoveryOwnerSchema = z.enum([
  ...operationRefSchema.shape.owner.options,
  'internal.bootstrap',
  'internal.close',
])
const keySchema = z.strictObject({
  scope: GovernanceScopeSchema,
  owner: recoveryOwnerSchema,
  principalRef: GovernanceIdSchema,
  operationId: GovernanceIdSchema,
})
export const recoveryPageRequestSchema = z.strictObject({
  scope: GovernanceScopeSchema,
  after: keySchema.nullable(),
  limit: z.number().int().min(1).max(64),
})
export type RecoveryPageRequest = z.infer<typeof recoveryPageRequestSchema>
export const recoveryPageSchema = z.strictObject({
  kind: z.literal('page'),
  currentEpoch: GovernanceIdSchema,
  items: z
    .array(
      z.strictObject({
        key: keySchema,
        requestDigest: GovernanceDigestSchema,
        acceptedEpoch: GovernanceIdSchema,
      }),
    )
    .max(64),
  next: keySchema.nullable(),
})
const rowSchema = z.tuple([
  recoveryOwnerSchema,
  GovernanceIdSchema,
  GovernanceIdSchema,
  GovernanceDigestSchema,
  GovernanceIdSchema,
])
export const recoveryCandidatesSql = `SELECT command_owner,principal_ref,operation_id,request_digest,accepted_epoch
  FROM gc_operation INDEXED BY gc_operation_recovery
  WHERE scope_key=?
    AND (state IN ('accepted','submitted')
      OR (held_json IS NOT NULL AND json_extract(held_json, '$.kind') IS NOT 'settled'))
    AND (command_owner,principal_ref,operation_id) > (?,?,?)
  ORDER BY command_owner,principal_ref,operation_id LIMIT ?`
export const sourceRecoveryCandidatesSql = `SELECT source.command_owner,source.principal_ref,source.operation_id,original.request_digest,original.accepted_epoch
  FROM gc_permission_source AS source INDEXED BY gc_permission_source_pending
  JOIN gc_operation AS original USING (scope_key,command_owner,principal_ref,operation_id)
  WHERE source.scope_key=?
    AND (source.receipt_json IS NULL OR json_extract(source.receipt_json, '$.kind') IS NOT 'settled')
    AND (source.command_owner,source.principal_ref,source.operation_id) > (?,?,?)
  ORDER BY source.command_owner,source.principal_ref,source.operation_id LIMIT ?`

export function readRecoveryPage(port: ReadPort, raw: RecoveryPageRequest) {
  const input = recoveryPageRequestSchema.parse(raw)
  if (input.after && !equal(input.after.scope, input.scope))
    return { kind: 'conflict' as const, reason: 'basis' as const }
  const current = readScope(port, input.scope)
  if (!current) return { kind: 'absent' as const }
  const { after } = input
  const params = [
    scopeKey(input.scope),
    after?.owner ?? '',
    after?.principalRef ?? '',
    after?.operationId ?? '',
    input.limit + 1,
  ]
  const candidates = [
    ...port.execute(recoveryCandidatesSql, params).rows,
    ...port.execute(sourceRecoveryCandidatesSql, params).rows,
  ].map(row => rowSchema.parse(row))
  const unique = new Map(candidates.map(row => [JSON.stringify(row.slice(0, 3)), row]))
  const rows = [...unique.values()].sort((left, right) => {
    for (const column of [0, 1, 2] as const) {
      const order = Buffer.compare(Buffer.from(left[column]), Buffer.from(right[column]))
      if (order !== 0) return order
    }
    return 0
  })
  const items = rows.slice(0, input.limit).map(row => {
    const [owner, principalRef, operationId, requestDigest, acceptedEpoch] = row
    return {
      key: { scope: input.scope, owner, principalRef, operationId },
      requestDigest,
      acceptedEpoch,
    }
  })
  return {
    kind: 'page' as const,
    currentEpoch: current.epoch,
    items,
    next: rows.length > input.limit ? (items.at(-1)?.key ?? null) : null,
  }
}
export default {
  ...RECOVERY_HANDLER,
  read(input, port) {
    return {
      kind: 'read',
      output: json(readRecoveryPage(port, recoveryPageRequestSchema.parse(input))),
    }
  },
} satisfies ReadHandlerModule
