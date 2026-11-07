import { expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { openDatabase, databasePort, scope } from './database.ts'
import migration from '../src/migration.ts'
import recoveryMigration from '../src/recovery-migration.ts'
import stageMigration from '../src/sql-stage-migration.ts'
import sourceMigration from '../src/source-custody-migration.ts'
import { openOperations, command, binding, scope as governanceScope } from './operation-world.ts'
import { capture } from './permission-capture-world.ts'

it('installs durable source custody and both source receipt stages', () => {
  const db = openDatabase()
  try {
    expect(() =>
      db.prepare('SELECT receipt_json FROM gc_permission_source LIMIT 0').all(),
    ).not.toThrow()
    const table = db.prepare("SELECT sql FROM sqlite_schema WHERE name='gc_sql_stage'").get()
    expect(table?.sql).toContain("'source-held'")
    expect(table?.sql).toContain("'source-settled'")
  } finally {
    db.close()
  }
})

it('upgrades a real Worker domain under a new combination and retains the original operation', async () => {
  let w = await openOperations(undefined, { legacySchema: true })
  try {
    await w.call({
      kind: 'bootstrap',
      input: { scope: governanceScope, epoch: 'first', previousEpoch: null },
    })
    const original = command('before-upgrade')
    const saved = await w.call({ kind: 'accept', input: original })
    await w.close(false)
    w = await openOperations(w.root)
    expect(await w.call({ kind: 'read', ref: binding(original).ref })).toEqual(saved)
    const permission = capture()
    expect(await w.call({ kind: 'accept', input: permission })).toMatchObject({ kind: 'found' })
    expect(await w.call({ kind: 'source-read', binding: binding(permission) })).toMatchObject({
      kind: 'requested',
    })
  } finally {
    await w.close()
  }
})

it('preserves original operation and envelope bytes while extending the stage constraint', () => {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys=ON')
  const port = databasePort(db)
  try {
    for (const step of [migration, recoveryMigration, stageMigration]) step.up(port)
    scope(db)
    db.prepare(`INSERT INTO gc_operation
      (scope_key,command_owner,principal_ref,operation_id,request_digest,request_json,accepted_epoch,sql_identity_json,state)
      VALUES ('scope','contribute','alice','original','digest','{ "original": true }','epoch','{}','accepted')`).run()
    const stages = [
      'standing-prepare',
      'standing-held',
      'submit',
      'apply',
      'seal',
      'standing-seal',
      'standing-settled',
    ]
    for (const stage of stages)
      db.prepare(
        "INSERT INTO gc_sql_stage VALUES ('scope','contribute','alice','original',?,?,?)",
      ).run(stage, '{ "saved": "' + stage + '" }', stage + '-digest')
    const operation = db.prepare('SELECT * FROM gc_operation').all()
    const envelopes = db.prepare('SELECT * FROM gc_sql_stage ORDER BY stage').all()
    sourceMigration.up(port)
    expect(sourceMigration.verify(port)).toEqual({ kind: 'verified' })
    expect(db.prepare('SELECT * FROM gc_operation').all()).toEqual(operation)
    expect(db.prepare('SELECT * FROM gc_sql_stage ORDER BY stage').all()).toEqual(envelopes)
    expect(
      db.prepare("SELECT name FROM sqlite_schema WHERE name='gc_sql_stage_upgrade'").all(),
    ).toEqual([])
    for (const stage of ['source-held', 'source-settled'])
      db.prepare(
        "INSERT INTO gc_sql_stage VALUES ('scope','contribute','alice','original',?,'{}','digest')",
      ).run(stage)
    expect(() =>
      db
        .prepare(
          "INSERT INTO gc_sql_stage VALUES ('scope','contribute','alice','original','unknown','{}','digest')",
        )
        .run(),
    ).toThrow(/CHECK/)
    expect(() =>
      db
        .prepare(
          "INSERT INTO gc_sql_stage VALUES ('scope','contribute','alice','missing','seal','{}','digest')",
        )
        .run(),
    ).toThrow(/FOREIGN KEY/)
    expect(() =>
      db
        .prepare(
          "INSERT INTO gc_sql_stage VALUES ('scope','contribute','alice','original','seal','{}','digest')",
        )
        .run(),
    ).toThrow(/UNIQUE/)
    expect(recoveryMigration.verify(port)).toEqual({ kind: 'verified' })
  } finally {
    db.close()
  }
})
