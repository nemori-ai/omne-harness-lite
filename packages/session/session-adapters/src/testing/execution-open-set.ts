import {
  openItems,
  type AgentCheckpoint,
  type EffectIntent,
  type ExecutionHandoff,
  type ExecutionState,
  type InputId,
} from '@omne-harness/agent-contract'
import type { MemoryExecution } from './journal.ts'

// Which items of an execution are open, by the agent-contract snapshot rule.

// Inputs are open from the batch the Agent has taken onward.
export function openSnapshotItems(
  scope: Readonly<{ execution: MemoryExecution; shown: ExecutionState; from: number }>,
  handoffs: readonly ExecutionHandoff[],
) {
  const { execution, shown, from } = scope
  const inputOpen = (input: InputId) => {
    const index = execution.inputs.findIndex(
      accepted => (accepted as typeof accepted | undefined)?.id === input,
    )
    return index < 0 || index >= from
  }
  const rule = { state: shown, checkpoint: execution.checkpoint, inputOpen }
  return openItems(rule, { results: execution.results, effects: execution.effects, handoffs })
}

// A closed effect was bound in the write that recorded it: only the open ones can still need a binding.
export function openEffectsAt(
  execution: MemoryExecution,
  state: ExecutionState,
  checkpoint: AgentCheckpoint,
): EffectIntent[] {
  const rule = { state, checkpoint, inputOpen: () => true }
  return [...openItems(rule, { results: [], effects: execution.effects, handoffs: [] }).effects]
}
