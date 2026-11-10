import { selectedTargetSql } from '../src/target-projection-participant.ts'
import { currentDefinitionSizeSql } from '../src/current-definition.ts'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, it } from 'vitest'
import { currentCandidatesSql } from '../src/candidates.ts'
import { GOVERNANCE_TABLES } from '../src/migration.ts'
import { openDatabase, scope, definition, lease, member, support } from './database.ts'
const databases: DatabaseSync[] = []
const roots: string[] = []
afterEach(() => {
  for (const db of databases.splice(0)) db.close()
  for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true })
})
function setup() {
  const db = openDatabase()
  databases.push(db)
  scope(db)
  definition(db)
  return db
}
it('installs strict relations on disk and preserves exact rows after reopening', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'governance-schema-')))
  roots.push(root)
  const file = join(root, 'governance.sqlite')
  const db = openDatabase(file)
  scope(db)
  definition(db)
  lease(db, 'left')
  member(db, 'left')
  support(db, 'left', 'a')
  const tables = db
    .prepare('PRAGMA table_list')
    .all()
    .filter(row => GOVERNANCE_TABLES.includes(String(row.name)))
  expect(tables).toHaveLength(9)
  expect(tables.every(row => row.strict === 1 && row.wr === 1)).toBe(true)
  db.close()
  const reopened = openDatabase(file, false)
  databases.push(reopened)
  expect(
    reopened.prepare('SELECT registration_id, target_key FROM gc_member_target').all(),
  ).toEqual([{ registration_id: 'left', target_key: 'a' }])
  expect(reopened.prepare('PRAGMA foreign_key_check').all()).toEqual([])
})
it('rejects definition aliases and orphan or mismatched support bindings', () => {
  const db = setup()
  expect(() => definition(db, 'alias')).toThrow(/UNIQUE constraint/)
  definition(db, 'next', '2')
  lease(db, 'left')
  member(db, 'left')
  expect(() => member(db, 'absent')).toThrow(/FOREIGN KEY constraint/)
  expect(() => support(db, 'left', 'a', 'next')).toThrow(/FOREIGN KEY constraint/)
  expect(() => support(db, 'left', 'a', 'definition', 'old')).toThrow(/FOREIGN KEY constraint/)
  support(db, 'left', 'a')
  expect(() => support(db, 'left', 'a')).toThrow(/UNIQUE constraint/)
  expect(() => db.prepare("DELETE FROM gc_member WHERE registration_id='left'").run()).toThrow(
    /FOREIGN KEY constraint/,
  )
  expect(() =>
    db
      .prepare("INSERT INTO gc_item VALUES ('definition','permission','run',NULL,'call','{}')")
      .run(),
  ).toThrow(/CHECK constraint/)
})
it('represents separate and shared lease-target support without collapsing sibling registrations', () => {
  const db = setup()
  for (const id of ['left', 'right']) {
    lease(db, id)
    member(db, id)
  }
  support(db, 'left', 'a')
  support(db, 'left', 'shared')
  support(db, 'right', 'b')
  support(db, 'right', 'shared')
  const targets = () =>
    db
      .prepare(
        "SELECT DISTINCT target_key FROM gc_member_target WHERE scope_key='scope' AND epoch='epoch' AND definition_key='definition' ORDER BY target_key",
      )
      .all()
      .map(row => row.target_key)
  expect(targets()).toEqual(['a', 'b', 'shared'])
  db.prepare(
    "DELETE FROM gc_member_target WHERE scope_key='scope' AND registration_id='left'",
  ).run()
  db.prepare("DELETE FROM gc_member WHERE scope_key='scope' AND registration_id='left'").run()
  expect(targets()).toEqual(['b', 'shared'])
  expect(db.prepare('SELECT registration_id FROM gc_member').all()).toEqual([
    { registration_id: 'right' },
  ])
})
it('allows compatible definitions to support one target while fencing mismatched selected epochs', () => {
  const db = setup()
  definition(db, 'other', '2')
  for (const key of ['definition', 'other']) {
    db.prepare("INSERT INTO gc_selected_definition VALUES ('scope',?,'epoch')").run(key)
    db.prepare(
      "INSERT INTO gc_selected_target VALUES ('scope',?,'same','epoch','origin','{}')",
    ).run(key)
  }
  expect(
    db.prepare('SELECT definition_key FROM gc_selected_target ORDER BY definition_key').all(),
  ).toEqual([{ definition_key: 'definition' }, { definition_key: 'other' }])
  expect(() =>
    db
      .prepare(
        "INSERT INTO gc_selected_target VALUES ('scope','definition','old','old','origin','{}')",
      )
      .run(),
  ).toThrow(/FOREIGN KEY constraint/)
})
it('separates pending from final operations and enforces complete submitted envelopes', () => {
  const db = setup()
  const insert = db.prepare(
    "INSERT INTO gc_operation (scope_key,command_owner,principal_ref,operation_id,request_digest,request_json,accepted_epoch,sql_identity_json,state) VALUES ('scope',?,'alice',?,'digest','{}','epoch','{}','accepted')",
  )
  insert.run('contribute', 'one')
  insert.run('adopt', 'one')
  expect(() => insert.run('contribute', 'one')).toThrow(/UNIQUE constraint/)
  expect(() => insert.run('unknown', 'one')).toThrow(/CHECK constraint/)
  expect(() => db.prepare("UPDATE gc_operation SET state='submitted'").run()).toThrow(
    /CHECK constraint/,
  )
  expect(() => db.prepare("UPDATE gc_operation SET result_json='{}'").run()).toThrow(
    /CHECK constraint/,
  )
  db.prepare(
    "UPDATE gc_operation SET state='submitted', execution_json='{}' WHERE command_owner='contribute'",
  ).run()
  expect(() =>
    db.prepare("UPDATE gc_operation SET state='committed' WHERE command_owner='contribute'").run(),
  ).toThrow(/CHECK constraint/)
  db.prepare(
    "UPDATE gc_operation SET state='committed',result_json='{}' WHERE command_owner='contribute'",
  ).run()
  db.prepare(
    "UPDATE gc_operation SET state='aborted',result_json='{}' WHERE command_owner='adopt'",
  ).run()
  expect(db.prepare('SELECT state FROM gc_operation ORDER BY command_owner').all()).toEqual([
    { state: 'aborted' },
    { state: 'committed' },
  ])
})
it('uses bounded pending and current-support index paths in the presence of historical rows', () => {
  const db = setup()
  db.exec('BEGIN')
  const insert = db.prepare(
    "INSERT INTO gc_operation VALUES ('scope','adopt','alice',?,'digest','{}','old','{}','{}',NULL,'committed','{}')",
  )
  for (let i = 0; i < 10000; i++) insert.run('old-' + String(i).padStart(5, '0'))
  db.prepare(
    "INSERT INTO gc_operation VALUES ('scope','adopt','alice','pending','digest','{}','epoch','{}',NULL,NULL,'accepted',NULL)",
  ).run()
  db.exec('COMMIT')
  const pending =
    "SELECT operation_id FROM gc_operation INDEXED BY gc_operation_pending WHERE scope_key=? AND state IN ('accepted','submitted') AND (command_owner,principal_ref,operation_id) > (?,?,?) ORDER BY command_owner,principal_ref,operation_id LIMIT 100"
  const plan = (sql: string, params: string[]) =>
    db
      .prepare('EXPLAIN QUERY PLAN ' + sql)
      .all(...params)
      .map(row => row.detail)
      .join('\n')
  expect(plan(pending, ['scope', '', '', ''])).toMatch(
    /SEARCH gc_operation USING (?:COVERING )?INDEX gc_operation_pending/,
  )
  expect(db.prepare(pending).all('scope', '', '', '')).toEqual([{ operation_id: 'pending' }])
  expect(
    plan(
      'SELECT registration_id FROM gc_member_target WHERE scope_key=? AND epoch=? AND definition_key=? AND target_key=? LIMIT 128',
      ['scope', 'epoch', 'definition', 'a'],
    ),
  ).toContain('gc_member_target_support')
  expect(
    plan(
      "SELECT registration_id FROM gc_contribution WHERE scope_key=? AND epoch=? AND state='active' ORDER BY definition_key,registration_id LIMIT 129",
      ['scope', 'epoch'],
    ),
  ).toContain('gc_contribution_current')
})

it('uses the production candidate join to exclude ten thousand old-epoch leases', () => {
  const db = setup()
  db.exec('BEGIN')
  const insert = db.prepare(
    "INSERT INTO gc_contribution VALUES ('scope',?,'publisher','generation','old','alice','definition','active',?)",
  )
  for (let i = 0; i < 10000; i++) insert.run('old-' + i, 'old-' + i)
  lease(db, 'current')
  db.exec('COMMIT')
  const plan = db
    .prepare('EXPLAIN QUERY PLAN ' + currentCandidatesSql)
    .all('scope', 'epoch')
    .map(row => row.detail)
    .join('\n')
  expect(plan).toMatch(/SEARCH c USING (?:COVERING )?INDEX gc_contribution_current/)
  expect(plan).toMatch(/SEARCH d USING PRIMARY KEY/)
  expect(plan).not.toMatch(/SCAN (?:c|d)\b/)
  const targetDefinitionPlan = db
    .prepare('EXPLAIN QUERY PLAN ' + currentDefinitionSizeSql)
    .all('scope', 'epoch', 'definition')
    .map(row => row.detail)
    .join('\n')
  expect(targetDefinitionPlan).toMatch(/SEARCH c USING (?:COVERING )?INDEX gc_contribution_current/)
  expect(targetDefinitionPlan).toMatch(/SEARCH d USING PRIMARY KEY/)
  expect(targetDefinitionPlan).not.toMatch(/SCAN (?:c|d)\b/)
  expect(db.prepare(currentDefinitionSizeSql).all('scope', 'epoch', 'definition')).toHaveLength(1)
  const selectedPlan = db
    .prepare('EXPLAIN QUERY PLAN ' + selectedTargetSql)
    .all('scope', 'definition', 'target', 'epoch')
    .map(row => row.detail)
    .join('\n')
  expect(selectedPlan).toMatch(/SEARCH gc_selected_target USING PRIMARY KEY/)
  expect(selectedPlan).not.toMatch(/SCAN gc_selected_target/)

  expect(
    db
      .prepare(currentCandidatesSql)
      .all('scope', 'epoch')
      .map(row => row.registration_id),
  ).toEqual(['current'])
})
