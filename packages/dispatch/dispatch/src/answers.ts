import type { CallContext, Dispatch, TenantId } from '@omne-harness/dispatch-contract'
import { createAdvance } from './advance.ts'
import {
  ask,
  type AgentDefinitions,
  type AuthorityAction,
  type Clock,
  type ContextCopies,
  type DispatchAuthority,
  type ReconcileHints,
} from './ports.ts'
import type { DispatchSessions } from './session-port.ts'
import type { DispatchStore } from './store.ts'
import type { ReportWaits } from './wait-port.ts'

export type DispatchLimits = Readonly<{
  /** How many dispatches of one session may be accepted or started at the same time. */
  maxOpen: number
}>

export type DispatchingDependencies = Readonly<{
  authority: DispatchAuthority
  store: DispatchStore
  sessions: DispatchSessions
  waits: ReportWaits
  copies: ContextCopies
  definitions: AgentDefinitions
  clock: Clock
  limits: DispatchLimits
  /** Called after a dispatch changed. Only a wake-up: the registry holds what is to be done. */
  hints?: ReconcileHints
}>

export const UNAVAILABLE = { kind: 'basis-unavailable' } as const
export const UNKNOWN = { kind: 'unknown' } as const
export const INVALID = { kind: 'refused', reason: 'invalid-request' } as const
export const DENIED = { kind: 'refused', reason: 'not-permitted' } as const
export const done = <T>(value: T, recalled = false) => ({ kind: 'done', value, recalled }) as const

export type Blocked = typeof UNAVAILABLE | typeof DENIED

/** What every operation of the registry shares: its ports, the permission asked each time, and the steps taken after a change. */
export function createEnvironment(deps: DispatchingDependencies) {
  const advance = createAdvance(deps)
  return {
    ...deps,
    advance,
    async permit(ctx: CallContext, action: AuthorityAction): Promise<Blocked | null> {
      const answer = await ask(deps.authority, ctx, action)
      if (answer === 'unavailable') return UNAVAILABLE
      return answer === 'permitted' ? null : DENIED
    },
    /** The dispatch as the registry holds it after its steps were taken. */
    async afterSteps(tenant: TenantId, known: Dispatch): Promise<Dispatch> {
      await advance(tenant, known.id).catch(() => undefined)
      deps.hints?.wake(tenant)
      const read = await deps.store.dispatch(tenant, known.id)
      return read.kind === 'read' && read.value !== null ? read.value : known
    },
  }
}

export type Environment = ReturnType<typeof createEnvironment>
