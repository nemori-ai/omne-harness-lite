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
  type StorageInstance,
  narrow,
} from './protocol.ts'
export { mapStorageError } from './map.ts'
export { type MigrationFragment } from './migration.ts'
export { type PreflightInput, type PreflightResult, type PreflightCheck } from './preflight.ts'
