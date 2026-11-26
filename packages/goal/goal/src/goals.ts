import {
  applyTrack,
  citedRefs,
  excerptOf,
  type GoalCaller,
  type GoalChecking,
  type GoalReconciling,
  type Goals,
  type ObservedCall,
} from '@omne-harness/goal-contract'
import { decideCommand, decideWrite, describeProposal } from './decide.ts'
import { createObserving } from './observing.ts'
import { createSubmitting } from './submitting.ts'
import type {
  Clock,
  GoalAuthority,
  GoalCalls,
  GoalCards,
  GoalChanges,
  GoalDecisions,
  GoalExamining,
  GoalHistory,
  GoalJudging,
  PortRead,
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
  examining: GoalExamining
  clock: Clock
  hints: ReconcileHints
  changes?: GoalChanges
}>

/** A read of a port; one that fails has no basis. */
const ask = <T>(read: () => Promise<PortRead<T>>): Promise<PortRead<T>> =>
  Promise.resolve()
    .then(read)
    .catch(() => ({ kind: 'unavailable' }) as const)

const CITABLE_SHOWN = 12
const COMMAND_SHOWN = 60

function citable(call: ObservedCall): string {
  const { ref, tool, command, path } = call
  if (command !== null)
    return `${ref} ${tool} \`${excerptOf(command.trim().replace(/\s+/gu, ' '), COMMAND_SHOWN, 'head')}\``
  return path === null ? `${ref} ${tool}` : `${ref} ${tool} ${path}`
}

/** Why references do not stand, and the latest calls of the session that would: the agent sees no call id anywhere else. */
function uncited(refs: readonly string[], made: readonly ObservedCall[]) {
  const missing = `no tool call of this session since the goal was set: ${refs.join(', ')}`
  const latest = made.toSorted((a, b) => a.order - b.order).slice(-CITABLE_SHOWN)
  const problem =
    latest.length === 0
      ? missing
      : `${missing}. Those you can cite: ${latest.map(citable).join('; ')}`
  return { entry: null, field: 'refs', problem }
}

export function createGoals(deps: GoalsDependencies): Goals & GoalChecking & GoalReconciling {
  const { store } = deps
  const { permitted, settle, factsOf, written, deliver, hand, briefOf } = createWriting(deps)

  /** What the working agent asks of its own goal. A session that examines for a goal is refused it: it has two commands, and they are of that goal. */
  async function ofTheWorker(
    caller: GoalCaller,
    session: string,
    action: 'propose' | 'confirm' | 'track',
  ) {
    const stop = await permitted(caller, session, action)
    if (stop !== null) return stop
    const examined = await store.examinedBy(caller.tenant, session)
    if (examined.kind === 'unavailable') return UNAVAILABLE
    return examined.value === null ? null : refused({ kind: 'denied' })
  }

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
          decideWrite(current, { ...input, ...facts, asked: null, entrance, at }),
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
      const stop = await ofTheWorker(caller, session, 'propose')
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
      const stop = await ofTheWorker(caller, session, 'confirm')
      if (stop !== null) return stop
      const facts = await factsOf(caller.tenant, session)
      if ('kind' in facts) return facts
      const asked = await ask(() => deps.sessions.asked(caller.tenant, session))
      if (asked.kind === 'unavailable') return UNAVAILABLE
      const at = deps.clock.now()
      const said = { operation: input.card, words: null, asked: asked.value, at } as const
      return written(
        await settle(caller.tenant, session, async current => {
          const card = await deps.cards.answered(caller.tenant, session, input.card)
          if (card.kind === 'unavailable') return UNAVAILABLE
          if (card.value === null) return refused({ kind: 'no-such-card' })
          const entrance = { via: 'card', card: card.value } as const
          return decideWrite(current, { ...input, ...facts, ...said, entrance })
        }),
      )
    },

    async track(caller, { session, patch }) {
      const stop = await ofTheWorker(caller, session, 'track')
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
          if (missing.length > 0) {
            const made = await ask(() => deps.history.calls(caller.tenant, session, current.since))
            const known = made.kind === 'read' ? made.value : []
            return refused({ kind: 'invalid', issues: [uncited(missing, known)] })
          }
          return { kind: 'next', record: { ...current, progress: checked.progress } }
        }),
      )
    },

    ...createSubmitting(deps, { permitted, settle, briefOf }),

    async reconcile(tenant) {
      const owing = await store.owing(tenant)
      if (owing.kind === 'unavailable') return
      for (const record of owing.value) {
        await deliver(tenant, record)
        await hand(tenant, record)
      }
    },
  }
}
