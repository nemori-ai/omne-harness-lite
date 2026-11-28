import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import {
  packText,
  type MigrationPort,
  type QueryRows,
  type SqlValue,
} from '@omne-harness/sql-contract/worker'
import {
  FACT_EFFORT_MIGRATION,
  FACT_MIGRATION,
  MIGRATION,
  TABLES,
  dispatchFactEffortMigration,
  dispatchFactsMigration,
  modelMigration,
} from '@omne-harness/model-storage-sql'

function portOf(db: DatabaseSync): MigrationPort {
  return {
    execute(sql: string, params: readonly SqlValue[]): QueryRows {
      const statement = db.prepare(sql)
      const bound = params.map(value => (typeof value === 'boolean' ? Number(value) : value))
      if (/^\s*SELECT/i.test(sql)) {
        const rows = statement.all(...bound)
        const columns = rows[0] === undefined ? [] : Object.keys(rows[0])
        return {
          columns,
          rows: rows.map(row => columns.map(name => (row[name] ?? null) as never)),
          changes: 0n,
          lastInsertRowid: null,
        }
      }
      return {
        columns: [],
        rows: [],
        changes: BigInt(statement.run(...bound).changes),
        lastInsertRowid: null,
      }
    },
  }
}

function migrated(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  modelMigration.up(portOf(db))
  return db
}

type TableInfo = { name: string; type: string; notnull: number | bigint; pk: number | bigint }

describe('migration 001-model-records', () => {
  it('is owned by the model participant', () => {
    expect(MIGRATION).toEqual({ owner: 'model', id: '001-model-records' })
    expect({ owner: modelMigration.owner, id: modelMigration.id }).toEqual(MIGRATION)
  })

  it('creates exactly md_call, md_dispatch, md_operation, md_part and md_request, all STRICT', () => {
    const db = migrated()
    const tables = db
      .prepare("SELECT name, sql FROM sqlite_schema WHERE type = 'table' ORDER BY name")
      .all() as { name: string; sql: string }[]
    expect(tables.map(table => table.name)).toEqual([
      'md_call',
      'md_dispatch',
      'md_operation',
      'md_part',
      'md_request',
    ])
    for (const table of tables) expect(table.sql).toMatch(/\) STRICT$/)
  })

  it('creates every declared column with its type and nullability, keyed by tenant first', () => {
    const db = migrated()
    for (const table of Object.values(TABLES)) {
      const info = db.prepare(`PRAGMA table_info(${table.name})`).all() as TableInfo[]
      expect(info.map(row => row.name)).toEqual(table.columns.map(item => item.name))
      for (const item of table.columns) {
        const row = info.find(found => found.name === item.name)
        expect(row?.type).toBe({ int: 'INTEGER', text: 'TEXT', json: 'BLOB' }[item.kind])
        expect(Number(row?.notnull)).toBe(item.nullable ? 0 : 1)
      }
      const key = info.filter(row => Number(row.pk) > 0).sort((a, b) => Number(a.pk) - Number(b.pk))
      expect(key.map(row => row.name)).toEqual(table.primaryKey)
      expect(key[0]?.name).toBe('tenant')
    }
  })

  it('refuses a text cell in an INTEGER column', () => {
    const db = migrated()
    expect(() =>
      db
        .prepare(
          'INSERT INTO md_part (tenant, call, seq, block, part, kind, payload) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .run('t', 'c', 0, 'zero', 0, 'append', packText('{}')),
    ).toThrow()
  })

  it('verifies a complete schema and names the table that is missing', () => {
    const db = migrated()
    expect(modelMigration.verify(portOf(db))).toEqual({ kind: 'verified' })
    db.exec('DROP TABLE md_part')
    expect(modelMigration.verify(portOf(db))).toEqual({
      kind: 'failed',
      diagnostic: 'missing tables: md_part',
    })
  })
})

describe('migration 002-dispatch-facts', () => {
  function withFacts(): DatabaseSync {
    const db = migrated()
    dispatchFactsMigration.up(portOf(db))
    return db
  }

  it('is owned by the model participant and comes after the records', () => {
    expect(FACT_MIGRATION).toEqual({ owner: 'model', id: '002-dispatch-facts' })
    expect({ owner: dispatchFactsMigration.owner, id: dispatchFactsMigration.id }).toEqual(
      FACT_MIGRATION,
    )
  })

  it('creates md_dispatch_fact STRICT, with only the moment, the profile and the window nullable, its check and both indexes', () => {
    const db = withFacts()
    const table = db
      .prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'md_dispatch_fact'")
      .get() as { sql: string }
    expect(table.sql).toMatch(/\)\s*STRICT$/)
    const info = db.prepare('PRAGMA table_info(md_dispatch_fact)').all() as TableInfo[]
    expect(info.filter(column => Number(column.notnull) === 0).map(column => column.name)).toEqual([
      'prepared',
      'profile',
      'context_window',
    ])
    const indexes = db
      .prepare(
        "SELECT name FROM sqlite_schema WHERE type = 'index' AND tbl_name = 'md_dispatch_fact' AND sql IS NOT NULL ORDER BY name",
      )
      .all() as { name: string }[]
    expect(indexes.map(index => index.name)).toEqual([
      'md_dispatch_fact_consumer_idx',
      'md_dispatch_fact_prepared_idx',
    ])
    const insert = db.prepare(
      'INSERT INTO md_dispatch_fact (tenant, call, seq, dispatch, prepared, consumer_owner, consumer_work, profile, context_window, fact) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    expect(() =>
      insert.run('t', 'c', -1, 'd', null, 'o', 'w', null, null, packText('{}')),
    ).toThrow()
    insert.run('t', 'c', 0, 'd', null, 'o', 'w', null, null, packText('{}'))
  })

  it('verifies the table and names it when it is missing', () => {
    const db = withFacts()
    expect(dispatchFactsMigration.verify(portOf(db))).toEqual({ kind: 'verified' })
    db.exec('DROP TABLE md_dispatch_fact')
    expect(dispatchFactsMigration.verify(portOf(db))).toEqual({
      kind: 'failed',
      diagnostic: 'missing tables: md_dispatch_fact',
    })
  })
})

describe('migration 003-dispatch-fact-effort', () => {
  function withEffort(): DatabaseSync {
    const db = migrated()
    dispatchFactsMigration.up(portOf(db))
    dispatchFactEffortMigration.up(portOf(db))
    return db
  }

  it('is owned by the model participant and adds one nullable column to the facts', () => {
    expect(FACT_EFFORT_MIGRATION).toEqual({ owner: 'model', id: '003-dispatch-fact-effort' })
    const db = withEffort()
    const info = db.prepare('PRAGMA table_info(md_dispatch_fact)').all() as TableInfo[]
    const effort = info.find(column => column.name === 'effort')
    expect(effort === undefined ? null : [effort.type, Number(effort.notnull)]).toEqual(['BLOB', 0])
    expect(dispatchFactEffortMigration.verify(portOf(db))).toEqual({ kind: 'verified' })
  })

  it('names the column when it is missing', () => {
    const db = migrated()
    dispatchFactsMigration.up(portOf(db))
    expect(dispatchFactEffortMigration.verify(portOf(db))).toEqual({
      kind: 'failed',
      diagnostic: 'missing column: md_dispatch_fact.effort',
    })
  })
})
