import { createGoals } from '@omne-harness/goal'
import {
  createMemoryGoalStore,
  fakeAuthority,
  fakeCalls,
  fakeCards,
  fakeDecisions,
  fakeHistory,
  fakeJudging,
  fakeSessions,
} from '@omne-harness/goal/testing'
import {
  GoalRecordSchema,
  type GoalCaller,
  type GoalDraft,
  type GoalOutcome,
} from '@omne-harness/goal-contract'
import {
  ScheduleWorkSchema,
  type ScheduleExecutorJob,
  type ScheduleWork,
} from '@omne-harness/schedule-contract'
import {
  createNewSessionExecutor,
  identitiesOf,
  type Created,
  type ExecutorCalls,
  type SessionStanding,
} from '@omne-harness/schedule-session'

export const TENANT = 'tenant-1'
export const OWNER = { kind: 'tenant', tenantId: TENANT, ownerId: 'owner-1' } as const
const SCHEDULE: GoalCaller = { tenant: TENANT, subject: 'schedule' }

export const DRAFT: GoalDraft = {
  purpose: '把周报写进 report.md',
  criteria: [
    {
      statement: '周报写进了 report.md',
      evidence: { kind: 'file', path: 'report.md' },
      pass: { kind: 'shows', text: '有本周的三件事' },
    },
  ],
  exits: [
    { statement: '资料不全', kind: 'person', deliver: '写明缺什么', counts: 'failure' },
    { statement: '本周没有事', kind: 'person', deliver: '写一句没有', counts: 'success' },
  ],
}

export function workOf(change: Record<string, unknown> = {}): ScheduleWork {
  return ScheduleWorkSchema.parse({
    kind: 'agent',
    instruction: DRAFT,
    session: {
      mode: 'new',
      agentDefinitionRef: 'coding',
      modes: {
        permission: 'never',
        environmentAdoptionRef: 'adoption:1',
        collaboration: 'auto-drive',
      },
      workspace: null,
    },
    materials: [],
    returnTo: null,
    resultPolicy: {
      audience: { kind: 'userDeliverable', target: { kind: 'owner' } },
      publication: { kind: 'provider', providerRef: 'publication:test' },
      resultSeriesId: null,
      attention: 'silent',
      archive: { kind: 'none' },
    },
    ...change,
  })
}

export function jobOf(change: Partial<ScheduleExecutorJob> = {}): ScheduleExecutorJob {
  return {
    owner: OWNER,
    jobId: 'job-1' as ScheduleExecutorJob['jobId'],
    scheduleId: null,
    work: workOf(),
    executionRef: null,
    acceptedAt: '2026-11-26T00:00:00.000Z' as ScheduleExecutorJob['acceptedAt'],
    ...change,
  }
}

type Held = { run: string | null; pending: number; background: number }

/** The real goal domain over its memory store, and sessions a test moves by hand. */
export function world() {
  const store = createMemoryGoalStore()
  const goalSessions = fakeSessions()
  const authority = fakeAuthority()
  let tick = 0
  const goals = createGoals({
    store,
    authority,
    sessions: goalSessions,
    cards: fakeCards(),
    calls: fakeCalls(),
    history: fakeHistory(),
    decisions: fakeDecisions(),
    judging: fakeJudging(),
    clock: { now: () => `2026-11-26T00:00:${String((tick += 1)).padStart(2, '0')}.000Z` },
    hints: { wake: () => {} },
    changes: { changed: () => {} },
  })
  const sessions = new Map<string, Held>()
  const definitions = new Set(['coding'])
  const made: unknown[] = []
  const stopped: unknown[] = []
  const ended = new Map<string, GoalOutcome>()
  const faults = { definition: false, create: null as Created | null, standing: false, stop: false }
  const calls: ExecutorCalls = {
    sessions: {
      async definition({ agent }) {
        return faults.definition
          ? { kind: 'unavailable' }
          : { kind: 'read', value: definitions.has(agent) }
      },
      async create(input) {
        if (faults.create !== null) return faults.create
        made.push(input)
        if (!sessions.has(input.session)) {
          sessions.set(input.session, { run: null, pending: 0, background: 0 })
          goalSessions.add(input.session, 'unattended')
        }
        return { kind: 'created' }
      },
      async standing({ session }) {
        if (faults.standing) return { kind: 'unavailable' }
        const held = sessions.get(session)
        if (held === undefined) return { kind: 'read', value: null }
        const value: SessionStanding = {
          quiet: held.run === null && held.pending === 0 && held.background === 0,
          run: held.run,
          adopted: { name: 'coding', version: 'v7' },
        }
        return { kind: 'read', value }
      },
      async cancelRun(input) {
        if (faults.stop) return 'unknown'
        stopped.push(input)
        return 'requested'
      },
    },
    goals: {
      async read({ session }) {
        const read = await goals.read(SCHEDULE, session)
        const outcome = ended.get(session)
        if (read.kind !== 'done' || read.value === null || outcome === undefined) return read
        const { attendance, generation, revision, rounds } = read.value.state
        const state = { status: 'settled', attendance, generation, revision, rounds, outcome }
        return { ...read, value: GoalRecordSchema.parse({ ...read.value, state, wake: null }) }
      },
      set: ({ session, operation, by, draft }) =>
        goals.write(SCHEDULE, {
          session,
          operation,
          by,
          proposal: { kind: 'set', draft },
          words: null,
          draftedBy: 'creator',
        }),
      command: ({ session, command }) =>
        goals.command(SCHEDULE, { session, command: { kind: command } }),
    },
  }
  const session = (job = jobOf()) => identitiesOf(job)?.session ?? ''
  return {
    executor: createNewSessionExecutor(calls),
    goals,
    store,
    authority,
    goalSessions,
    definitions,
    made,
    stopped,
    faults,
    session,
    /** Moves the session of a Job: a run going, inputs waiting, calls in the background. */
    move: (change: Partial<Held>, job = jobOf()) =>
      void Object.assign(sessions.get(session(job)) ?? {}, change),
    goal: async (job = jobOf()) => {
      const read = await goals.read(SCHEDULE, session(job))
      if (read.kind !== 'done') throw new Error(JSON.stringify(read))
      return read.value
    },
    /** The goal of the Job reads as ended this way from now on: the ends only a judging reaches. */
    ended: (outcome: GoalOutcome, job = jobOf()) => void ended.set(session(job), outcome),
    settle: (command: Parameters<typeof goals.command>[1]['command'], job = jobOf()) =>
      goals.command({ tenant: TENANT, subject: 'owner' }, { session: session(job), command }),
  }
}
