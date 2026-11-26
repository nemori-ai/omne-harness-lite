// The reasoning effort of a dispatch, kept beside its fact: a commit after the call released its
// request writes the fact again without it, and the column keeps what the first write had.
import type { MigrationModule, MigrationPort } from '@omne-harness/sql-contract/worker'
import { DISPATCH_FACT } from './fact-schema.ts'
import type { Table } from './schema.ts'

export const FACT_EFFORT_MIGRATION = Object.freeze({
  owner: 'model',
  id: '003-dispatch-fact-effort',
})

/** The dispatch fact table as this release writes and reads it. */
export const DISPATCH_FACT_WRITTEN: Table = {
  ...DISPATCH_FACT,
  columns: [...DISPATCH_FACT.columns, { name: 'effort', kind: 'json', nullable: true }],
}

function verify(port: MigrationPort): ReturnType<MigrationModule['verify']> {
  const found = port.execute(
    `SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = '${DISPATCH_FACT.name}' AND instr(sql, 'effort BLOB') > 0 LIMIT 1`,
    [],
  )
  return found.rows.length === 1
    ? { kind: 'verified' }
    : { kind: 'failed', diagnostic: `missing column: ${DISPATCH_FACT.name}.effort` }
}

export const dispatchFactEffortMigration: MigrationModule = {
  owner: FACT_EFFORT_MIGRATION.owner,
  id: FACT_EFFORT_MIGRATION.id,
  up(port) {
    port.execute(`ALTER TABLE ${DISPATCH_FACT.name} ADD COLUMN effort BLOB`, [])
  },
  verify,
}
export default dispatchFactEffortMigration
