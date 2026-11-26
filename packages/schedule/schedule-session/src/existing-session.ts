import type {
  ScheduleExecutorJob,
  ScheduleJobExecutor,
  ScheduleWork,
} from '@omne-harness/schedule-contract'
import { identitiesOf, type JobIdentities } from './identities.ts'
import {
  at,
  instructionRefusal,
  jobInSession,
  later,
  mine,
  never,
  unknown,
  type Facts,
} from './job-in-session.ts'
import { refusalText } from './new-session.ts'
import type { ExecutorCalls } from './ports.ts'

type AgentWork = Extract<ScheduleWork, { kind: 'agent' }>
type Carried = Readonly<{ ids: JobIdentities; work: AgentWork }>

const CONFIRMED = { kind: 'confirmed' } as const
const UNAVAILABLE = { kind: 'unavailable' } as const
const UNKNOWN = { kind: 'unknown' } as const
const ABSENT = 'the session does not exist'
const CLOSED = 'the session takes no work any more'
const BUSY = 'the session is busy'
const HAS_GOAL = 'the session already has a goal in progress'

/** Why this path never carries out the work as written; null when it does. */
function refusalOf(work: ScheduleWork): string | null {
  if (work.kind !== 'agent' || work.session.mode !== 'existing')
    return 'this executor carries out agent work in an existing session only'
  return instructionRefusal(work)
}

function carried(job: ScheduleExecutorJob): Carried | string {
  const refusal = refusalOf(job.work)
  if (refusal !== null) return refusal
  const work = job.work as AgentWork
  const named = work.session.mode === 'existing' ? work.session.sessionRef : undefined
  const ids = identitiesOf(job, named)
  return ids === null ? 'a Job of no tenant runs in no session' : { ids, work }
}

/** Why the Job cannot open a round of its own in the session now; null when it can. A goal in progress is told before a busy session. */
function blockOf({ standing, goal }: Facts): string | null {
  if (goal !== null && goal.state.status !== 'settled') return HAS_GOAL
  return standing.quiet ? null : BUSY
}

/** Carries out agent work in a session that exists: the Job opens a round of its own there by setting its goal, and never joins a round of another. */
export function createExistingSessionExecutor(calls: ExecutorCalls): ScheduleJobExecutor {
  const { sessions, goals } = calls
  const inSession = jobInSession(calls)

  /** Sets the goal of the Job. A round another input opened is not the Job's: the goal just set is cancelled and the Job waits. */
  async function begin({ ids, work }: Carried) {
    const set = await goals
      .set({ ...at(ids), operation: ids.goal, by: ids.by, draft: work.instruction })
      .catch(() => UNKNOWN)
    if (set.kind === 'refused') {
      const { reason } = set
      const taken = reason.kind === 'another-goal' || reason.kind === 'state'
      return taken ? later(HAS_GOAL) : never(`goal: ${refusalText(reason)}`)
    }
    if (set.kind !== 'done') return unknown('whether the goal was set is not known')
    const { state, version } = set.value
    const request = `start/${String(state.generation)}/${String(version)}`
    const opened = set.recalled
      ? UNAVAILABLE
      : await sessions.opened({ ...at(ids), request }).catch(() => UNAVAILABLE)
    if (opened.kind === 'read' && opened.value === false) {
      const cancelled = await goals.command({ ...at(ids), command: 'cancel' }).catch(() => UNKNOWN)
      return cancelled.kind === 'done'
        ? later(BUSY)
        : unknown('whether the goal set in a round of another was cancelled is not known')
    }
    const running = opened.kind === 'read' ? opened.value === true : await inSession.running(ids)
    return { kind: 'started', executionRef: ids.session, running } as const
  }

  return {
    async accepts(work) {
      const reason = refusalOf(work)
      return reason === null ? { kind: 'accepted' } : { kind: 'refused', reason }
    },

    async describe(job) {
      const taken = carried(job)
      return typeof taken === 'string' ? null : inSession.describe(taken.ids)
    },

    async check(job) {
      const taken = carried(job)
      if (typeof taken === 'string') return { kind: 'unsupported', reason: taken }
      const facts = await inSession.factsOf(taken.ids)
      if (facts === 'unknown') return unknown('the session cannot be read now')
      if (facts === 'no-session') return { kind: 'unavailable', reason: ABSENT }
      if (!facts.standing.usable) return { kind: 'unavailable', reason: CLOSED }
      if (facts.goal !== null && mine(facts.goal, taken.ids)) return { kind: 'ready' }
      const block = blockOf(facts)
      return block === null ? { kind: 'ready' } : { kind: 'unavailable', reason: block }
    },

    async start(job) {
      const taken = carried(job)
      if (typeof taken === 'string') return never(taken)
      const { ids } = taken
      const facts = await inSession.factsOf(ids)
      if (facts === 'unknown') return unknown('the session cannot be read now')
      if (facts === 'no-session') return never(ABSENT)
      if (facts.goal !== null && mine(facts.goal, ids))
        return { kind: 'started', executionRef: ids.session, running: facts.standing.run !== null }
      if (!facts.standing.usable) return never(CLOSED)
      const block = blockOf(facts)
      return block === null ? begin(taken) : later(block)
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
