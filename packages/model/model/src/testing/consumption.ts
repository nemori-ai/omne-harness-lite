import type { ModelCommands } from '@omne-harness/model-contract/provider'
import { consumptionCommands as coreConsumptionCommands } from '../commands/commands.ts'
import type { MemoryState } from './state.ts'

export function consumptionCommands<P>(
  store: MemoryState<P>,
): Pick<ModelCommands<P>, 'acquireRead' | 'nextRead' | 'endRead' | 'handoff' | 'advanceCleanup'> {
  return coreConsumptionCommands(store.core)
}
