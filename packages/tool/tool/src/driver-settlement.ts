import type { ContentBlock } from '@omne-harness/content-block'
import { fail, type Outcome } from '@omne-harness/operation-result'
import type { DurableEvidence, ToolFailure, ToolState } from '@omne-harness/tool-contract'
import type { CallAccess } from '@omne-harness/tool-contract/provider'
import type { ToolRecovery, ToolTask } from '@omne-harness/tool-contract/provider'
import type { ToolDependencies } from './construction.ts'

/** Replays the saved final under the original task identity, including its queue tail. */
export async function preserveSavedFinal<P, B extends ContentBlock, E>(
  { commands }: Pick<ToolDependencies<P, B, E>, 'commands'>,
  access: CallAccess<P>,
  recovery: ToolRecovery,
  task: Extract<ToolTask, { basis: DurableEvidence }>,
  cancelled: () => boolean,
): Promise<Outcome<ToolState, ToolFailure> | null> {
  if (cancelled()) return null
  if (recovery.execution === null)
    return fail({
      kind: 'invalid',
      field: 'task.basis',
      reason: 'original-final-and-execution-required',
    })
  const input = {
    ...recovery.execution,
    tenant: access.tenant,
    principal: access.principal,
    operation: task.operation,
    expected: recovery.state.revision,
    basis: task.basis,
  }
  return commands.preserveResult(input)
}
