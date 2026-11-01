// The migration of the Model tables on node:sqlite: it creates exactly the four tables, STRICT,
// keyed by tenant first, with the declared columns, and its verify step notices a missing table.
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import type { MigrationPort, QueryRows, SqlValue } from '@omne-harness/sql-contract/worker'
import { MIGRATION, TABLES, modelMigration } from '@omne-harness/model-storage-sql'

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

  it('creates exactly md_call, md_dispatch, md_part and md_operation, all STRICT', () => {
    const db = migrated()
    const tables = db
      .prepare("SELECT name, sql FROM sqlite_schema WHERE type = 'table' ORDER BY name")
      .all() as { name: string; sql: string }[]
    expect(tables.map(table => table.name)).toEqual([
      'md_call',
      'md_dispatch',
      'md_operation',
      'md_part',
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
        expect(row?.type).toBe(item.kind === 'int' ? 'INTEGER' : 'TEXT')
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
        .run('t', 'c', 0, 'zero', 0, 'append', '{}'),
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
