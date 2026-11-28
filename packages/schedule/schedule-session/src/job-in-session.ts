import { validateDraft, type GoalRecord } from '@omne-harness/goal-contract'
import type {
  ScheduleExecutionAccount,
  ScheduleExecutorAcceptance,
  ScheduleExecutorInspection,
  ScheduleExecutorStop,
  ScheduleExecutorUnknown,
  ScheduleOwner,
  ScheduleWork,
} from '@omne-harness/schedule-contract'
import type { JobIdentities } from './identities.ts'
import { endOf, issuesText } from './outcome.ts'
import type { ExecutorCalls, JobRules, SessionStanding } from './ports.ts'

export type Facts = Readonly<{ standing: SessionStanding; goal: GoalRecord | null }>
type AgentWork = Extract<ScheduleWork, { kind: 'agent' }>

const CONFIRMED = { kind: 'confirmed' } as const
const UNAVAILABLE = { kind: 'unavailable' } as const
const NO_ROUND = { after: null, run: null } as const
const UNKNOWN = { kind: 'unknown' } as const
const UNREADABLE = 'the session or its goal cannot be read now'
export const unknown = (reason: string): ScheduleExecutorUnknown => ({ kind: 'unknown', reason })
export const never = (reason: string) =>
  ({ kind: 'notStarted', recoverable: false, reason }) as const
export const later = (reason: string) =>
  ({ kind: 'notStarted', recoverable: true, reason }) as const
export const at = (ids: JobIdentities) => ({ tenant: ids.tenant, session: ids.session })
export const mine = (goal: GoalRecord, ids: JobIdentities) =>
  goal.history[0]?.operation === ids.goal

/** Why no session carries out this agent work as written, whichever session it is; null when one can. */
export function instructionRefusal(work: AgentWork, rules?: JobRules): string | null {
  if (work.materials.length > 0) return 'materials are not carried into a session yet'
  const checked = validateDraft(work.instruction, { attendance: 'unattended', ...rules })
  return checked.kind === 'valid' ? null : `instruction: ${issuesText(checked.issues)}`
}

type Refusal = (work: ScheduleWork, rules?: JobRules) => string | null
/** Judges work before it is saved, for the tenant it would be saved under: as written, and by what the settings of that tenant let the goal of a job write. Settings that cannot be read leave it unknown, never accepted. */
export function acceptanceOf(calls: ExecutorCalls, refusalOf: Refusal) {
  return async (work: ScheduleWork, owner: ScheduleOwner): Promise<ScheduleExecutorAcceptance> => {
    const plain = refusalOf(work)
    if (plain !== null) return { kind: 'refused', reason: plain }
    if (owner.kind !== 'tenant') return { kind: 'accepted' }
    const rules = await calls.goals.rules({ tenant: owner.tenantId }).catch(() => UNAVAILABLE)
    if (rules.kind !== 'read') return unknown('the settings of goals cannot be read now')
    const reason = refusalOf(work, rules.value)
    return reason === null ? { kind: 'accepted' } : { kind: 'refused', reason }
  }
}

/** What a Job reads and does in the session it runs in, the same whichever way the session came to be. */
export function jobInSession({ sessions, goals }: ExecutorCalls) {
  async function factsOf(ids: JobIdentities): Promise<Facts | 'unknown' | 'no-session'> {
    const standing = await sessions.standing(at(ids)).catch(() => UNAVAILABLE)
    if (standing.kind !== 'read') return 'unknown'
    if (standing.value === null) return 'no-session'
    const goal = await goals.read(at(ids)).catch(() => UNKNOWN)
    return goal.kind === 'done' ? { standing: standing.value, goal: goal.value } : 'unknown'
  }

  async function aborted(ids: JobIdentities): Promise<ScheduleExecutorInspection> {
    const answer = await goals.command({ ...at(ids), command: 'abort' }).catch(() => UNKNOWN)
    const state = answer.kind === 'done' ? answer.value?.state : undefined
    return state?.status === 'settled'
      ? endOf(state.outcome)
      : unknown('whether the goal was aborted is not known')
  }

  return {
    factsOf,

    /** `begun`: an earlier start answered that the goal of the Job was set, so a session without it has lost it. */
    async inspect(ids: JobIdentities, begun: boolean): Promise<ScheduleExecutorInspection> {
      const facts = await factsOf(ids)
      if (facts === 'unknown') return unknown(UNREADABLE)
      if (facts === 'no-session') return later('the session of the Job is not there')
      const { standing, goal } = facts
      if (goal === null || !mine(goal, ids))
        return begun
          ? unknown('the session no longer carries the goal this Job set')
          : later('the goal of the Job is not set')
      if (!standing.quiet || goal.wake !== null)
        return { kind: 'running', executionRef: ids.session }
      return goal.state.status === 'settled' ? endOf(goal.state.outcome) : aborted(ids)
    },

    async requestStop(
      ids: JobIdentities,
      urgency: 'graceful' | 'forced',
    ): Promise<ScheduleExecutorStop> {
      const facts = await factsOf(ids)
      if (facts === 'unknown') return unknown(UNREADABLE)
      if (facts === 'no-session') return CONFIRMED
      const { standing, goal } = facts
      if (goal === null || !mine(goal, ids)) return CONFIRMED
      const settled = goal.state.status === 'settled'
      if (settled && standing.quiet) return CONFIRMED
      const cancelled = settled
        ? null
        : await goals.command({ ...at(ids), command: 'cancel' }).catch(() => UNKNOWN)
      if (cancelled !== null && cancelled.kind !== 'done')
        return unknown('whether the goal was cancelled is not known')
      if (standing.run === null) return { kind: 'sent' }
      const stop = { ...at(ids), operation: ids.stop, run: standing.run, urgency }
      const asked = await sessions.cancelRun(stop).catch(() => 'unknown' as const)
      return asked === 'requested'
        ? { kind: 'sent' }
        : unknown('whether the run was asked to stop is not known')
    },

    async describe(ids: JobIdentities): Promise<ScheduleExecutionAccount | null> {
      const facts = await factsOf(ids)
      if (typeof facts === 'string') return null
      const goal = facts.goal !== null && mine(facts.goal, ids) ? facts.goal : null
      const ended = goal?.state.status === 'settled' ? endOf(goal.state.outcome).reason : null
      const { adopted } = facts.standing
      const began =
        goal === null
          ? UNAVAILABLE
          : await sessions.roundAfter({ ...at(ids), moment: goal.since }).catch(() => UNAVAILABLE)
      const { after: since, run } = began.kind === 'read' ? began.value : NO_ROUND
      const deliverables = goal?.progress.deliverables ?? []
      return { adopted, outcome: ended, deliverables, since, run }
    },

    /** Whether a run of the session is going: asked after the goal was set, to say whether the work has begun. */
    async running(ids: JobIdentities): Promise<boolean> {
      const standing = await sessions.standing(at(ids)).catch(() => UNAVAILABLE)
      return standing.kind === 'read' && (standing.value?.run ?? null) !== null
    },
  }
}
