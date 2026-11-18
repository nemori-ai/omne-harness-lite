import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { storeConformanceCases } from '@omne-harness/notification/testing'
import migration from '../../src/storage/migration.ts'
import { TABLES } from '../../src/storage/schema.ts'
import { createInProcessStore } from './in-process.ts'

describe('the SQL scripts and reads conform to the repository contract, in the test process', () => {
  it.each(storeConformanceCases)('$name', async conformance => {
    await expect(conformance.run(async () => createInProcessStore())).resolves.toBeUndefined()
  })
})

describe('the migration', () => {
  const port = (db: DatabaseSync) => ({
    execute(sql: string) {
      db.exec(sql)
      return { columns: [], rows: [], changes: 0n, lastInsertRowid: null }
    },
  })

  it('creates every table it declares and verifies them', () => {
    const db = new DatabaseSync(':memory:')
    migration.up(port(db))
    expect(migration.verify(port(db))).toEqual({ kind: 'verified' })
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map(row => (row as { name: string }).name)
    expect(names).toEqual([...TABLES].sort())
  })

  it('does not verify a database that lacks a table', () => {
    const db = new DatabaseSync(':memory:')
    migration.up(port(db))
    db.exec('DROP TABLE nt_units')
    expect(() => migration.verify(port(db))).toThrow(/nt_units/)
  })
})
