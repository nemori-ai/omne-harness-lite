import type {
  Access,
  ActionBatch,
  ActionId,
  AgentExecutionId,
  Failure,
  PendingCall,
} from '@omne-harness/agent-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { askTool, toolDown } from './contact.ts'
import type { LoopPorts } from './coordinator.ts'
import { diagnosticOf } from './diagnostic.ts'
import { sentToolRequest, type AssociatedToolCall } from './tools.ts'

export type ToolContactScope<P> = Readonly<{
  ports: Pick<LoopPorts<P>, 'tools' | 'materials'>
  access: Access<P>
  execution: AgentExecutionId
  batch: ActionBatch
}>

async function resubmit<P>(
  scope: ToolContactScope<P>,
  pending: AssociatedToolCall,
): Promise<Outcome<void, Failure>> {
  const { ports, access, execution, batch } = scope
  const action = batch.actions.find(item => item.id === pending.action)
  if (action === undefined || batch.barrier.kind !== 'open')
    throw new Error('coordinator defect: a dispatched call without its action or open barrier')
  const request = await sentToolRequest(ports, access, execution, action, batch.barrier.evidence)
  if ('failure' in request) return request
  try {
    const sent = await ports.tools.invoke({ ...access, request: request.ok })
    return sent.kind === 'rejected' && sent.failure.kind === 'unavailable'
      ? fail(toolDown(sent.failure.diagnostic))
      : succeed(undefined)
  } catch (error) {
    return fail(toolDown(diagnosticOf(error)))
  }
}

export async function contactToolCalls<P>(
  scope: ToolContactScope<P>,
  open: readonly PendingCall[],
  held: Set<ActionId>,
): Promise<Outcome<void, Failure>> {
  for (const pending of open) {
    if (pending.kind !== 'tool' || pending.association !== 'associated') continue
    if (held.has(pending.action)) continue
    const answer = await askTool(scope.ports, scope.access, pending)
    if ('failure' in answer) return answer
    if (answer.ok === 'not-accepted') {
      const sent = await resubmit(scope, pending)
      if ('failure' in sent) return sent
    }
    held.add(pending.action)
  }
  return succeed(undefined)
}
