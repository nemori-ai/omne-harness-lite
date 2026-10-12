import { dirname } from 'node:path'
import { rm } from 'node:fs/promises'
import { sql } from 'kysely'
import { expect, it } from 'vitest'
import { StorageUnavailable } from '@omne-harness-lite/storage'
import { openStorage } from '../src/index.ts'
import { tempSqliteFile } from './support.ts'

it('real SQLITE_FULL is unavailable, rolls back and does not poison the next transaction', async () => {
  const file = tempSqliteFile('capacity')
  const storage = await openStorage({ dialect: 'sqlite', file, synchronous: 'full' })
  try {
    await storage.write(async tx => {
      await tx.db.schema
        .createTable('capacity')
        .addColumn('id', 'integer', c => c.primaryKey())
        .addColumn('value', 'text', c => c.notNull())
        .execute()
      await tx.db.insertInto('capacity').values({ id: 1, value: 'original' }).execute()
      const pages = (await sql<{ page_count: number }>`PRAGMA page_count`.execute(tx.db)).rows[0]!
        .page_count
      await sql.raw(`PRAGMA max_page_count = ${pages}`).execute(tx.db)
    })
    await expect(
      storage.atomic(unit =>
        unit.mutate(async tx => {
          await tx.db
            .updateTable('capacity')
            .set({ value: 'x'.repeat(1024 * 1024) })
            .where('id', '=', 1)
            .execute()
        }),
      ),
    ).rejects.toMatchObject({
      constructor: StorageUnavailable,
      cause: { code: 'ERR_SQLITE_ERROR', errcode: 13 },
    })
    expect(await storage.read(tx => tx.db.selectFrom('capacity').selectAll().execute())).toEqual([
      { id: 1, value: 'original' },
    ])
    await storage.write(async tx => {
      await tx.db.updateTable('capacity').set({ value: 'recovered' }).where('id', '=', 1).execute()
    })
    expect(
      await storage.read(tx => tx.db.selectFrom('capacity').select('value').execute()),
    ).toEqual([{ value: 'recovered' }])
  } finally {
    await storage.close()
    await rm(dirname(file), { recursive: true, force: true })
  }
})
