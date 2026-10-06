// 三个原持久操作：借用 Storage，不选择时间/停止政策，不拥有连接关闭。
import type { Kysely } from 'kysely'
import { UniqueViolation, type Storage } from '@omne-harness-lite/storage'
import { CLOCK_LEASE_TABLE, leaseRow, type ClockLeaseTable } from './lease.ts'
import type { LeasePersistence } from './lease-persistence.ts'

export function createLeasePersistence(storage: Storage): LeasePersistence {
  return {
    initialize(at, leaseUntil) {
      return storage.write(async tx => {
        const db = tx.db as Kysely<ClockLeaseTable>
        await tx.lockRow(CLOCK_LEASE_TABLE, { id: 1 })
        const existing = await db
          .selectFrom(CLOCK_LEASE_TABLE)
          .selectAll()
          .where('id', '=', 1)
          .executeTakeFirst()
        if (existing !== undefined) return { row: leaseRow(existing), fresh: false }
        const inserted = { id: 1, lease_until: leaseUntil, written_at: at }
        try {
          await db.insertInto(CLOCK_LEASE_TABLE).values(inserted).execute()
          return { row: inserted, fresh: true }
        } catch (error) {
          if (!(error instanceof UniqueViolation)) throw error
          const raced = await db
            .selectFrom(CLOCK_LEASE_TABLE)
            .selectAll()
            .where('id', '=', 1)
            .executeTakeFirstOrThrow()
          return { row: leaseRow(raced), fresh: false }
        }
      })
    },
    advance(at, leaseUntil) {
      return storage.write(async tx => {
        const db = tx.db as Kysely<ClockLeaseTable>
        await tx.lockRow(CLOCK_LEASE_TABLE, { id: 1 })
        const result = await db
          .updateTable(CLOCK_LEASE_TABLE)
          .set({ lease_until: leaseUntil, written_at: at })
          .where('id', '=', 1)
          .where('lease_until', '<', leaseUntil)
          .executeTakeFirst()
        return (result.numUpdatedRows ?? 0n) > 0n
      })
    },
    retract(expectedLeaseUntil, at) {
      return storage.write(async tx => {
        const db = tx.db as Kysely<ClockLeaseTable>
        await tx.lockRow(CLOCK_LEASE_TABLE, { id: 1 })
        await db
          .updateTable(CLOCK_LEASE_TABLE)
          .set({ lease_until: at, written_at: at })
          .where('id', '=', 1)
          .where('lease_until', '=', expectedLeaseUntil)
          .execute()
      })
    },
  }
}
