import type { ScheduleDomainError } from '@omne-harness/schedule-contract'

export function managementError(
  requestId: string,
  code: ScheduleDomainError['code'],
  message: string,
  retryable = false,
): ScheduleDomainError {
  return { code, message, retryable, requestId, details: {} }
}
