import { DatabaseSync } from 'node:sqlite'
import type { MigrationPort } from '@omne-harness/sql-contract/worker'
import migration from '../src/migration.ts'

export function openDatabase(path = ':memory:', initialize = true) {
  const db = new DatabaseSync(path)
  db.exec('PRAGMA foreign_keys = ON')
  const port: MigrationPort = {
    execute(sql, params) {
      const statement = db.prepare(sql)
      statement.setReadBigInts(true)
      const columns = statement.columns().map(column => column.name)
      const values = params.map(value => (typeof value === 'boolean' ? Number(value) : value))
      if (columns.length)
        return {
          columns,
          rows: statement.all(...values).map(row => columns.map(column => row[column] ?? null)),
          changes: 0n,
          lastInsertRowid: null,
        }
      const result = statement.run(...values)
      return {
        columns,
        rows: [],
        changes: BigInt(result.changes),
        lastInsertRowid: BigInt(result.lastInsertRowid),
      }
    },
  }
  if (initialize) migration.up(port)
  migration.verify(port)
  return db
}
export function scope(db: DatabaseSync, key = 'scope') {
  db.prepare(
    `INSERT INTO gc_scope VALUES (?, ?, 'deployment', 'service', 'tenant', ?, 'epoch', 'open', 0, 0, 'empty', NULL)`,
  ).run(key, key, key)
}
export function definition(db: DatabaseSync, key = 'definition', version = '1') {
  db.prepare(
    "INSERT INTO gc_definition VALUES (?, 'owner', 'definition', ?, 'digest', 'origin', '{}', 2)",
  ).run(key, version)
}
export function lease(db: DatabaseSync, id: string, definitionKey = 'definition', epoch = 'epoch') {
  db.prepare(
    "INSERT INTO gc_contribution VALUES ('scope', ?, 'contributor', 'generation', ?, 'registrar', ?, 'active', ?)",
  ).run(id, epoch, definitionKey, id)
}
export function member(
  db: DatabaseSync,
  id: string,
  definitionKey = 'definition',
  epoch = 'epoch',
) {
  db.prepare("INSERT INTO gc_member VALUES ('scope', ?, ?, ?)").run(id, definitionKey, epoch)
}
export function support(
  db: DatabaseSync,
  id: string,
  target: string,
  definitionKey = 'definition',
  epoch = 'epoch',
) {
  db.prepare("INSERT INTO gc_member_target VALUES ('scope', ?, ?, ?, ?, '{}')").run(
    id,
    definitionKey,
    epoch,
    target,
  )
}
