import type { ModelCommands } from '@omne-harness/model-contract/provider'
import { dispatchCommands as coreDispatchCommands } from '../commands/commands.ts'
import type { MemoryState } from './state.ts'

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
