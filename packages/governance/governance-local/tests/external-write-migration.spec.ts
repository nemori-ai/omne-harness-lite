import { expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { databasePort, scope } from './database.ts'
import migration from '../src/migration.ts'
import recovery from '../src/recovery-migration.ts'
import stages from '../src/sql-stage-migration.ts'
import source from '../src/source-custody-migration.ts'
import external from '../src/external-write-migration.ts'

function oldDatabase() {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys=ON')
  const port = databasePort(db)
  for (const step of [migration, recovery, stages, source]) step.up(port)
  scope(db)
  db.prepare(`INSERT INTO gc_operation
    (scope_key,command_owner,principal_ref,operation_id,request_digest,request_json,accepted_epoch,sql_identity_json,execution_json,held_json,state)
    VALUES ('scope','internal.capture','alice','original','original-digest','{ "original": true }','epoch','{ "identity": 1 }','{ "execution": 2 }','{ "kind": "held" }','submitted')`).run()
  db.prepare(
    "INSERT INTO gc_sql_stage VALUES ('scope','internal.capture','alice','original','apply',?,?)",
  ).run('{ "commands": [ 1, 2 ] }', 'original-envelope-digest')
  db.prepare(
    "INSERT INTO gc_permission_source VALUES ('scope','internal.capture','alice','original',?)",
  ).run('{ "kind": "held", "opaque": [ 3, 4 ] }')
  return { db, port }
}
function records(db: DatabaseSync) {
  return ['gc_operation', 'gc_sql_stage', 'gc_permission_source'].map(table =>
    db.prepare(`SELECT * FROM ${table}`).all(),
  )
}
it('preserves every old byte and foreign key while adding the external owner and restoring the original indexes', () => {
  const { db, port } = oldDatabase()
  try {
    const before = records(db)
    db.exec('BEGIN')
    external.up(port)
    expect(external.verify(port)).toEqual({ kind: 'verified' })
    db.exec('COMMIT')
    expect(records(db)).toEqual(before)
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    expect(
      db.prepare("SELECT name FROM sqlite_schema WHERE name LIKE 'gc_external_%'").all(),
    ).toEqual([])
    db.prepare(`INSERT INTO gc_operation
      (scope_key,command_owner,principal_ref,operation_id,request_digest,request_json,accepted_epoch,sql_identity_json,state)
      VALUES ('scope','internal.external-write','alice','new','digest','{}','epoch','{}','accepted')`).run()
    db.prepare(
      "INSERT INTO gc_permission_source VALUES ('scope','internal.external-write','alice','new',NULL)",
    ).run()
    expect(() =>
      db
        .prepare(
          "INSERT INTO gc_permission_source VALUES ('scope','internal.external-write','alice','missing',NULL)",
        )
        .run(),
    ).toThrow()
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  } finally {
    db.close()
  }
})
it('rolls back the table replacement and original bytes if restoring a child fails', () => {
  const { db, port } = oldDatabase()
  try {
    const before = records(db)
    const schema = db.prepare('SELECT name,sql FROM sqlite_schema ORDER BY name').all()
    db.exec('BEGIN')
    expect(() =>
      external.up({
        execute(sql, params) {
          if (sql.startsWith('INSERT INTO gc_permission_source '))
            throw new Error('injected restore failure')
          return port.execute(sql, params)
        },
      }),
    ).toThrow('injected restore failure')
    db.exec('ROLLBACK')
    expect(records(db)).toEqual(before)
    expect(db.prepare('SELECT name,sql FROM sqlite_schema ORDER BY name').all()).toEqual(schema)
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  } finally {
    db.close()
  }
})
