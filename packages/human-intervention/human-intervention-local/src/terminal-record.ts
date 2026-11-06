import type { OperationRef } from '@omne-harness/human-intervention'
import type { ReadPort } from '@omne-harness/sql-contract/worker'
import { operationKey } from './encoding.ts'
import { terminalSchema } from './terminal-schema.ts'

export function readTerminal(port: ReadPort, operation: OperationRef) {
  const row = port.execute('SELECT record FROM hi_terminals WHERE operation_key = ? LIMIT 1', [
    operationKey(operation),
  ]).rows[0]
  if (!row) return undefined
  if (typeof row[0] !== 'string') throw new TypeError('Invalid HITL terminal record')
  return terminalSchema.parse(JSON.parse(row[0]))
}
