import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import type { MigrationPort } from '@omne-harness/sql-contract/worker'
import migration from '../src/standalone-enablement-migration.ts'

it('adds enabled to old standalone projections while preserving retirement and owner revision', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec('CREATE TABLE st_targets (target_key TEXT PRIMARY KEY, record TEXT NOT NULL)')
    const record = {
      retired: true,
      projection: { ownerRevision: 9, target: { targetRef: 'old-target' } },
    }
    for (let n = 0; n < 65; n++)
      db.prepare('INSERT INTO st_targets VALUES (?, ?)').run(`target-${n}`, JSON.stringify(record))
    const reads: number[] = []
    const port: MigrationPort = {
      execute(sql, values) {
        const statement = db.prepare(sql)
        statement.setReadBigInts(true)
        const params = values.map(value => (typeof value === 'boolean' ? Number(value) : value))
        const columns = statement.columns().map(column => column.name)
        if (columns.length) {
          const rows = statement
            .all(...params)
            .map(row => columns.map(column => row[column] ?? null))
          if (sql.startsWith('SELECT target_key, record')) reads.push(rows.length)
          return { columns, rows, changes: 0n, lastInsertRowid: null }
        }
        const result = statement.run(...params)
        return {
          columns: [],
          rows: [],
          changes: BigInt(result.changes),
          lastInsertRowid: BigInt(result.lastInsertRowid),
        }
      },
    }
    migration.up(port)
    expect(reads).toEqual([64, 1])
    expect(migration.verify(port)).toEqual({ kind: 'verified' })
    const found = db
      .prepare('SELECT record FROM st_targets WHERE target_key=?')
      .get('target-64')?.record
    if (typeof found !== 'string') throw new Error('missing migrated target')
    expect(JSON.parse(found)).toEqual({
      ...record,
      projection: { ...record.projection, enabled: true },
    })
    const before = db.prepare('SELECT * FROM st_targets ORDER BY target_key').all()
    migration.up(port)
    expect(db.prepare('SELECT * FROM st_targets ORDER BY target_key').all()).toEqual(before)
    db.prepare('INSERT INTO st_targets VALUES (?, ?)').run(
      'broken',
      '{"projection":{"enabled":null}}',
    )
    expect(migration.verify(port).kind).toBe('failed')
    expect(() => migration.up(port)).toThrow()
  } finally {
    db.close()
  }
})
