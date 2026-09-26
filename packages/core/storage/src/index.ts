// 存储协议：一次读/写事务、显式锁、四型失败。设计：.meta_harness/design/realization/packages/core/storage/。
export {
  StorageUnavailable,
  UniqueViolation,
  ReferenceViolation,
  StorageDefect,
  type ReferenceViolationKind,
  type StorageFailure,
} from './errors.ts'
export {
  type UntypedDb,
  type ReadTx,
  type WriteTx,
  type Storage,
  type AtomicStorage,
  type StorageUnit,
  type StorageInstance,
  narrow,
} from './protocol.ts'
export { mapStorageError } from './map.ts'
export { type MigrationFragment, composeMigrations, composedMigrationName } from './migration.ts'
export { type PreflightInput, type PreflightResult, type PreflightCheck } from './preflight.ts'
export {
  SnapshotFailure,
  type SnapshotFailureKind,
  type SnapshotColumn,
  type SnapshotIndex,
  type SnapshotForeignKey,
  type SnapshotTable,
  type SnapshotStructure,
  type SnapshotView,
  type SnapshotCheck,
  type SnapshotInput,
  type SnapshotInspectionSession,
  type SnapshotSession,
  type SnapshotRunOptions,
  type SnapshotMaintenance,
  type SnapshotInspection,
} from './maintenance.ts'
export { checkSnapshotTables } from './snapshot-check.ts'
