// 写在前的租约：任何实例任何时刻返回的值 ≤ 当时已持久化的 lease_until；重启后从 ≥ 它的值开始。
// 表由本包自带迁移建立，装配把它合进传给 storage-sql 的 MigrationProvider。
import { sql, type Kysely } from 'kysely'
import type { Migration } from 'kysely/migration'
import type { MigrationFragment } from '@omne-harness-lite/storage'

/** 租约宽度与续约周期（候选常量，本版无 config）。 */
export const LEASE_WIDTH_MS = 10_000
export const RENEW_PERIOD_MS = Math.floor(LEASE_WIDTH_MS / 3)

export const CLOCK_LEASE_TABLE = 'clock_lease'

export interface ClockLeaseTable {
  clock_lease: { id: number; lease_until: number; written_at: number }
}

export const clockLeaseMigration: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async up(db: Kysely<any>) {
    await db.schema
      .createTable(CLOCK_LEASE_TABLE)
      .ifNotExists()
      .addColumn('id', 'integer', c => c.primaryKey().check(sql`id = 1`))
      .addColumn('lease_until', 'integer', c => c.notNull())
      .addColumn('written_at', 'integer', c => c.notNull())
      .execute()
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async down(db: Kysely<any>) {
    await db.schema.dropTable(CLOCK_LEASE_TABLE).ifExists().execute()
  },
}

/**
 * 本包的迁移片段（阶段 2 计划 I-1）：名字包内稳定、只追加不重排；装配经 `composeMigrations` 合成。
 * 片段只带 `up`——升级的整体性靠 storage-sql 的快照，不靠反向迁移；旧导出 `clockLeaseMigration` 原样保留。
 */
export const clockMigrations: readonly MigrationFragment[] = Object.freeze([
  { name: 'clock_lease', migration: { up: clockLeaseMigration.up } },
])
