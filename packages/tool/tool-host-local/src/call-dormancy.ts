import type { ToolRecovery } from '@omne-harness/tool-contract/provider'

export type CallWork = Pick<ToolRecovery, 'state' | 'waits' | 'tasks'>

const LIVE_WAIT: ReadonlySet<string> = new Set(['opening', 'open', 'responding'])

export function owesWork(work: CallWork): boolean {
  return (
    work.tasks.some(task => task.state === 'pending') ||
    (work.state.phase === 'suspended' && work.waits.some(wait => LIVE_WAIT.has(wait.phase)))
  )
}

export function waitsForPerson(work: CallWork): boolean {
  const { state, waits, tasks } = work
  if (state.phase !== 'suspended' || state.wait.kind !== 'ask') return false
  const asked = state.wait.wait
  return (
    !tasks.some(task => task.state === 'pending') &&
    waits.some(wait => wait.phase === 'open' && wait.intent.wait === asked)
  )
}
