import { stringCell } from './string-cell.ts'
import type { OperationRef } from '@omne-harness/human-intervention'
import type { ReadPort } from '@omne-harness/sql-contract/worker'
import { operationKey } from './encoding.ts'
import { terminalSchema } from './terminal-schema.ts'
export function readTerminal(port: ReadPort, operation: OperationRef) {
  const row = port.execute(
    'SELECT operation_key,input_digest,state FROM hi_terminals_v2 WHERE tenant_ref=? AND actor_ref=? AND operation_id=? LIMIT 1',
    [
      stringCell(operation.tenantRef),
      stringCell(operation.actorRef),
      stringCell(operation.operationId),
    ],
  ).rows[0]
  if (!row) return undefined
  if (row[0] !== operationKey(operation)) throw new TypeError('Terminal identity mismatch')
  return terminalSchema.parse({
    binding: { operationRef: operation, inputDigest: row[1] },
    state: row[2],
  })
}
