// 迁移前的只读核对的判据（入口节点 R-GC8；入口契约 S-28「前提」段、S-36「那一格立起过就不被重建」行）。
// 机制归存储提供者（storage-sql 的升级守卫），判据归本包，由装配放进 `upgrade.checks`。
import type { PreflightCheck } from '@omne-harness-lite/storage'
import { GOVERNANCE_CENTER_TABLE } from './table.ts'

export const GOVERNANCE_CENTER_PREFLIGHT_CHECK = 'governance-center-table-missing'

/** Kysely `Migrator` 的两张登记表：只剩它们的库仍算空库（阶段 2 裁决账本 §十三之二 W1-A (f)）。 */
const MIGRATION_REGISTRY_TABLES: ReadonlySet<string> = new Set([
  'kysely_migration',
  'kysely_migration_lock',
])

/**
 * 「存储里已有别的治理事实、却没有那一格所在的表」⇒ 不过：迁移会把那张表当新表重建、插入「未铸」的占位行，
 * 入口层随即给一份已有数据铸出另一个身份。「已有别的治理事实」按「除两张迁移登记表外还有别的表」判；
 * 空库（或只剩登记表）照常过——首次启动由迁移建表。只读提供者先读好的表清单，不自己判「表在不在」。
 */
export const governanceCenterPreflight: PreflightCheck = async ({ tables }) => {
  const hasOtherTables = [...tables].some(table => !MIGRATION_REGISTRY_TABLES.has(table))
  if (!hasOtherTables || tables.has(GOVERNANCE_CENTER_TABLE)) return { ok: true }
  return {
    ok: false,
    check: GOVERNANCE_CENTER_PREFLIGHT_CHECK,
    detail:
      'storage already holds data but has no governance_center table; refusing to recreate it and mint a new center identity',
  }
}
