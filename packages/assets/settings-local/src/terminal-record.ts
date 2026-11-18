import type { OperationBinding } from './schema.ts'
import { operationKey } from './encoding.ts'

export function terminalKey(
  binding: Pick<OperationBinding, 'principalRef' | 'subject' | 'operationId'>,
) {
  return operationKey(binding.principalRef, binding.subject, binding.operationId)
}
