import type { ToolRecovery } from '@omne-harness/tool-contract/provider'

/** What the two judgments read of a recovery read. */
export type CallWork = Pick<ToolRecovery, 'state' | 'waits' | 'tasks'>

/** The wait phases a suspended call still has work on: registering, the decision, the resume. */
const LIVE_WAIT: ReadonlySet<string> = new Set(['opening', 'open', 'responding'])

/**
 * Whether the ledger shows work of the call that a run would do: a pending task, or a suspended
 * call with a live wait. It is what the pending marker of the record store says (Tool SPEC 33).
 */
export function owesWork(work: CallWork): boolean {
  return (
    work.tasks.some(task => task.state === 'pending') ||
    (work.state.phase === 'suspended' && work.waits.some(wait => LIVE_WAIT.has(wait.phase)))
  )
}

/**
 * Whether only a person can move the call: it is suspended on an Ask wait that is open, and no
 * task is pending. An idle run of such a call asked the decision owner and heard no decision.
 */
export function waitsForPerson(work: CallWork): boolean {
  const { state, waits, tasks } = work
  if (state.phase !== 'suspended' || state.wait.kind !== 'ask') return false
  const asked = state.wait.wait
  return (
    !tasks.some(task => task.state === 'pending') &&
    waits.some(wait => wait.phase === 'open' && wait.intent.wait === asked)
  )
}
