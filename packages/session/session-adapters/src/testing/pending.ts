import type { PendingCall } from '@omne-harness/agent-contract'
import type { MemoryExecution } from './journal.ts'
export function pendingCalls(execution: MemoryExecution): PendingCall[] {
  const checkpoint = execution.checkpoint
  return [
    ...checkpoint.calls,
    ...(checkpoint.batch?.actions.flatMap(action => (action.call ? [action.call] : [])) ?? []),
    ...checkpoint.passages.flatMap(passage =>
      passage.operations.flatMap(operation =>
        'pending' in operation && operation.pending ? [operation.pending] : [],
      ),
    ),
    ...execution.effects.map(effect => effect.pending),
  ]
}
