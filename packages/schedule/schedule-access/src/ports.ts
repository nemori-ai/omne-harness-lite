import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import type {
  ScheduleCallContext,
  ScheduleCommands,
  ScheduleInstant,
  ScheduleJobs,
  ScheduleQueries,
} from '@omne-harness/schedule-contract'

/** The application decides whether this login acts for the tenant; the plugin cannot read a login. */
export interface SchedulePrincipals {
  actingFor(
    login: LoginIdentity,
    tenant: string,
  ): Promise<{ readonly ok: Principal } | { readonly refused: 'denied' | 'basis-unavailable' }>
  /** The call context of a person acting for the tenant: the owner is the tenant, the actor is human. */
  contextOf(principal: Principal, tenant: string, requestId: string): ScheduleCallContext
}

/** Told when a tenant's Jobs or history may have changed, and when no more will be told. */
export type ScheduleJobChanges = Readonly<{
  watch(tenant: string, listener: Readonly<{ changed(): void; closed(): void }>): () => void
}>

/** Taken at each call; absent while the schedule row is not there. */
export type ScheduleFaces = Readonly<{
  commands: ScheduleCommands
  queries: ScheduleQueries
  jobs: ScheduleJobs & ScheduleJobChanges
}>

export type ScheduleAccessClock = Readonly<{ now(): ScheduleInstant }>
