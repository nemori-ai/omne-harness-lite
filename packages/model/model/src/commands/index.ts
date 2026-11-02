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
export { createModelInitialRun, createModelInitialExecution } from './initial.ts'
export type {
  InitialTarget,
  ModelAcceptedOrigin,
  ModelInitialRunLimits,
  ModelInitialRun,
  ModelInitialExecution,
  ModelInitialHostChannel,
} from './initial.ts'
export { describeModelMaterialization } from './value.ts'
export type { MaterializationDescriptionInput } from './value.ts'
export { createModelObservationStorage } from './observation.ts'
export type {
  ModelObservationLimits,
  ModelObservationTiming,
  ModelObservationSource,
  ModelObservationHost,
  ObservationFacts,
  ConfirmedObservationRecord,
} from '../stream-types.ts'
export type {
  ModelBeforePublish,
  ModelConfirmationPass,
  ModelRunCompletion,
  ModelConfirmationDiagnostic,
  ConfirmationSeen,
  ConfirmationStage,
} from './types.ts'
export { hasRecoveryWork } from './judge.ts'
export type { ModelCommandCore } from './state.ts'
export type { CommandWrite, ModelCommandStorage, PendingPage, RunScope } from './storage.ts'
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
