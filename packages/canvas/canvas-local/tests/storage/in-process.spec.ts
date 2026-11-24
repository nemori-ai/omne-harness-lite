import { DatabaseSync } from 'node:sqlite'
import type { ParticipantModule, SqlValue } from '@omne-harness/sql-contract/worker'
import { describe, expect, it } from 'vitest'
import { storeConformanceCases, tenantOf } from '@omne-harness/canvas/testing'
import { MAIN_CANVAS, type Item } from '@omne-harness/canvas-contract'
import migration from '../../src/storage/migration.ts'
import participant from '../../src/storage/participant.ts'
import reader from '../../src/storage/read.ts'
import { sqlFacts } from '../../src/storage/facts.ts'
import { ROW_LIMIT, TABLES } from '../../src/storage/schema.ts'
import { createInProcessStore, migrated, portOf } from './in-process.ts'

const AT = '2026-11-24T06:00:00.000Z'

describe('the SQL reads conform to the store contract, in the test process', () => {
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

  it('creates the three tables at once and verifies them', () => {
    const db = new DatabaseSync(':memory:')
    migration.up(port(db))
    expect(migration.verify(port(db))).toEqual({ kind: 'verified' })
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map(row => (row as { name: string }).name)
    expect(tables).toEqual([...TABLES].sort())
    const columns = db
      .prepare("SELECT name FROM pragma_table_info('canvas_item')")
      .all()
      .map(row => (row as { name: string }).name)
    expect(columns).toEqual(
      expect.arrayContaining(['locked', 'pile', 'rank', 'by_kind', 'changed_at']),
    )
  })

  it.each(TABLES)('does not verify a database that lacks %s', table => {
    const db = new DatabaseSync(':memory:')
    migration.up(port(db))
    db.exec(`DROP TABLE ${table}`)
    expect(() => migration.verify(port(db))).toThrow(new RegExp(table))
  })
})

const insertItem = (db: DatabaseSync, values: Record<string, unknown>) => {
  const row = {
    tenant: 't1',
    canvas: 'main',
    id: 'i1',
    kind: 'media.object',
    ref: 'o1',
    state: 'on',
    x: 8,
    y: 16,
    width: null,
    height: null,
    rank: 1,
    pile: null,
    locked: 0,
    by_kind: 'human',
    by_session: null,
    changed_at: AT,
    ...values,
  }
  const names = Object.keys(row)
  db.prepare(
    `INSERT INTO canvas_item (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
  ).run(...(Object.values(row) as never[]))
}

const look = (db: DatabaseSync, tenant = 't1') =>
  reader.read({ read: 'look', tenant, canvas: 'main' }, portOf(db))

describe('the tables', () => {
  it('refuse a second item of a reference written past the domain', () => {
    const db = migrated()
    const facts = sqlFacts(portOf(db), 't1')
    const item = {
      id: 'i1',
      reference: { kind: 'media.object', ref: 'o1' },
      state: 'on',
      at: { x: 0, y: 0 },
      size: null,
      rank: 1,
      pile: null,
      locked: false,
      by: { kind: 'human' },
      when: AT,
    } as unknown as Item
    facts.putItem(MAIN_CANVAS, item)
    facts.putItem(MAIN_CANVAS, { ...item, rank: 2 })
    expect(() => facts.putItem(MAIN_CANVAS, { ...item, id: 'i2' as Item['id'] })).toThrow(/UNIQUE/u)
    expect(facts.items(MAIN_CANVAS, 'on')).toMatchObject([{ id: 'i1', rank: 2 }])
  })

  it('hold one item for one reference on a canvas', () => {
    const db = migrated()
    insertItem(db, {})
    expect(() => insertItem(db, { id: 'i2' })).toThrow(/UNIQUE/u)
    insertItem(db, { id: 'i3', tenant: 't2' })
    insertItem(db, { id: 'i4', ref: 'o2' })
  })
})

describe('the read of a canvas', () => {
  it('gives every column of an item back, the items on the sheet only, and the piles', () => {
    const db = migrated()
    db.prepare(
      'INSERT INTO canvas_head (tenant, canvas, revision, next_rank) VALUES (?, ?, ?, ?)',
    ).run('t1', 'main', 5, 9)
    insertItem(db, {
      width: 160,
      height: 80,
      pile: 'p1',
      rank: 4,
      by_kind: 'agent',
      by_session: 's-1',
    })
    insertItem(db, { id: 'i2', ref: 'o2', locked: 1, rank: 2 })
    insertItem(db, { id: 'i3', ref: 'o3', state: 'off' })
    db.prepare(
      'INSERT INTO canvas_pile (tenant, canvas, id, name, x, y, by_kind, by_session, changed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run('t1', 'main', 'p1', '下周', 8, 16, 'human', null, AT)
    expect(look(db)).toEqual({
      kind: 'read',
      output: {
        revision: 5,
        items: [
          {
            id: 'i2',
            reference: { kind: 'media.object', ref: 'o2' },
            state: 'on',
            at: { x: 8, y: 16 },
            size: null,
            rank: 2,
            pile: null,
            locked: true,
            by: { kind: 'human' },
            when: AT,
          },
          {
            id: 'i1',
            reference: { kind: 'media.object', ref: 'o1' },
            state: 'on',
            at: { x: 8, y: 16 },
            size: { width: 160, height: 80 },
            rank: 4,
            pile: 'p1',
            locked: false,
            by: { kind: 'agent', session: 's-1' },
            when: AT,
          },
        ],
        piles: [{ id: 'p1', name: '下周', at: { x: 8, y: 16 }, by: { kind: 'human' }, when: AT }],
      },
    })
  })

  it('reads the rows of the tenant it is asked for, and no other', () => {
    const db = migrated()
    insertItem(db, { tenant: 't2' })
    expect(look(db)).toEqual({ kind: 'read', output: { revision: 0, items: [], piles: [] } })
    expect(look(db, 't2')).toMatchObject({ output: { items: [{ id: 'i1' }] } })
  })

  it('fails on a row that does not fit an item, instead of answering it', () => {
    for (const broken of [
      { width: 160 },
      { by_kind: 'system' },
      { x: -1 },
      { changed_at: 'now' },
    ]) {
      const db = migrated()
      insertItem(db, broken)
      expect(() => look(db)).toThrow()
    }
  })

  it('fails a read it does not know, and a script it does not know', () => {
    const db = migrated()
    expect(reader.read({ read: 'everything', tenant: 't1', canvas: 'main' }, portOf(db))).toEqual({
      kind: 'failed',
      diagnostic: 'invalid_canvas_read',
    })
    expect(reader.read({ read: 'look', tenant: 't1', canvas: 'other' }, portOf(db))).toMatchObject({
      kind: 'failed',
    })
    const execute: ParticipantModule['execute'] = participant.execute
    expect(execute({ script: 'everything', tenant: 't1', command: null }, portOf(db))).toEqual({
      kind: 'failed',
      diagnostic: 'unknown_canvas_script',
    })
  })

  it('is what the store answers for the tenant', async () => {
    const databases = new Map<string, DatabaseSync>()
    const db = migrated()
    insertItem(db, { tenant: 't1' })
    databases.set('t1', db)
    expect(await createInProcessStore(databases).look(tenantOf('t1'), 'main')).toMatchObject({
      kind: 'read',
      value: { items: [{ id: 'i1' }] },
    })
  })
})

describe('the rows as they are read', () => {
  /** A port that answers every statement with the one row given, as a storage that gives such columns would. */
  const giving = (row: readonly unknown[]) => ({
    execute: () => ({ columns: [], rows: [row as never], changes: 0n, lastInsertRowid: null }),
  })
  const ROW = ['i1', 'media.object', 'o1', 'on', 8, 16, null, null, 1, null, 0, 'human', null, AT]

  it('takes integers given as numbers as well as big integers', () => {
    const db = migrated()
    insertItem(db, { width: 160, height: 80 })
    const numbers = {
      execute(sql: string, params: readonly SqlValue[]) {
        const statement = db.prepare(sql)
        statement.setReturnArrays(true)
        return {
          columns: [],
          rows: statement.all(...(params as never[])) as never[],
          changes: 0n,
          lastInsertRowid: null,
        }
      },
    }
    expect(sqlFacts(numbers, 't1').items(MAIN_CANVAS, 'on')).toMatchObject([
      { at: { x: 8, y: 16 }, size: { width: 160, height: 80 }, rank: 1, locked: false },
    ])
    expect(sqlFacts(giving(ROW), 't1').items(MAIN_CANVAS, 'on')).toMatchObject([
      { at: { x: 8, y: 16 }, size: null },
    ])
  })

  it.each<[string, Readonly<Record<number, unknown>>]>([
    ['a number written as text', { 4: '8' }],
    ['a height without a width', { 6: null, 7: 80 }],
  ])('fails on %s', (_name, changes) => {
    const row = ROW.map((value, column) => (column in changes ? changes[column] : value))
    expect(() => sqlFacts(giving(row), 't1').items(MAIN_CANVAS, 'on')).toThrow()
  })

  it('fails a read that reaches past the row limit, and gives one that reaches it whole', () => {
    const db = migrated()
    const fill = (from: number, to: number) =>
      db
        .prepare(
          `WITH RECURSIVE n(i) AS (SELECT ? UNION ALL SELECT i + 1 FROM n WHERE i < ?)
           INSERT INTO canvas_item (tenant, canvas, id, kind, ref, state, x, y, rank, locked, by_kind, changed_at)
           SELECT 't1', 'main', 'i' || i, 'media.object', 'o' || i, 'on', 0, 0, i, 0, 'human', ? FROM n`,
        )
        .run(from, to, AT)
    fill(1, ROW_LIMIT)
    expect(sqlFacts(portOf(db), 't1').items(MAIN_CANVAS, 'on')).toHaveLength(ROW_LIMIT)
    fill(ROW_LIMIT + 1, ROW_LIMIT + 1)
    expect(() => sqlFacts(portOf(db), 't1').items(MAIN_CANVAS, 'on')).toThrow(/more rows/u)
  })
})

describe('the participant', () => {
  it('fails a known script for a tenant that is no text', () => {
    const execute: ParticipantModule['execute'] = participant.execute
    expect(execute({ script: 'take', tenant: 7, command: null }, portOf(migrated()))).toEqual({
      kind: 'failed',
      diagnostic: 'unknown_canvas_script',
    })
  })
})

describe('the migration, through a port that binds what it is given', () => {
  it('verifies the tables it made', () => {
    const db = new DatabaseSync(':memory:')
    migration.up(portOf(db))
    expect(migration.verify(portOf(db))).toEqual({ kind: 'verified' })
  })
})
