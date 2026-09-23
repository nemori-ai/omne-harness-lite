// 写在前的租约：任何实例任何时刻返回的值 ≤ 当时已持久化的 lease_until；重启后从 ≥ 它的值开始。
// 表由本包自带迁移建立，装配把它合进传给 storage-sql 的 MigrationProvider。
import { sql, type ColumnType, type Kysely } from 'kysely'
import type { Migration } from 'kysely/migration'
import type { MigrationFragment } from '@omne-harness-lite/storage'

/** 租约宽度与续约周期（候选常量，本版无 config）。 */
export const LEASE_WIDTH_MS = 10_000
export const RENEW_PERIOD_MS = Math.floor(LEASE_WIDTH_MS / 3)

export const CLOCK_LEASE_TABLE = 'clock_lease'

/** 毫秒时刻列：sqlite 返回 number，pg 的 bigint 经驱动返回 string；写入一律 number。 */
type EpochMsColumn = ColumnType<number | string | bigint, number, number>

export interface ClockLeaseTable {
  clock_lease: { id: number; lease_until: EpochMsColumn; written_at: EpochMsColumn }
}

export interface ClockLeaseRow {
  readonly lease_until: number
  readonly written_at: number
}

/** 读出的时刻列收成 number；不是安全整数就是数据不合形，尽早抛、不静默截断。 */
export function epochMs(value: number | string | bigint): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isSafeInteger(n)) {
    throw new TypeError(`clock_lease column is not a safe integer: ${String(value)}`)
  }
  return n
}

export function leaseRow(row: {
  readonly lease_until: number | string | bigint
  readonly written_at: number | string | bigint
}): ClockLeaseRow {
  return { lease_until: epochMs(row.lease_until), written_at: epochMs(row.written_at) }
}

export const clockLeaseMigration: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async up(db: Kysely<any>) {
    await db.schema
      .createTable(CLOCK_LEASE_TABLE)
      .ifNotExists()
      .addColumn('id', 'integer', c => c.primaryKey().check(sql`id = 1`))
      // 毫秒时刻：pg 的 integer 只有 4 字节，必须 bigint；sqlite 的 INTEGER 本就 64 位
      .addColumn('lease_until', 'bigint', c => c.notNull())
      .addColumn('written_at', 'bigint', c => c.notNull())
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
