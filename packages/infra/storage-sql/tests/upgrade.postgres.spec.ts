// pg 上的升级守卫：本程只接线不跑（无可连的 pg）。需要 OMNE_TEST_PG_URL 指向一个**空库**（迁移登记在库里、跨次运行不清）。
// 跳过不是通过（verification 登记）。
import { sql } from 'kysely'
import { describe, expect, it } from 'vitest'
import { StorageStartupFailure, createUpgradeGuard, openStorage } from '../src/index.ts'
import { migrationsOf } from './fixtures/migrations.ts'

const url = process.env['OMNE_TEST_PG_URL']
const describePg = url === undefined ? describe.skip : describe

describePg('upgrade · postgres（缺 OMNE_TEST_PG_URL 时未运行）', () => {
  const connectionString = url ?? ''

  it('upgrade.pg-single-transaction：第二个迁移失败 ⇒ 登记与 schema 都回到迁移前', async () => {
    const guard = createUpgradeGuard()
    const error = await openStorage({
      dialect: 'postgres',
      connectionString,
      migrations: migrationsOf('pg_upgrade_a', 'fail'),
      upgrade: { checks: [], guard },
    }).then(
      () => undefined,
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(StorageStartupFailure)
    expect((error as StorageStartupFailure).stage).toBe('migration')
    const plain = await openStorage({ dialect: 'postgres', connectionString, upgrade: false })
    const tables = await plain.read(
      async tx =>
        (
          await sql<{
            name: string
          }>`SELECT table_name AS name FROM information_schema.tables WHERE table_schema = current_schema()`.execute(
            tx.db,
          )
        ).rows,
    )
    expect(tables.map(t => t.name)).not.toContain('pg_upgrade_a')
    const registered = tables.some(t => t.name === 'kysely_migration')
      ? await plain.read(
          async tx => (await sql`SELECT name FROM kysely_migration`.execute(tx.db)).rows,
        )
      : []
    expect(registered).toEqual([])
    await plain.close()
  })

  it('upgrade.confirm（pg 支）：跑过迁移 ⇒ { migrated: true, snapshotTaken: false, snapshotRemoved: false }、不抛（U-3）', async () => {
    const guard = createUpgradeGuard()
    const storage = await openStorage({
      dialect: 'postgres',
      connectionString,
      migrations: migrationsOf('pg_upgrade_a'),
      upgrade: { checks: [], guard },
    })
    expect(await guard.confirm()).toEqual({
      migrated: true,
      snapshotTaken: false,
      snapshotRemoved: false,
    })
    expect(await guard.pending()).toBe('clear')
    await storage.close()
  })
})
