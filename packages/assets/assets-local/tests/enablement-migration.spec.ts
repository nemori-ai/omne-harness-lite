import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import type { MigrationPort } from '@omne-harness/sql-contract/worker'
import migration from '../src/enablement-migration.ts'

it('migrates bounded keyset pages without changing existing identity, values or disabled records', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(
      'CREATE TABLE al_holdings (scope_key TEXT NOT NULL, holding_ref TEXT NOT NULL, record TEXT NOT NULL, PRIMARY KEY(scope_key, holding_ref))',
    )
    const original = Array.from({ length: 130 }, (_, n) => ({
      scope: `tenant-${n % 2}`,
      holding: `holding-${n}`,
      record: {
        revision: n,
        state: n % 3 === 0 ? 'removed' : 'held',
        selection: { kind: 'pinned', version: 'v1' },
      },
    }))
    for (const row of original)
      db.prepare('INSERT INTO al_holdings VALUES (?, ?, ?)').run(
        row.scope,
        row.holding,
        JSON.stringify(row.record),
      )
    db.prepare('INSERT INTO al_holdings VALUES (?, ?, ?)').run(
      'tenant-1',
      'disabled',
      '{"enabled":false,"revision":8}',
    )
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
          if (sql.startsWith('SELECT scope_key')) reads.push(rows.length)
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
    expect(migration.verify(port)).toEqual({ kind: 'verified' })
    expect(reads).toEqual([64, 64, 3])
    for (const row of original) {
      const found = db
        .prepare('SELECT record FROM al_holdings WHERE scope_key=? AND holding_ref=?')
        .get(row.scope, row.holding)?.record
      if (typeof found !== 'string') throw new Error('missing migrated holding')
      expect(JSON.parse(found)).toEqual({ ...row.record, enabled: true })
    }
    expect(
      db.prepare('SELECT record FROM al_holdings WHERE holding_ref=?').get('disabled')?.record,
    ).toBe('{"enabled":false,"revision":8}')
    const before = db.prepare('SELECT * FROM al_holdings ORDER BY scope_key, holding_ref').all()
    migration.up(port)
    expect(db.prepare('SELECT * FROM al_holdings ORDER BY scope_key, holding_ref').all()).toEqual(
      before,
    )
    db.prepare('INSERT INTO al_holdings VALUES (?, ?, ?)').run(
      'tenant-2',
      'broken',
      '{"enabled":"false"}',
    )
    expect(migration.verify(port).kind).toBe('failed')
    expect(() => migration.up(port)).toThrow()
  } finally {
    db.close()
  }
})
