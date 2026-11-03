import type { CalendarDomainError } from '@omne-harness/calendar-contract'
import type { CalendarReadResult } from '../persistence.ts'

export class QueryFailure extends Error {
  readonly code: CalendarDomainError['code']
  readonly details: CalendarDomainError['details']
  constructor(code: CalendarDomainError['code'], details: CalendarDomainError['details'] = {}) {
    super(code)
    this.code = code
    this.details = details
  }
}
export function readValue<T>(result: CalendarReadResult<T>): T {
  if (result.kind !== 'ok') throw new QueryFailure('provider_failure')
  return result.value
}
export function domainError(error: unknown, requestId: string): CalendarDomainError {
  const failure = error instanceof QueryFailure ? error : new QueryFailure('provider_failure')
  return {
    code: failure.code,
    message: failure.code,
    requestId,
    retryable: failure.code === 'provider_failure' || failure.code === 'authority_unavailable',
    details: failure.details,
  }
}
