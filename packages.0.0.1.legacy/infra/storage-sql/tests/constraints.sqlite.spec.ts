import { expect, it } from 'vitest'
import { UniqueViolation } from '@omne-harness-lite/storage'
import { openStorage } from '../src/index.ts'
import { tempSqliteFile } from './support.ts'

it('P-11/P-2: INTEGER PRIMARY KEY maps the rowid alias and preserves the transaction', async () => {
  const storage = await openStorage({ dialect: 'sqlite', file: tempSqliteFile('integer-pkey') })
  try {
    await storage.write(async tx => {
      await tx.db.schema
        .createTable('integer_key')
        .addColumn('id', 'integer', c => c.primaryKey())
        .execute()
      await tx.db.insertInto('integer_key').values({ id: 1 }).execute()
      for (let attempt = 0; attempt < 2; attempt++) {
        await expect(
          tx.db.insertInto('integer_key').values({ id: 1 }).execute(),
        ).rejects.toMatchObject({
          constructor: UniqueViolation,
          constraint: 'integer_key_pkey',
        })
      }
      await tx.db.insertInto('integer_key').values({ id: 2 }).execute()
    })
    expect(
      await storage.read(tx => tx.db.selectFrom('integer_key').selectAll().orderBy('id').execute()),
    ).toEqual([{ id: 1 }, { id: 2 }])
  } finally {
    await storage.close()
  }
})
