// Storage 协议的 Kysely 提供者。设计：.meta_harness/design/realization/packages/infra/storage-sql/。
export { StorageSqlConfig } from './config.ts'
export { openStorage, type OpenStorageOptions } from './open.ts'
export { SqlStorage } from './provider.ts'
export {
  createUpgradeGuard,
  type UpgradeGuard,
  UpgradeGuardNotAttached,
  StorageStartupFailure,
  type StorageStartupStage,
  type UpgradeConfirmation,
  type UpgradePending,
} from './upgrade/guard.ts'
export { type StorageSqlLogger } from './upgrade/owner.ts'
export {
  NodeSqliteDialect,
  NodeSqliteDriver,
  type NodeSqliteDialectOptions,
} from './sqlite/driver.ts'
export { translateSqliteError } from './sqlite/errors.ts'
export { translatePgError } from './postgres/index.ts'
export { openSnapshotInspection } from './maintenance/engine.ts'
export { storageSnapshotCheck, STORAGE_SNAPSHOT_TABLES } from './maintenance/registry-check.ts'
