// 治理中心装配 apps/tenancy-host 的公开入口。设计：apps/tenancy-host/SPEC.md。
export {
  boot,
  type BootOptions,
  type BootHooks,
  type UpgradeConfirmer,
  type TenancyHost,
  type HostDisposal,
} from './boot.ts'
export { HostStartupFailure, type HostStartupStage } from './failure.ts'
export {
  ENV,
  FILE_SUFFIX,
  readHostConfig,
  type HostEnv,
  type HostConfig,
  type StorageSource,
  type DeploymentKeyPems,
  type DeploymentParameterValues,
} from './config.ts'
export {
  verifyKeyPairing,
  generateKeyFiles,
  KEY_FILES,
  KeyFilesExist,
  type GeneratedKeyFiles,
} from './keys.ts'
export {
  hostMigrationFragments,
  composedMigrationNames,
  dataFormatPreflight,
  DATA_FORMAT_CHECK,
  ORGANIZATION_OWNER_ACCOUNT_FK,
} from './migrations.ts'
export {
  buildDistributionTree,
  DRAIN_TIMEOUT_MS,
  DISPOSE_TIMEOUT_MS,
  SERVING_GRACE_MS,
  type HostTreeData,
} from './tree.ts'
export { HostPluginPolicyError, type HostPluginPolicyCode, type HostPluginRole } from './policy.ts'
export {
  attachLog,
  stderrSink,
  EXPORT_LEVEL_WARN,
  HOST_LOGGER,
  type LogSink,
  type LogLine,
  type HostRecord,
} from './log.ts'
export { HOST_VERSION } from './version.ts'
export { main, EXIT, type MainIo } from './main.ts'
