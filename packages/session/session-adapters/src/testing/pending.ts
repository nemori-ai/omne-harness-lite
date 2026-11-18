import type { PendingCall } from '@omne-harness/agent-contract'
import { checkpointCalls } from '../journal/decide.ts'
import type { MemoryExecution } from './journal.ts'
export function pendingCalls(execution: MemoryExecution): PendingCall[] {
  return [
    ...checkpointCalls(execution.checkpoint),
    ...execution.effects.map(effect => effect.pending),
  ]
}
