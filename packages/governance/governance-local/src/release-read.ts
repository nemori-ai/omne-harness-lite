import { z } from 'zod'
import {
  GovernanceScopeSchema,
  GovernanceIdSchema,
  GovernanceOperationRefSchema,
} from '@omne-harness/governance-contract'
import type { ReadPort, ReadHandlerModule } from '@omne-harness/sql-contract/worker'
import { equal, json, operationIdentity, scopeKey } from './encoding.ts'
import { recordSchema } from './operation-schema.ts'

export const RELEASE_HANDLER = {
  handler: 'governance.releasable',
  protocol: 'governance-releasable-read/1',
}
export const RELEASE_PAGE = 64
export const releasedKeySchema = z.strictObject({
  owner: GovernanceOperationRefSchema.shape.owner,
  principalRef: GovernanceIdSchema,
  operationId: GovernanceIdSchema,
})
export const releasePageRequestSchema = z.strictObject({
  scope: GovernanceScopeSchema,
  after: releasedKeySchema.nullable(),
})
export const releasePageSchema = z.strictObject({
  kind: z.literal('page'),
  items: z
    .array(
      z.strictObject({
        key: releasedKeySchema,
        sqlIdentity: recordSchema.shape.sqlIdentity,
      }),
    )
    .max(RELEASE_PAGE),
  next: releasedKeySchema.nullable(),
})
const rowSchema = z.tuple([
  releasedKeySchema.shape.owner,
  GovernanceIdSchema,
  GovernanceIdSchema,
  z.string(),
])
const releasableSql = `SELECT command_owner,principal_ref,operation_id,sql_identity_json
  FROM gc_operation
  WHERE scope_key=?
    AND command_owner IN ('contribute','withdraw','adopt')
    AND state IN ('committed','aborted')
    AND (held_json IS NULL OR json_extract(held_json, '$.kind') IS 'settled')
    AND (command_owner,principal_ref,operation_id) > (?,?,?)
  ORDER BY command_owner,principal_ref,operation_id LIMIT ?`

export function readReleasePage(port: ReadPort, raw: z.infer<typeof releasePageRequestSchema>) {
  const { scope, after } = releasePageRequestSchema.parse(raw)
  const rows = port
    .execute(releasableSql, [
      scopeKey(scope),
      after?.owner ?? '',
      after?.principalRef ?? '',
      after?.operationId ?? '',
      RELEASE_PAGE + 1,
    ])
    .rows.map(row => rowSchema.parse(row))
  const items = rows.slice(0, RELEASE_PAGE).map(([owner, principalRef, operationId, stored]) => {
    const key = { owner, principalRef, operationId }
    const sqlIdentity = recordSchema.shape.sqlIdentity.parse(JSON.parse(stored))
    const expected = operationIdentity(sqlIdentity.transactionDomain, { scope, ...key })
    if (!equal(sqlIdentity, expected)) throw new Error('Corrupt governance operation identity')
    return { key, sqlIdentity }
  })
  return {
    kind: 'page' as const,
    items,
    next: rows.length > RELEASE_PAGE ? (items.at(-1)?.key ?? null) : null,
  }
}
export default {
  ...RELEASE_HANDLER,
  read(input, port) {
    return {
      kind: 'read',
      output: json(readReleasePage(port, releasePageRequestSchema.parse(input))),
    }
  },
} satisfies ReadHandlerModule
