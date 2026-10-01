import { expect, test } from 'vitest'
import { manifestImmutable } from '../src/rules/manifest-immutable.ts'
import { REPOSITORY_RULES } from '../src/repository.ts'

const path = 'packages/assets/assembly-manifest-store/src/store.ts'
test.each([
  "db.updateTable('assembly_manifest_record').set({content:'{}'}).execute()",
  "db.deleteFrom('assembly_manifest_table').execute()",
  "db['updateTable']('assembly_manifest_record').execute()",
  'const mutate = db.deleteFrom; mutate(table)',
  'const {updateTable: mutate} = db; mutate(table)',
  "const {['deleteFrom']: mutate} = db; mutate(table)",
  "db.replaceInto('assembly_manifest_record').execute()",
  "db.mergeInto('assembly_manifest_table').execute()",
  "sql`UPDATE assembly_manifest_record SET content='{}'`",
  'renamedSql`DELETE FROM "assembly_manifest_table"`',
  "sql.raw('INSERT OR REPLACE INTO assembly_manifest_record VALUES(1)')",
])('actual mutation AST is rejected: %s', text => {
  expect(manifestImmutable.check([{ path, text }])).not.toEqual([])
})
test.each([
  "db.insertInto('assembly_manifest_record').values(data).execute()",
  "db.selectFrom('assembly_manifest_record').selectAll().execute()",
  "// db.deleteFrom('assembly_manifest_record')\nconst label = 'deleteFrom';",
  "db.schema.createTable('assembly_manifest_record').execute()",
  "sql`evaluation_kind IN ('given','mint','reuse')`",
])('normal append/query/DDL and prose are admitted: %s', text => {
  expect(manifestImmutable.check([{ path, text }])).toEqual([])
})
test('deliberate corruption fixtures stay in tests; repository scan actually includes the rule', () => {
  expect(
    manifestImmutable.check([
      { path: path.replace('/src/', '/tests/'), text: 'db.deleteFrom(table)' },
    ]),
  ).toEqual([])
  expect(REPOSITORY_RULES).toContain(manifestImmutable)
})
