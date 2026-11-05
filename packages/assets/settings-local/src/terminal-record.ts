import type { ReadPort } from '@omne-harness/sql-contract/worker'
import type { OperationBinding } from './schema.ts'
import { operationKey } from './encoding.ts'
import { terminalSchema } from './terminal-schema.ts'

export function terminalKey(
  binding: Pick<OperationBinding, 'principalRef' | 'target' | 'operationId'>,
) {
  return operationKey(binding.principalRef, binding.target, binding.operationId)
}
export function readTerminal(port: ReadPort, binding: Parameters<typeof terminalKey>[0]) {
  const row = port.execute('SELECT record FROM st_terminals WHERE operation_key = ? LIMIT 1', [
    terminalKey(binding),
  ]).rows[0]
  if (!row) return undefined
  if (typeof row[0] !== 'string') throw new TypeError('Invalid Settings terminal')
  return terminalSchema.parse(JSON.parse(row[0]))
}
