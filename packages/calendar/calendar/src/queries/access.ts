import {
  calendarOwnerSchema,
  calendarIdSchema,
  timezoneSchema,
  type CalendarCallContext,
  type CalendarId,
  type CalendarOwner,
} from '@omne-harness/calendar-contract'
import type {
  CalendarAuthorityReader,
  CalendarEnvironmentReader,
  CalendarQueryAction,
} from './ports.ts'
import { QueryFailure } from './failure.ts'

export function sameOwner(left: CalendarOwner, right: CalendarOwner): boolean {
  if (left.kind === 'tenant' && right.kind === 'tenant')
    return left.tenantId === right.tenantId && left.ownerId === right.ownerId
  return (
    left.kind === 'system' &&
    right.kind === 'system' &&
    left.systemScopeRef === right.systemScopeRef
  )
}
export class QueryAccess {
  private readonly admitted = new Set<CalendarId | null>()
  private readonly authority: CalendarAuthorityReader
  readonly context: CalendarCallContext
  private readonly action: CalendarQueryAction
  constructor(
    authority: CalendarAuthorityReader,
    context: CalendarCallContext,
    action: CalendarQueryAction,
  ) {
    this.authority = authority
    this.context = context
    this.action = action
  }

  private async check(calendarId: CalendarId | null): Promise<boolean> {
    let result: Awaited<ReturnType<CalendarAuthorityReader['check']>>
    try {
      result = await this.authority.check({
        context: this.context,
        action: this.action,
        calendarId,
      })
    } catch {
      throw new QueryFailure('authority_unavailable')
    }
    switch (result?.kind) {
      case 'allowed':
        return true
      case 'denied':
        return false
      case 'unauthenticated':
        throw new QueryFailure('unauthenticated')
      default:
        throw new QueryFailure('authority_unavailable')
    }
  }
  async allow(calendarId: CalendarId | null): Promise<boolean> {
    const allowed = await this.check(calendarId)
    if (allowed) this.admitted.add(calendarId)
    return allowed
  }
  async require(calendarId: CalendarId | null): Promise<void> {
    if (!(await this.allow(calendarId)))
      throw new QueryFailure(calendarId === null ? 'forbidden' : 'not_found')
  }
  async recheck(): Promise<void> {
    for (const calendarId of this.admitted) {
      if (!(await this.check(calendarId)))
        throw new QueryFailure(calendarId === null ? 'forbidden' : 'not_found')
    }
  }
}
export async function readEnvironment(
  reader: CalendarEnvironmentReader,
  context: CalendarCallContext,
) {
  const result = await reader.read(context)
  if (result.kind === 'missing') throw new QueryFailure('missing_environment')
  if (result.kind !== 'found') throw new QueryFailure('provider_failure')
  const value = result.value
  const owner = calendarOwnerSchema.parse(value.owner)
  if (!sameOwner(owner, context.owner)) throw new QueryFailure('environment_incoherent')
  if (typeof value.revision !== 'string' || value.revision.length === 0)
    throw new QueryFailure('environment_incoherent')
  if (value.calendarId === null) throw new QueryFailure('missing_environment')
  const timezone = timezoneSchema.safeParse(value.timezone)
  if (!timezone.success) throw new QueryFailure('invalid_timezone')
  return {
    owner,
    revision: value.revision,
    timezone: timezone.data,
    calendarId: calendarIdSchema.parse(value.calendarId),
  }
}
