import type { OperationBinding } from './schema.ts'
import { operationKey } from './encoding.ts'

export function terminalKey(
  binding: Pick<OperationBinding, 'principalRef' | 'target' | 'operationId'>,
) {
  return operationKey(binding.principalRef, binding.target, binding.operationId)
}
