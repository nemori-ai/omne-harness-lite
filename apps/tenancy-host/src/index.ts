// 治理中心装配 apps/tenancy-host 的公开入口。设计：.meta_harness/design/realization/apps/tenancy-host/。
export {
  boot,
  assertTimeoutBudget,
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
  buildManifest,
  HOST_PLUGIN_NAMES,
  DRAIN_TIMEOUT_MS,
  DISPOSE_TIMEOUT_MS,
  SERVING_GRACE_MS,
  type HostPluginName,
  type ManifestEntry,
  type ManifestRuntime,
} from './manifest.ts'
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
