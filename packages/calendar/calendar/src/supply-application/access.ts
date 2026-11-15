import {
  calendarCallContextSchema,
  type CalendarCallContext,
  type CalendarDomainError,
  type CalendarId,
  type CalendarQueryResult,
} from '@omne-harness/calendar-contract'
import type { CalendarSupplyDependencies, CalendarSupplyAuthority } from './ports.ts'

export function supplyError<T>(
  context: CalendarCallContext,
  code: CalendarDomainError['code'],
  message: string,
): CalendarQueryResult<T> {
  return {
    kind: 'error',
    error: {
      code,
      message,
      retryable: code === 'provider_failure' || code === 'authority_unavailable',
      requestId: calendarCallContextSchema.safeParse(context).data?.requestId ?? '',
      details: {},
    },
  }
}
export async function authorize(
  deps: CalendarSupplyDependencies,
  context: CalendarCallContext,
  action: Parameters<CalendarSupplyAuthority['check']>[0]['action'],
  calendarId: CalendarId | null,
): Promise<readonly string[] | CalendarDomainError> {
  const parsed = calendarCallContextSchema.safeParse(context)
  if (!parsed.success)
    return {
      code: 'invalid_input',
      message: 'Invalid call context',
      retryable: false,
      requestId: '',
      details: {},
    }
  if (parsed.data.owner.kind !== 'system')
    return {
      code: 'forbidden',
      message: 'Supply requires an explicit system owner',
      retryable: false,
      requestId: context.requestId,
      details: {},
    }
  let result
  try {
    result = await deps.authority.check({ context: parsed.data, action, calendarId })
  } catch {
    return {
      code: 'authority_unavailable',
      message: 'Authority check unavailable',
      retryable: true,
      requestId: context.requestId,
      details: {},
    }
  }
  if (
    result.kind === 'allowed' &&
    result.authorityGuardRefs.length &&
    result.authorityGuardRefs.every(ref => ref.trim())
  )
    return result.authorityGuardRefs
  return {
    code: result.kind === 'unavailable' ? 'authority_unavailable' : 'forbidden',
    message: result.kind === 'allowed' ? 'Missing authority guards' : result.reason,
    retryable: result.kind === 'unavailable',
    requestId: context.requestId,
    details: {},
  }
}
export function authorityFailed(
  value: readonly string[] | CalendarDomainError,
): value is CalendarDomainError {
  return 'code' in value
}
