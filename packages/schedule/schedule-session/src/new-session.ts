import { validateDraft, type GoalRecord, type GoalRefusal } from '@omne-harness/goal-contract'
import type {
  ScheduleExecutorJob,
  ScheduleExecutorUnknown,
  ScheduleJobExecutor,
  ScheduleWork,
} from '@omne-harness/schedule-contract'
import { identitiesOf, type JobIdentities } from './identities.ts'
import { endOf, issuesText } from './outcome.ts'
import type { ExecutorCalls, SessionStanding } from './ports.ts'

type NewWork = Extract<ScheduleWork, { kind: 'agent' }> &
  Readonly<{
    session: Extract<Extract<ScheduleWork, { kind: 'agent' }>['session'], { mode: 'new' }>
  }>
type Carried = Readonly<{ ids: JobIdentities; work: NewWork }>
type Facts = Readonly<{ standing: SessionStanding; goal: GoalRecord | null }>

const CONFIRMED = { kind: 'confirmed' } as const
const UNAVAILABLE = { kind: 'unavailable' } as const
const UNKNOWN = { kind: 'unknown' } as const
const unknown = (reason: string): ScheduleExecutorUnknown => ({ kind: 'unknown', reason })
const never = (reason: string) => ({ kind: 'notStarted', recoverable: false, reason }) as const
const refusalText = (refusal: GoalRefusal): string =>
  refusal.kind === 'invalid' ? issuesText(refusal.issues) : refusal.kind

/** Why this path never carries out the work as written; null when it does. */
function refusalOf(work: ScheduleWork): string | null {
  if (work.kind !== 'agent' || work.session.mode !== 'new')
    return 'this executor carries out agent work in a new session only'
  if (work.materials.length > 0) return 'materials are not carried into a new session yet'
  if (work.session.workspace !== null) return 'a workspace is not attached to a new session yet'
  const checked = validateDraft(work.instruction, { attendance: 'unattended' })
  return checked.kind === 'valid' ? null : `instruction: ${issuesText(checked.issues)}`
}

function carried(job: ScheduleExecutorJob): Carried | string {
  const ids = identitiesOf(job)
  if (ids === null) return 'a Job of no tenant runs in no session'
  const refusal = refusalOf(job.work)
  return refusal ?? { ids, work: job.work as NewWork }
}

/** Carries out agent work in a session of its own: the Job's instruction is the goal of that session, and the Job ends as that goal ends. */
export function createNewSessionExecutor(calls: ExecutorCalls): ScheduleJobExecutor {
  const { sessions, goals } = calls
  const at = (ids: JobIdentities) => ({ tenant: ids.tenant, session: ids.session })
  const mine = (goal: GoalRecord, ids: JobIdentities) => goal.history[0]?.operation === ids.goal

  async function factsOf(ids: JobIdentities): Promise<Facts | 'unknown' | 'no-session'> {
    const standing = await sessions.standing(at(ids)).catch(() => UNAVAILABLE)
    if (standing.kind !== 'read') return 'unknown'
    if (standing.value === null) return 'no-session'
    const goal = await goals.read(at(ids)).catch(() => UNKNOWN)
    return goal.kind === 'done' ? { standing: standing.value, goal: goal.value } : 'unknown'
  }

  return {
    async accepts(work) {
      const reason = refusalOf(work)
      return reason === null ? { kind: 'accepted' } : { kind: 'refused', reason }
    },

    async describe(job) {
      const taken = carried(job)
      const facts = typeof taken === 'string' ? 'unknown' : await factsOf(taken.ids)
      if (typeof taken === 'string' || typeof facts === 'string') return null
      const goal = facts.goal !== null && mine(facts.goal, taken.ids) ? facts.goal : null
      const ended = goal?.state.status === 'settled' ? endOf(goal.state.outcome).reason : null
      const { adopted } = facts.standing
      return { adopted, outcome: ended, deliverables: goal?.progress.deliverables ?? [] }
    },

    async check(job) {
      const taken = carried(job)
      if (typeof taken === 'string') return { kind: 'unsupported', reason: taken }
      const agent = taken.work.session.agentDefinitionRef
      const found = await sessions
        .definition({ tenant: taken.ids.tenant, agent })
        .catch(() => UNAVAILABLE)
      if (found.kind !== 'read') return unknown('the Agent definition cannot be read now')
      if (found.value) return { kind: 'ready' }
      return { kind: 'unavailable', reason: `the tenant has no Agent definition ${agent}` }
    },

    async start(job) {
      const taken = carried(job)
      if (typeof taken === 'string') return never(taken)
      const { ids, work } = taken
      const { agentDefinitionRef: agent, modes } = work.session
      const creation = { agent, modes }
      const created = await sessions
        .create({ ...at(ids), operation: ids.create, creation })
        .catch(() => UNKNOWN)
      if (created.kind === 'unknown') return unknown('whether the session was created is not known')
      if (created.kind === 'refused')
        return { kind: 'notStarted', recoverable: created.recoverable, reason: created.reason }
      const set = await goals
        .set({ ...at(ids), operation: ids.goal, by: ids.by, draft: work.instruction })
        .catch(() => UNKNOWN)
      if (set.kind === 'refused') return never(`goal: ${refusalText(set.reason)}`)
      if (set.kind !== 'done') return unknown('whether the goal was set is not known')
      const standing = await sessions.standing(at(ids)).catch(() => UNAVAILABLE)
      const running = standing.kind === 'read' && (standing.value?.run ?? null) !== null
      return { kind: 'started', executionRef: ids.session, running }
    },

    async inspect(job) {
      const taken = carried(job)
      if (typeof taken === 'string') return never(taken)
      const { ids } = taken
      const facts = await factsOf(ids)
      if (facts === 'unknown') return unknown('the session or its goal cannot be read now')
      if (facts === 'no-session')
        return { kind: 'notStarted', recoverable: true, reason: 'the session is not created' }
      const { standing, goal } = facts
      if (goal === null) return { kind: 'taken', executionRef: ids.session }
      if (!mine(goal, ids)) return unknown('the session carries a goal this Job did not set')
      if (!standing.quiet || goal.wake !== null)
        return { kind: 'running', executionRef: ids.session }
      if (goal.state.status === 'settled') return endOf(goal.state.outcome)
      const aborted = await goals.command({ ...at(ids), command: 'abort' }).catch(() => UNKNOWN)
      const state = aborted.kind === 'done' ? aborted.value?.state : undefined
      return state?.status === 'settled'
        ? endOf(state.outcome)
        : unknown('whether the goal was aborted is not known')
    },

    async requestStop(job, urgency) {
      const taken = carried(job)
      if (typeof taken === 'string') return CONFIRMED
      const { ids } = taken
      const facts = await factsOf(ids)
      if (facts === 'unknown') return unknown('the session or its goal cannot be read now')
      if (facts === 'no-session') return CONFIRMED
      const { standing, goal } = facts
      if (goal === null || !mine(goal, ids)) return CONFIRMED
      const settled = goal.state.status === 'settled'
      if (settled && standing.quiet) return CONFIRMED
      if (!settled) {
        const cancelled = await goals
          .command({ ...at(ids), command: 'cancel' })
          .catch(() => UNKNOWN)
        if (cancelled.kind !== 'done') return unknown('whether the goal was cancelled is not known')
      }
      if (standing.run === null) return { kind: 'sent' }
      const stop = { ...at(ids), operation: ids.stop, run: standing.run, urgency }
      const asked = await sessions.cancelRun(stop).catch(() => 'unknown' as const)
      return asked === 'requested'
        ? { kind: 'sent' }
        : unknown('whether the run was asked to stop is not known')
    },
  }
}
