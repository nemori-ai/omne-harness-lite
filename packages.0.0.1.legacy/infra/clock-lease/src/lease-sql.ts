// 三个原持久操作：借用 Storage，不选择时间/停止政策，不拥有连接关闭。
import { sql, type Kysely } from 'kysely'
import type { ClockCheckpoint, Instant } from '@omne-harness-lite/offer-expiry'
import { UniqueViolation, StorageDefect, type Storage } from '@omne-harness-lite/storage'
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
        if ((result.numUpdatedRows ?? 0n) > 0n) return true
        const existing = await db
          .selectFrom(CLOCK_LEASE_TABLE)
          .selectAll()
          .where('id', '=', 1)
          .executeTakeFirst()
        if (!existing || leaseRow(existing).lease_until < leaseUntil)
          throw new StorageDefect('clock reservation row is missing or malformed')
        return false
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

/** Read the legacy floor only for an explicitly requested resource migration. */
export async function readLegacyClockFloor(storage: Storage): Promise<ClockCheckpoint> {
  return storage.read(async tx => {
    const { rows } = await sql<{
      lease_until: number
      written_at: number
    }>`SELECT lease_until,written_at FROM clock_lease WHERE id=1`.execute(tx.db)
    if (!rows[0]) return { writtenAt: 0 as Instant, upperBound: 0 as Instant }
    const row = leaseRow(rows[0])
    return { writtenAt: row.written_at as Instant, upperBound: row.lease_until as Instant }
  })
}
