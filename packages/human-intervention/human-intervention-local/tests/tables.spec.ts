import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { z } from 'zod'
import type { MigrationModule, MigrationPort } from '@omne-harness/sql-contract/worker'
import {
  hitlSqlMaterials,
  independentWaitSqlMaterials,
} from '@omne-harness/human-intervention-local'

const hitl = hitlSqlMaterials(),
  wait = independentWaitSqlMaterials()
const participants = [...hitl.participants, ...wait.participants]
const rows = z.array(z.array(z.union([z.string(), z.bigint(), z.null(), z.instanceof(Uint8Array)])))
function port(db: DatabaseSync): MigrationPort {
  return {
    execute(sql, params) {
      const bindings = params.map(value => (typeof value === 'boolean' ? Number(value) : value))
      const stmt = db.prepare(sql)
      stmt.setReadBigInts(true)
      stmt.setReturnArrays(true)
      const columns = stmt.columns().map(column => column.name)
      if (columns.length)
        return {
          columns,
          rows: rows.parse(stmt.all(...bindings)),
          changes: 0n,
          lastInsertRowid: null,
        }
      stmt.run(...bindings)
      return { columns, rows: [], changes: 0n, lastInsertRowid: null }
    },
  }
}

it('registers exactly one migration for every table owner', () => {
  const owners = participants.filter(item => item.ownedTables.length).map(item => item.participant)
  expect([...hitl.migrations, ...wait.migrations].map(item => item.owner).sort()).toEqual(
    owners.sort(),
  )
})

it.each([...hitl.migrations, ...wait.migrations].map(item => [item.owner, item] as const))(
  '%s migration creates exactly the tables its owner declares and verifies them',
  async (owner, migration) => {
    const module = z
      .custom<MigrationModule>(value => typeof value === 'object' && value !== null)
      .parse((await import(migration.moduleUrl)).default)
    const declared = participants.find(item => item.participant === owner)?.ownedTables ?? []
    const db = new DatabaseSync(':memory:')
    try {
      expect(module.verify(port(db)).kind).toBe('failed')
      module.up(port(db))
      expect(module.verify(port(db))).toEqual({ kind: 'verified' })
      const created = db
        .prepare(
          "SELECT name FROM sqlite_schema WHERE type='table' AND name<>'sqlite_sequence' ORDER BY name",
        )
        .all()
        .map(row => String(row.name))
      expect(created).toEqual([...declared].sort())
    } finally {
      db.close()
    }
  },
)

it.each([...hitl.readHandlers, ...wait.readHandlers].map(item => [item.handler, item] as const))(
  '%s read handler requires exactly the migrations of the owners of the tables it reads',
  (_handler, handler) => {
    const migrations = [...hitl.migrations, ...wait.migrations]
    const ownerOf = (table: string) =>
      participants.find(item => item.ownedTables.includes(table))?.participant
    const owners = handler.readTables.map(table => ownerOf(table))
    expect(owners).not.toContain(undefined)
    const expected = migrations
      .filter(migration => owners.includes(migration.owner))
      .map(migration => ({ owner: migration.owner, id: migration.id }))
    expect(expected.length).toBeGreaterThan(0)
    expect(handler.requiresMigrations).toEqual(expected)
  },
)

it('a failed migration verify names every missing table', async () => {
  for (const migration of [...hitl.migrations, ...wait.migrations]) {
    const module = z
      .custom<MigrationModule>(value => typeof value === 'object' && value !== null)
      .parse((await import(migration.moduleUrl)).default)
    const declared = participants.find(item => item.participant === migration.owner)?.ownedTables
    const db = new DatabaseSync(':memory:')
    try {
      expect(module.verify(port(db))).toEqual({
        kind: 'failed',
        diagnostic: `table_missing: ${[...(declared ?? [])].join(',')}`,
      })
    } finally {
      db.close()
    }
  }
})
