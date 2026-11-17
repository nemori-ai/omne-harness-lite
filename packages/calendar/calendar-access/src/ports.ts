import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import type {
  CalendarCalculator,
  CalendarCallContext,
  CalendarQueries,
} from '@omne-harness/calendar-contract'

/** The application decides whether this login acts for the tenant; the plugin cannot read a login. */
export interface CalendarPrincipals {
  actingFor(
    login: LoginIdentity,
    tenant: string,
  ): Promise<{ readonly ok: Principal } | { readonly refused: 'denied' | 'basis-unavailable' }>
  /** The call context of a person acting for the tenant: the owner is the tenant, the actor is human. */
  contextOf(principal: Principal, tenant: string, requestId: string): CalendarCallContext
}

/** Taken at each call; absent while the calendar row is not there. */
export type CalendarFaces = Readonly<{
  queries: Pick<CalendarQueries, 'list' | 'effective'>
  calculator: CalendarCalculator
}>
