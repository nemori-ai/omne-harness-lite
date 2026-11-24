// Adds the tables of the calls that left the work snapshot. An existing session needs no backfill:
// the first batch reduced after this migration lets its settled calls leave and writes their rows.
import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import {
  CALL_LEFT_INDICES,
  CALL_LEFT_MIGRATION,
  CALL_LEFT_STATEMENTS,
  CALL_LEFT_TABLES,
} from './call-left.ts'

const migration: MigrationModule = {
  ...CALL_LEFT_MIGRATION,
  up(port) {
    for (const statement of CALL_LEFT_STATEMENTS) port.execute(statement, [])
  },
  verify(port) {
    const found = port.execute(
      'SELECT name FROM sqlite_schema WHERE name IN (?, ?, ?, ?) LIMIT 4',
      [...CALL_LEFT_TABLES, ...CALL_LEFT_INDICES],
    )
    return found.rows.length === 4
      ? { kind: 'verified' }
      : { kind: 'failed', diagnostic: 'the tables of the calls that left are missing' }
  },
}
export default migration
