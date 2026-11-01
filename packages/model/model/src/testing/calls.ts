import type { ModelCommands } from '@omne-harness/model-contract/provider'
import {
  callCommands as coreCallCommands,
  recoveryCommands as coreRecoveryCommands,
} from '../commands/commands.ts'
import type { MemoryState } from './state.ts'

// Calls and recovery of the memory commands: the shared core over the memory storage.

export function callCommands<P>(
  store: MemoryState<P>,
): Pick<ModelCommands<P>, 'admit' | 'recall' | 'query' | 'dispatches' | 'control' | 'settle'> {
  return coreCallCommands(store.core)
}
export function recoveryCommands<P>(
  store: MemoryState<P>,
): Pick<ModelCommands<P>, 'scanPending' | 'loadRecovery' | 'claim'> {
  return coreRecoveryCommands(store.core)
}
