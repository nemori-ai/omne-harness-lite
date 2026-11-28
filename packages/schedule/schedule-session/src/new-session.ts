import type { GoalRefusal } from '@omne-harness/goal-contract'
import type {
  ScheduleExecutorJob,
  ScheduleJobExecutor,
  ScheduleWork,
} from '@omne-harness/schedule-contract'
import { identitiesOf, type JobIdentities } from './identities.ts'
import {
  acceptanceOf,
  at,
  instructionRefusal,
  jobInSession,
  never,
  unknown,
} from './job-in-session.ts'
import { issuesText } from './outcome.ts'
import type { ExecutorCalls, JobRules } from './ports.ts'

type AgentWork = Extract<ScheduleWork, { kind: 'agent' }>
type NewWork = AgentWork & Readonly<{ session: Extract<AgentWork['session'], { mode: 'new' }> }>
type Carried = Readonly<{ ids: JobIdentities; work: NewWork }>

const CONFIRMED = { kind: 'confirmed' } as const
const UNAVAILABLE = { kind: 'unavailable' } as const
const UNKNOWN = { kind: 'unknown' } as const
export const refusalText = (refusal: GoalRefusal): string =>
  refusal.kind === 'invalid' ? issuesText(refusal.issues) : refusal.kind

/** Why this path never carries out the work as written; null when it does. */
function refusalOf(work: ScheduleWork, rules?: JobRules): string | null {
  if (work.kind !== 'agent' || work.session.mode !== 'new')
    return 'this executor carries out agent work in a new session only'
  return instructionRefusal(work, rules)
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
  const inSession = jobInSession(calls)

  return {
    accepts: acceptanceOf(calls, refusalOf),

    async describe(job) {
      const taken = carried(job)
      return typeof taken === 'string' ? null : inSession.describe(taken.ids)
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
      const { agentDefinitionRef: agent, modes, workspace } = work.session
      const creation = { agent, modes, workspace }
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
      return { kind: 'started', executionRef: ids.session, running: await inSession.running(ids) }
    },

    async inspect(job) {
      const taken = carried(job)
      if (typeof taken === 'string') return never(taken)
      return inSession.inspect(taken.ids, job.executionRef !== null)
    },

    async requestStop(job, urgency) {
      const taken = carried(job)
      return typeof taken === 'string' ? CONFIRMED : inSession.requestStop(taken.ids, urgency)
    },
  }
}
