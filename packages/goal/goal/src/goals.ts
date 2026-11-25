import {
  applyTrack,
  citedRefs,
  type GoalChecking,
  type GoalReconciling,
  type Goals,
} from '@omne-harness/goal-contract'
import { decideCommand, decideWrite, describeProposal } from './decide.ts'
import { createObserving } from './observing.ts'
import type {
  Clock,
  GoalAuthority,
  GoalCalls,
  GoalCards,
  GoalChanges,
  GoalDecisions,
  GoalHistory,
  GoalJudging,
  ReconcileHints,
} from './ports.ts'
import type { GoalSessions } from './sessions-port.ts'
import type { GoalStore } from './store.ts'
import { createWriting, done, refused, UNAVAILABLE } from './writing.ts'

export type GoalsDependencies = Readonly<{
  store: GoalStore
  authority: GoalAuthority
  sessions: GoalSessions
  cards: GoalCards
  calls: GoalCalls
  history: GoalHistory
  decisions: GoalDecisions
  judging: GoalJudging
  clock: Clock
  hints: ReconcileHints
  changes?: GoalChanges
}>

const uncited = (refs: readonly string[]) => ({
  entry: null,
  field: 'refs',
  problem: `no tool call of this session since the goal was set: ${refs.join(', ')}`,
})

export function createGoals(deps: GoalsDependencies): Goals & GoalChecking & GoalReconciling {
  const { store } = deps
  const { permitted, settle, factsOf, written, deliver } = createWriting(deps)

  return {
    ...createObserving(deps),

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
      const facts = await factsOf(caller.tenant, session)
      if ('kind' in facts) return facts
      const entrance = { via: 'direct', draftedBy: input.draftedBy, by: input.by } as const
      const at = deps.clock.now()
      return written(
        await settle(caller.tenant, session, async current =>
          decideWrite(current, { ...input, ...facts, entrance, at }),
        ),
      )
    },

    async command(caller, { session, command, generation }) {
      const stop = await permitted(caller, session, command.kind)
      if (stop !== null) return stop
      return settle(caller.tenant, session, async current =>
        decideCommand(current, command, generation),
      )
    },

    async propose(caller, { session, proposal }) {
      const stop = await permitted(caller, session, 'propose')
      if (stop !== null) return stop
      const facts = await factsOf(caller.tenant, session)
      if ('kind' in facts) return facts
      const read = await store.latest(caller.tenant, session)
      if (read.kind === 'unavailable') return UNAVAILABLE
      const described = describeProposal(read.value, proposal, facts.attendance)
      return 'refusal' in described ? refused(described.refusal) : done(described.proposed)
    },

    async confirm(caller, input) {
      const { session } = input
      const stop = await permitted(caller, session, 'confirm')
      if (stop !== null) return stop
      const facts = await factsOf(caller.tenant, session)
      if ('kind' in facts) return facts
      const at = deps.clock.now()
      return written(
        await settle(caller.tenant, session, async current => {
          const card = await deps.cards.answered(caller.tenant, session, input.card)
          if (card.kind === 'unavailable') return UNAVAILABLE
          if (card.value === null) return refused({ kind: 'no-such-card' })
          const entrance = { via: 'card', card: card.value } as const
          return decideWrite(current, { ...input, ...facts, operation: input.card, entrance, at })
        }),
      )
    },

    async track(caller, { session, patch }) {
      const stop = await permitted(caller, session, 'track')
      if (stop !== null) return stop
      return written(
        await settle(caller.tenant, session, async current => {
          if (current === null || current.state.status === 'settled')
            return refused({ kind: 'state', reason: 'no-live-goal' })
          const checked = applyTrack(current.body, current.progress, patch)
          if (checked.kind === 'invalid')
            return refused({ kind: 'invalid', issues: checked.issues })
          const already = new Set(citedRefs(current.progress))
          const fresh = citedRefs(checked.progress).filter(ref => !already.has(ref))
          const real = await deps.calls.cited(caller.tenant, session, fresh, current.since)
          if (real.kind === 'unavailable') return UNAVAILABLE
          const missing = fresh.filter(ref => !real.value.includes(ref))
          if (missing.length > 0) return refused({ kind: 'invalid', issues: [uncited(missing)] })
          return { kind: 'next', record: { ...current, progress: checked.progress } }
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
