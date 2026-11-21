import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { acceptedDispatch, storeConformanceCases } from '@omne-harness/dispatch/testing'
import migration from '../../src/storage/migration.ts'
import participant from '../../src/storage/participant.ts'
import reader from '../../src/storage/read.ts'
import { TABLES } from '../../src/storage/schema.ts'
import { createInProcessStore, portOf } from './in-process.ts'

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

  it('creates every table it declares, with its three indexes, and verifies them', () => {
    const db = new DatabaseSync(':memory:')
    migration.up(port(db))
    expect(migration.verify(port(db))).toEqual({ kind: 'verified' })
    const named = (type: string) =>
      db
        .prepare('SELECT name FROM sqlite_master WHERE type = ? ORDER BY name')
        .all(type)
        .map(row => (row as { name: string }).name)
        .filter(name => !name.startsWith('sqlite_'))
    expect(named('table')).toEqual([...TABLES].sort())
    expect(named('index')).toEqual([
      'dp_dispatches_dispatcher',
      'dp_dispatches_session',
      'dp_dispatches_unfinished',
    ])
  })

  it('does not verify a database that lacks the table', () => {
    const db = new DatabaseSync(':memory:')
    migration.up(port(db))
    db.exec('DROP TABLE dp_dispatches')
    expect(() => migration.verify(port(db))).toThrow(/dp_dispatches/)
  })
})

describe('what the storage worker is handed', () => {
  const opened = () => {
    const db = new DatabaseSync(':memory:')
    migration.up(portOf(db))
    return db
  }

  it('fails a script it does not know, and a read it does not know', () => {
    const db = opened()
    expect(participant.execute({ script: 'drop', command: null }, portOf(db))).toEqual({
      kind: 'failed',
      diagnostic: 'unknown_dispatch_script',
    })
    expect(reader.read({ read: 'everything', args: [] }, portOf(db))).toEqual({
      kind: 'failed',
      diagnostic: 'invalid_dispatch_read',
    })
    expect(reader.read({ read: 'dispatch' }, portOf(db))).toMatchObject({ kind: 'failed' })
  })

  it('one session is created by one dispatch: a second row for the same session is refused', () => {
    const db = opened()
    const first = acceptedDispatch(1)
    const second = acceptedDispatch(2, { session: first.session })
    const accept = (dispatch: unknown) =>
      participant.execute(
        { script: 'accept', command: JSON.parse(JSON.stringify({ dispatch, maxOpen: 8 })) },
        portOf(db),
      )
    expect(accept(first)).toMatchObject({ kind: 'participated' })
    expect(() => accept(second)).toThrow(/UNIQUE/u)
  })

  it('fails a read of a row that does not fit the schema of a dispatch, instead of answering it', () => {
    const db = opened()
    db.prepare(
      'INSERT INTO dp_dispatches (id, dispatcher, session, state, open, unfinished, accepted_at, record) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run('dsp_x', 'p', 's', 'accepted', 1, 1, 't', '{"state":"lost"}')
    expect(() => reader.read({ read: 'unfinished', args: [] }, portOf(db))).toThrow()
  })
})
