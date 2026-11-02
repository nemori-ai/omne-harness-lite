// The migration module of the preadmission records of the execution record participant. It requires
// `execution-record/001-execution-record` and adds one table; the provider runs it in its atomic
// migration.
import type { MigrationModule } from '@omne-harness/sql-contract/worker'
import {
  PREADMISSION_MIGRATION,
  PREADMISSION_SCHEMA,
  PREADMISSION_TABLES,
} from './execution-record-schema.ts'

const migration: MigrationModule = {
  owner: PREADMISSION_MIGRATION.owner,
  id: PREADMISSION_MIGRATION.id,
  up(port) {
    for (const statement of PREADMISSION_SCHEMA) port.execute(statement, [])
  },
  verify(port) {
    const found = port.execute(
      `SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'er_preadmission' LIMIT 1`,
      [],
    )
    const names = new Set(found.rows.map(row => String(row[0])))
    const missing = PREADMISSION_TABLES.filter(name => !names.has(name))
    return missing.length === 0
      ? { kind: 'verified' }
      : { kind: 'failed', diagnostic: `missing tables: ${missing.join(',')}` }
  },
}
export default migration
