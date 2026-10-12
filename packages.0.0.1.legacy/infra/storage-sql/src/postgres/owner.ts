// pg 上的属主机制（本程只接线不跑）：排他是一条专用连接上的会话级咨询锁，连接断了锁就没了；
// 没有快照——②③⑥与撤除时的恢复都不存在，确认如实答 snapshotTaken: false（迁移之后撤不回是 tenancy-host 缺口 U-3）。
// 整批待跑迁移一个事务（R-U7）由 Kysely `Migrator` 给：PostgresAdapter.supportsTransactionalDdl = true 且未设
// disableTransactions 时，`#runMigrations` 在一条连接上取迁移锁后 `db.transaction().execute(trx => run(trx))`，
// 全部待跑迁移与其登记插入在同一事务里（kysely 0.29.6 `dist/migration/migrator.js`）。
import pg from 'pg'
import { StorageStartupFailure } from '../upgrade/guard.ts'
import type { OwnerLock, OwnerSite } from '../upgrade/owner.ts'

/** 咨询锁的键名；咨询锁本身按数据库隔离，同一数据库的属主互斥。 */
const OWNER_LOCK_NAME = 'omne-harness-lite/storage-sql/owner'

export class PostgresOwnerSite implements OwnerSite {
  readonly location = undefined

  constructor(private readonly connectionString: string) {}

  async acquire(): Promise<OwnerLock> {
    const client = new pg.Client({ connectionString: this.connectionString })
    await client.connect()
    let locked: boolean
    try {
      const result = await client.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
        [OWNER_LOCK_NAME],
      )
      locked = result.rows[0]?.locked === true
    } catch (error) {
      await client.end()
      throw error
    }
    if (!locked) {
      await client.end()
      throw new StorageStartupFailure(
        'occupied',
        'another owner instance holds the session advisory lock on this database',
      )
    }
    return {
      async release() {
        try {
          await client.query('SELECT pg_advisory_unlock(hashtext($1))', [OWNER_LOCK_NAME])
        } finally {
          await client.end()
        }
      },
    }
  }

  async recoverLeftovers(): Promise<void> {}

  async markIfAbsent(): Promise<boolean> {
    return false
  }

  async restore(): Promise<void> {}

  async snapshotOnDisk(): Promise<boolean> {
    return false
  }

  async removeSnapshot(): Promise<boolean> {
    return false
  }
}
