import type { ContentBlock } from '@omne-harness/content-block'
import { fail, type Outcome } from '@omne-harness/operation-result'
import type {
  CallAccess,
  DurableEvidence,
  ToolFailure,
  ToolRecovery,
  ToolState,
  ToolTask,
} from '@omne-harness/tool-contract'
import type { ToolDependencies } from './construction.ts'

/** Replays the saved final under the original task identity, including its queue tail. */
export async function preserveSavedFinal<P, B extends ContentBlock, E>(
  { commands, facts }: Pick<ToolDependencies<P, B, E>, 'commands' | 'facts'>,
  access: CallAccess<P>,
  recovery: ToolRecovery<B>,
  task: Extract<ToolTask, { basis: DurableEvidence }>,
  cancelled: () => boolean,
): Promise<Outcome<ToolState, ToolFailure> | null> {
  if (cancelled()) return null
  const saved = await facts.read({ ...access, basis: task.basis })
  if (cancelled()) return null
  if ('failure' in saved) return saved
  if (saved.ok.fact.kind !== 'final' || recovery.execution === null)
    return fail({
      kind: 'invalid',
      field: 'task.basis',
      reason: 'original-final-and-execution-required',
    })
  const final = saved.ok.fact
  const input = {
    ...recovery.execution,
    tenant: access.tenant,
    principal: access.principal,
    operation: task.operation,
    expected: recovery.state.revision,
    raw: final.raw,
    value: final.result,
    terminal: final.terminal,
    effect: final.effect,
  }
  return commands.preserveResult(input)
}
