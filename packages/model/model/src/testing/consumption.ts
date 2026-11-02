import type { ModelCommands } from '@omne-harness/model-contract/provider'
import { consumptionCommands as coreConsumptionCommands } from '../commands/commands.ts'
import type { MemoryState } from './state.ts'

// Result reads, acknowledgement and cleanup of the memory commands: the shared core over the
// memory storage.

export function consumptionCommands<P>(
  store: MemoryState<P>,
): Pick<ModelCommands<P>, 'acquireRead' | 'nextRead' | 'endRead' | 'handoff' | 'advanceCleanup'> {
  return coreConsumptionCommands(store.core)
}
