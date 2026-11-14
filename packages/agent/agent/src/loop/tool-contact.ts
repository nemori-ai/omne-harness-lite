import type { Access, ActionId, Failure, PendingCall } from '@omne-harness/agent-contract'
import { succeed, type Outcome } from '@omne-harness/operation-result'
import { askTool } from './contact.ts'
import type { LoopPorts } from './coordinator.ts'

export type ToolContactScope<P> = Readonly<{
  ports: Pick<LoopPorts<P>, 'tools'>
  access: Access<P>
}>

export type ToolContactKnown = Readonly<{ held: Set<ActionId>; unaccepted: Set<ActionId> }>

export async function contactToolCalls<P>(
  scope: ToolContactScope<P>,
  open: readonly PendingCall[],
  known: ToolContactKnown,
): Promise<Outcome<'held' | 'unaccepted', Extract<Failure, { kind: 'unavailable' }>>> {
  let answered: 'held' | 'unaccepted' = 'held'
  for (const pending of open) {
    if (pending.kind !== 'tool' || pending.association !== 'associated') continue
    if (known.held.has(pending.action)) continue
    const answer = await askTool(scope.ports, scope.access, pending)
    if ('failure' in answer) return answer
    known.held.add(pending.action)
    if (answer.ok !== 'not-accepted') continue
    known.unaccepted.add(pending.action)
    answered = 'unaccepted'
  }
  return succeed(answered)
}
