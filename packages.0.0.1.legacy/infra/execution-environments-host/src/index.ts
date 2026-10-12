export { createEnvironmentRegistry } from './registry.ts'
export { createHostEnvironment } from './host.ts'
export {
  executeHostCommand,
  prepareHostProcess,
  type HostPreparedProcess,
} from './native-command.ts'
export {
  prepareHostTerminal,
  prepareHostTerminalCommand,
  type HostTerminalControl,
  type HostPreparedTerminal,
} from './native-terminal.ts'
export {
  createHostProcessCoordinate,
  stopHostResource,
  type HostProcessCoordinate,
  type HostRecoveryControl,
  type HostPreparation,
} from './native-control.ts'
export {
  defaultHostNativePolicy,
  captureHostNativePolicy,
  type HostNativePolicy,
} from './native-policy.ts'
export { readHostFile, statHostFile, listHostFiles, searchHostFiles } from './file-query.ts'
export {
  moveHostFile,
  copyHostFile,
  removeHostPath,
  mkdirHostPath,
  type HostCopyUnknown,
} from './file-mutation.ts'
export {
  planHostFileBatch,
  prepareHostFileBatch,
  publishHostFileBatch,
  recognizeHostFileBatch,
  clearHostBatchStages,
  type HostStageOwnership,
  type HostBatchManifest,
  type HostBatchTarget,
  type HostBatchReceipts,
  type HostBatchEvent,
  type HostBatchPublication,
} from './file-batch.ts'

export { clearHostGateEntry } from './native-evidence.ts'
