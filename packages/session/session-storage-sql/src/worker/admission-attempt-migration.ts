// The migration module of the original attempt of an admission. It requires
// `execution-record/001-execution-record` and adds one table beside `er_admission_idx`; the
// provider runs it in its atomic migration. `up` is `CREATE TABLE IF NOT EXISTS`, so a run on a
// database that already has the table changes nothing.
import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import {
  ADMISSION_ATTEMPT_MIGRATION,
  ADMISSION_ATTEMPT_SCHEMA,
  ADMISSION_ATTEMPT_TABLES,
} from './execution-record-schema.ts'

const migration: MigrationModule = {
  owner: ADMISSION_ATTEMPT_MIGRATION.owner,
  id: ADMISSION_ATTEMPT_MIGRATION.id,
  up(port) {
    for (const statement of ADMISSION_ATTEMPT_SCHEMA) port.execute(statement, [])
  },
  verify(port) {
    const found = port.execute(
      `SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'er_admission_attempt_idx' LIMIT 1`,
      [],
    )
    const names = new Set(found.rows.map(row => String(row[0])))
    const missing = ADMISSION_ATTEMPT_TABLES.filter(name => !names.has(name))
    return missing.length === 0
      ? { kind: 'verified' }
      : { kind: 'failed', diagnostic: `missing tables: ${missing.join(',')}` }
  },
}
export default migration
