import type { ModelCommands } from '@omne-harness/model-contract/provider'
import { dispatchCommands as coreDispatchCommands } from '../commands/commands.ts'
import type { MemoryState } from './state.ts'

// Dispatch, stream preservation and retry of the memory commands: the shared core over the
// memory storage.

export function dispatchCommands<P>(
  store: MemoryState<P>,
): Pick<
  ModelCommands<P>,
  | 'prepareDispatch'
  | 'recordMaterialization'
  | 'recordSend'
  | 'recordLateFact'
  | 'prepareRetry'
  | 'decideRetry'
  | 'openReceiveWindow'
  | 'preserve'
> {
  return coreDispatchCommands(store.core)
}
