// 迁移前的只读回拨核对（tenancy-host R-U1 的时钟那一条），由装配放进 storage-sql 的 `upgrade.checks`。
// 设计：packages/infra/clock-lease/SPEC.md。
// 与启动判定同一个纯函数 isRolledBack；只读、不建行、不续约；只拒确定回拨，旧租约窗口交给插件启动之后去等。
import type { Kysely } from 'kysely'
import type { PreflightCheck } from '@omne-harness-lite/storage'
import { isRolledBack, systemTimeSources, type TimeSources } from './lease-policy.ts'
import { CLOCK_LEASE_TABLE, leaseRow, type ClockLeaseTable } from './lease.ts'

export const CLOCK_PREFLIGHT_CHECK = 'clock-rolled-back'

export function clockPreflight(sources: TimeSources = systemTimeSources): PreflightCheck {
  return async ({ tx, tables }) => {
    // 「表在不在」由存储提供者在同一读事务里读好：不以「读表报错」推断「没有」
    if (!tables.has(CLOCK_LEASE_TABLE)) return { ok: true }
    const raw = await (tx.db as Kysely<ClockLeaseTable>)
      .selectFrom(CLOCK_LEASE_TABLE)
      .select(['lease_until', 'written_at'])
      .where('id', '=', 1)
      .executeTakeFirst()
    if (raw === undefined) return { ok: true }
    const row = leaseRow(raw)
    const wall = sources.wall()
    if (!isRolledBack(wall, row)) return { ok: true }
    return {
      ok: false,
      check: CLOCK_PREFLIGHT_CHECK,
      detail: `wall clock ${wall} is earlier than the latest time the center used (clock_lease.written_at = ${row.written_at})`,
    }
  }
}
