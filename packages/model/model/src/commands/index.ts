import { ModelCommandCore } from './state.ts'
import type { ModelCommandStorage } from './storage.ts'
import type { ModelCommandsCoreOptions } from './types.ts'

/**
 * The shared commands core over one storage. It checks the options and the owner declarations at
 * construction and throws on invalid ones. `modelCommands(core)` gives the 22 methods.
 */
export function createModelCommandsCore<P>(
  options: ModelCommandsCoreOptions<P>,
  storage: ModelCommandStorage,
): ModelCommandCore<P> {
  return new ModelCommandCore(options, storage)
}
export { modelCommands } from './commands.ts'
export { hasRecoveryWork } from './judge.ts'
export type { ModelCommandCore } from './state.ts'
export type { CommandWrite, ModelCommandStorage, RunScope } from './storage.ts'
export { MODEL_WRITE_METHODS } from './types.ts'
export type {
  Binding,
  BindingBase,
  CallDocument,
  CommandAction,
  CommandResource,
  DispatchDocument,
  EvidenceContext,
  ModelCommandsAuthority,
  ModelCommandsCoreOptions,
  ModelCommandsEvidence,
  ModelCommandsLimits,
  ModelSendSource,
  ModelWriteMethod,
  ReadRelation,
  Receipt,
  ResultPaging,
  TenantDocuments,
} from './types.ts'
