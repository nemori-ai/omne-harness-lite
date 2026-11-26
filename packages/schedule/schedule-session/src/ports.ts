import type { GoalRecord, GoalRefusal, Outcome } from '@omne-harness/goal-contract'
import type { ScheduleAgentSessionPlan } from '@omne-harness/schedule-contract'

type At = Readonly<{ tenant: string; session: string }>
export type Read<T> = Readonly<{ kind: 'read'; value: T }> | Readonly<{ kind: 'unavailable' }>

type NewSession = Extract<ScheduleAgentSessionPlan, { mode: 'new' }>
/** What a Job fixes of the session it creates. The assembly adds what the definition and the release fix. */
export type CreationOfJob = Readonly<{ agent: string; modes: NewSession['modes'] }>

/** `refused`: the session was not created. `recoverable`: asking again later may create it. */
export type Created =
  | Readonly<{ kind: 'created' }>
  | Readonly<{ kind: 'refused'; recoverable: boolean; reason: string }>
  | Readonly<{ kind: 'unknown' }>

/** Where the work of a session stands. `quiet`: no run going, no input waiting, no call in the background. `usable`: it still takes work. */
export type SessionStanding = Readonly<{
  usable: boolean
  quiet: boolean
  run: string | null
  adopted: Readonly<{ name: string; version: string }>
}>

/** The calls of Session a Job makes, as the system principal of schedule and only on the sessions it created. */
export type SessionCalls = Readonly<{
  definition(input: Readonly<{ tenant: string; agent: string }>): Promise<Read<boolean>>
  create(input: At & Readonly<{ operation: string; creation: CreationOfJob }>): Promise<Created>
  standing(input: At): Promise<Read<SessionStanding | null>>
  cancelRun(
    input: At & Readonly<{ operation: string; run: string; urgency: 'graceful' | 'forced' }>,
  ): Promise<'requested' | 'unknown'>
  /** Whether the run going now was opened by the goal's own start reminder of this request; null when no run is going. */
  opened(input: At & Readonly<{ request: string }>): Promise<Read<boolean | null>>
}>

type Goal<T> = Promise<Outcome<T, GoalRefusal>>
/** The calls of Goal a Job makes on the session it runs in: the Job is the owner of the goal it sets. */
export type GoalCalls = Readonly<{
  read(at: At): Goal<GoalRecord | null>
  set(at: At & Readonly<{ operation: string; by: string; draft: unknown }>): Goal<GoalRecord>
  command(at: At & Readonly<{ command: 'cancel' | 'abort' }>): Goal<GoalRecord | null>
}>

export type ExecutorCalls = Readonly<{ sessions: SessionCalls; goals: GoalCalls }>
