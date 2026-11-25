import {
  baseOf,
  NO_GOAL,
  renderBody,
  type GoalCaller,
  type GoalRecord,
  type GoalReconciling,
  type GoalRefusal,
  type Goals,
  type Outcome,
} from '@omne-harness/goal-contract'
import { decideCommand, decideWrite, digestOf, proposedBody, type Decided } from './decide.ts'
import {
  ask,
  type Clock,
  type GoalAction,
  type GoalAuthority,
  type GoalCards,
  type GoalSessions,
  type ReconcileHints,
} from './ports.ts'
import type { GoalStore } from './store.ts'

export type GoalsDependencies = Readonly<{
  store: GoalStore
  authority: GoalAuthority
  sessions: GoalSessions
  cards: GoalCards
  clock: Clock
  hints: ReconcileHints
}>

type Answer<T> = Outcome<T, GoalRefusal>
const UNAVAILABLE = { kind: 'basis-unavailable' } as const
const UNKNOWN = { kind: 'unknown' } as const
const refused = (reason: GoalRefusal) => ({ kind: 'refused', reason }) as const
const done = <T>(value: T, recalled = false) => ({ kind: 'done', value, recalled }) as const
/** A decision made on a version somebody else wrote over is made again, this many times at most. */
const ATTEMPTS = 3

export function createGoals(deps: GoalsDependencies): Goals & GoalReconciling {
  const { store, sessions } = deps

  async function permitted(caller: GoalCaller, session: string, action: GoalAction) {
    const answer = await ask(deps.authority, caller, session, action)
    if (answer === 'unavailable') return UNAVAILABLE
    return answer === 'denied' ? refused({ kind: 'denied' }) : null
  }

  /** Hands the reminder a record owes to its session, then clears the debt. An unknown send stays owed. */
  async function deliver(tenant: string, record: GoalRecord): Promise<void> {
    if (record.wake === null) return
    const wake = { ...record.wake, session: record.session, rendered: renderBody(record.body) }
    let answer: Awaited<ReturnType<GoalSessions['wake']>> = 'unknown'
    try {
      answer = await sessions.wake(tenant, wake)
    } catch {
      answer = 'unknown'
    }
    if (answer === 'unknown') return deps.hints.wake(tenant)
    const next = { ...record, wake: null }
    await store.commit(tenant, { session: record.session, expected: record.version, next })
  }

  /** Decides on what stands and writes on that version; a version written over meanwhile is decided again. */
  async function settle(
    tenant: string,
    session: string,
    decide: (current: GoalRecord | null) => Promise<Decided | Answer<never> | null>,
  ): Promise<Answer<GoalRecord | null>> {
    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
      const read = await store.latest(tenant, session)
      if (read.kind === 'unavailable') return UNAVAILABLE
      const decided = await decide(read.value)
      if (decided === null) return done(null)
      if (decided.kind === 'recalled') return done(decided.record, true)
      if (decided.kind === 'unchanged') return done(decided.record)
      if (decided.kind !== 'next') return decided
      const expected = read.value?.version ?? 0
      const answer = await store.commit(tenant, { session, expected, next: decided.record })
      if (answer.kind === 'unknown') return UNKNOWN
      if (answer.kind === 'rolled-back') return UNAVAILABLE
      if (answer.value.kind === 'stale') continue
      await deliver(tenant, answer.value.record)
      return done(answer.value.record)
    }
    return UNAVAILABLE
  }

  async function attendanceOf(tenant: string, session: string) {
    const facts = await sessions.facts(tenant, session)
    if (facts.kind === 'unavailable') return UNAVAILABLE
    return facts.value === null ? refused({ kind: 'no-such-session' }) : facts.value.attendance
  }

  const written = (answer: Answer<GoalRecord | null>): Answer<GoalRecord> =>
    answer.kind === 'done' && answer.value === null ? UNAVAILABLE : (answer as Answer<GoalRecord>)

  return {
    async read(caller, session) {
      const stop = await permitted(caller, session, 'read')
      if (stop !== null) return stop
      const read = await store.latest(caller.tenant, session)
      return read.kind === 'unavailable' ? UNAVAILABLE : done(read.value)
    },

    async write(caller, input) {
      const { session, proposal } = input
      const stop = await permitted(caller, session, proposal.kind)
      if (stop !== null) return stop
      const attendance = await attendanceOf(caller.tenant, session)
      if (typeof attendance !== 'string') return attendance
      const entrance = { via: 'direct', draftedBy: input.draftedBy, by: input.by } as const
      const at = deps.clock.now()
      return written(
        await settle(caller.tenant, session, async current =>
          decideWrite(current, { ...input, attendance, entrance, at }),
        ),
      )
    },

    async command(caller, { session, command }) {
      const stop = await permitted(caller, session, command.kind)
      if (stop !== null) return stop
      return settle(caller.tenant, session, async current => decideCommand(current, command))
    },

    async propose(caller, { session, proposal }) {
      const stop = await permitted(caller, session, 'propose')
      if (stop !== null) return stop
      const attendance = await attendanceOf(caller.tenant, session)
      if (typeof attendance !== 'string') return attendance
      const read = await store.latest(caller.tenant, session)
      if (read.kind === 'unavailable') return UNAVAILABLE
      const checked = proposedBody(read.value, proposal, attendance)
      if (checked.kind === 'no-live-goal') return refused({ kind: 'state', reason: 'no-live-goal' })
      if (checked.kind === 'invalid') return refused({ kind: 'invalid', issues: checked.issues })
      const base = baseOf(read.value?.state ?? NO_GOAL)
      const rendered = renderBody(checked.body)
      return done({ kind: proposal.kind, rendered, digest: digestOf(checked.body), base })
    },

    async confirm(caller, input) {
      const { session } = input
      const stop = await permitted(caller, session, 'confirm')
      if (stop !== null) return stop
      const attendance = await attendanceOf(caller.tenant, session)
      if (typeof attendance !== 'string') return attendance
      const at = deps.clock.now()
      return written(
        await settle(caller.tenant, session, async current => {
          const card = await deps.cards.answered(caller.tenant, session, input.card)
          if (card.kind === 'unavailable') return UNAVAILABLE
          if (card.value === null) return refused({ kind: 'no-such-card' })
          const entrance = { via: 'card', card: card.value } as const
          return decideWrite(current, { ...input, operation: input.card, attendance, entrance, at })
        }),
      )
    },

    async reconcile(tenant) {
      const owing = await store.owing(tenant)
      if (owing.kind === 'unavailable') return
      for (const record of owing.value) await deliver(tenant, record)
    },
  }
}
