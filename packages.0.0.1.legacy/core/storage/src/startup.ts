import type { MigrationProvider } from 'kysely/migration'
import type { PreflightCheck } from './preflight.ts'

export interface UpgradeConfirmation {
  /** 本次附着跑过至少一个迁移。 */
  readonly migrated: boolean
  /** 本次附着拿过快照或「库不存在」标记（pg 恒为假）。 */
  readonly snapshotTaken: boolean
  /** 本次附着拿的那一份已被删除且目录已落盘。装配断言 `snapshotTaken ⇒ snapshotRemoved`。 */
  readonly snapshotRemoved: boolean
}
export type UpgradePending =
  'never-attached' | 'clear' | { readonly pending: { readonly location: string } }

/** Observation and confirmation only; this shape does not grant attachment authority. */
export interface UpgradeGuardHandle {
  confirm(): Promise<UpgradeConfirmation>
  pending(): Promise<UpgradePending>
}
export interface StorageStartupResources {
  readonly migrations: MigrationProvider
  readonly upgrade:
    | false
    | {
        readonly checks: readonly PreflightCheck[]
        readonly guard: UpgradeGuardHandle
      }
}
export interface StorageCompletionPort {
  closed(status: 'clean' | 'error'): void
}
