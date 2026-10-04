// 本包的迁移片段（施工计划 I-1；入口节点 design「中心标识：迁移片段与读或铸」；tenancy-host 迁移纪律 M-1、M-3、M-7、M-8）。
// 建 `governance_center` 并插入占位行 `('center', NULL)`——契约 S-28 ②「那一格与存储结构同时立起，状态是未铸」。
import type { Kysely } from 'kysely'
import type { MigrationFragment } from '@omne-harness-lite/storage'
import { CENTER_SLOT, GOVERNANCE_CENTER_TABLE, type GovernanceCenterTable } from './table.ts'

/**
 * 片段可重跑（M-1）：表 `ifNotExists`；占位行以 `ON CONFLICT (slot) DO NOTHING` 插入——存在即不插，
 * 重跑不碰已铸的值。主键不命名（M-3：两方言都报 `governance_center_pkey`；列是 TEXT，不是 sqlite 的 rowid 别名）；
 * 不建 CHECK（M-7：`center_id` 的形状由读回时核）；不带 `down`（撤掉这张表就是丢掉中心的身份，M-8）。
 */
export const governanceCenterMigrations: readonly MigrationFragment[] = Object.freeze([
  {
    name: 'governance_center',
    migration: {
      async up(db: Kysely<GovernanceCenterTable>) {
        await db.schema
          .createTable(GOVERNANCE_CENTER_TABLE)
          .ifNotExists()
          .addColumn('slot', 'text', column => column.primaryKey().notNull())
          .addColumn('center_id', 'text')
          .execute()
        await db
          .insertInto(GOVERNANCE_CENTER_TABLE)
          .values({ slot: CENTER_SLOT, center_id: null })
          .onConflict(conflict => conflict.column('slot').doNothing())
          .execute()
      },
    },
  },
])
