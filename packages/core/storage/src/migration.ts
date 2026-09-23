// 迁移片段：各 owner 包导出自己表的迁移，装配按次序合成。
// 设计：.meta_harness/design/realization/apps/tenancy-host/design.md「存储装配：迁移由 owner 导出片段、本节点合成」。
import type { Migration } from 'kysely/migration'

/**
 * 一个 owner 包导出的一条迁移。
 *
 * - `name` 在包内稳定、发布后不改；片段只追加在 owner 数组末尾、不重排（tenancy-host M-9）。
 *   装配合成时在前面加全局位置编号，所以 owner 内部的名字不必全局唯一，但同一 owner 内不得重复。
 * - `migration` 只有 `up`；不带 `down`（升级整体性靠快照，不靠反向迁移）。
 */
export interface MigrationFragment {
  readonly name: string
  readonly migration: Migration
}
