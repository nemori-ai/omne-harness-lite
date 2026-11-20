import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { mediaIndexConformanceCases } from '@omne-harness/media-contract/testing'
import migration from '../src/migration.ts'
import participant from '../src/participant.ts'
import reader from '../src/read.ts'
import { TABLES } from '../src/schema.ts'
import { createInProcessIndex } from './in-process.ts'

describe('the SQL scripts and reads conform to the index contract, in the test process', () => {
  it.each(mediaIndexConformanceCases)('$name', async conformance => {
    await expect(conformance.run(async () => createInProcessIndex())).resolves.toBeUndefined()
  })
})

describe('the modules the storage worker loads', () => {
  const port = (db: DatabaseSync) => ({
    execute(sql: string) {
      db.exec(sql)
      return { columns: [], rows: [], changes: 0n, lastInsertRowid: null }
    },
    requireFact(): never {
      throw new Error('no facts')
    },
    provideFact(): never {
      throw new Error('no facts')
    },
  })

  it('the migration creates every table it declares and verifies them', () => {
    const db = new DatabaseSync(':memory:')
    migration.up(port(db))
    expect(migration.verify(port(db))).toEqual({ kind: 'verified' })
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map(row => (row as { name: string }).name)
    expect(names).toEqual([...TABLES].sort())
  })

  it('the migration does not verify a database that lacks a table', () => {
    const db = new DatabaseSync(':memory:')
    migration.up(port(db))
    db.exec('DROP TABLE md_holds')
    expect(() => migration.verify(port(db))).toThrow(/md_holds/)
  })

  it('a script or a read this member does not know fails, and writes nothing', () => {
    const db = new DatabaseSync(':memory:')
    migration.up(port(db))
    expect(participant.execute({ script: 'dropEverything', command: {} }, port(db))).toEqual({
      kind: 'failed',
      diagnostic: 'unknown_media_script',
    })
    expect(reader.read({ read: 'everything', name: '', limit: 1 }, port(db))).toEqual({
      kind: 'failed',
      diagnostic: 'unknown_media_read',
    })
  })
})
